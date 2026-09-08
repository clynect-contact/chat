import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import {
  emptyDraft,
  applyChanges,
  completeDraft,
  parseField,
  canonicalDraft,
  respondSchema,
  actionSchema,
} from '../src/features/copilot/contracts';
import { fixtureExtract } from '../server/copilot/extract';
import { guardText, authorize } from '../server/copilot/policy';
import { extractDocument } from '../server/copilot/files';
import { scenarios } from './eval-corpus';
import type { Actor } from '../server/copilot/store';
for (const s of scenarios)
  test(s.id, () => {
    if (s.category === 'adversarial') {
      assert.equal(guardText(s.text), s.guard);
      if (!s.guard) {
        const d = fixtureExtract(s.text, emptyDraft(s.kind, s.locale));
        assert.equal(d.fields.day_rate_max, undefined);
      }
      return;
    }
    const d = fixtureExtract(s.text, emptyDraft(s.kind, s.locale));
    for (const [key, value] of Object.entries(s.expected))
      assert.deepEqual(
        d.fields[key as keyof typeof d.fields],
        value,
        `${s.id} ${key}`,
      );
    assert.equal(d.status, 'draft');
  });
test('reject unsupported facts instead of applying them', () => {
  const d = applyChanges(
    emptyDraft('profile', 'en'),
    [
      {
        field: 'years_experience',
        value: '20',
        evidence: 'twenty years',
        origin: 'explicit',
      },
    ],
    'I use Java',
  );
  assert.equal(d.fields.years_experience, undefined);
  assert.deepEqual(d.unsupported_fields, ['years_experience']);
});
test('profile cannot receive mission-only fields', () => {
  const d = applyChanges(
    emptyDraft('profile', 'en'),
    [
      {
        field: 'day_rate_max',
        value: '999',
        evidence: '999',
        origin: 'explicit',
      },
    ],
    '999',
  );
  assert.equal(d.fields.day_rate_max, undefined);
});
test('conflicting rates remain visible', () => {
  const d = emptyDraft('mission', 'en');
  d.fields = { day_rate_min: 800, day_rate_max: 650 };
  assert.deepEqual(completeDraft(d).conflicts, ['rate_range']);
});
test('cannot accept privileged owner fields', () => {
  assert.equal(
    respondSchema.safeParse({
      conversationId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      message: 'hello',
      locale: 'en',
      owner_id: 'someone-else',
    }).success,
    false,
  );
});
test('no publishing tool is exposed', () => {
  assert.equal(
    actionSchema.safeParse({
      tool: 'publish',
      actionId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      revision: 0,
    }).success,
    false,
  );
});
const actor: Actor = {
  id: 'a',
  tenant: 'one',
  authenticated: true,
  role: 'business',
  roles: ['business'],
  locale: 'en',
  displayName: 'Demo',
  capabilities: ['save_mission_draft', 'create_support_handoff'],
};
const conversation = {
  id: crypto.randomUUID(),
  role: 'business' as const,
  locale: 'en' as const,
  title: '',
  messages: [],
  draft: emptyDraft('mission', 'en'),
  version: 0,
  updatedAt: new Date().toISOString(),
};
const action = {
  actionId: crypto.randomUUID(),
  conversationId: conversation.id,
  revision: 0,
  tool: 'save_mission_draft' as const,
  confirmed: false,
  transcriptConsent: false,
};
test('anonymous writes are denied', () =>
  assert.throws(
    () => authorize({ ...actor, authenticated: false }, action, conversation),
    /SIGN_IN_REQUIRED/,
  ));
test('missing capability is denied', () =>
  assert.throws(
    () => authorize({ ...actor, capabilities: [] }, action, conversation),
    /FORBIDDEN/,
  ));
test('role switch cannot reuse context', () =>
  assert.throws(
    () => authorize({ ...actor, role: 'talent' }, action, conversation),
    /ROLE_CHANGED/,
  ));
test('stale confirmation is denied', () =>
  assert.throws(
    () => authorize(actor, { ...action, revision: 2 }, conversation),
    /CONFLICT/,
  ));
test('handoff requires transcript and action consent', () =>
  assert.throws(
    () =>
      authorize(
        actor,
        { ...action, tool: 'create_support_handoff' },
        conversation,
      ),
    /CONFIRMATION_REQUIRED/,
  ));
test('negative budgets and impossible onsite days rejected', () => {
  assert.throws(() => parseField('day_rate_max', '-1'));
  assert.throws(() => parseField('on_site_days_per_week', '9'));
});
test('canonical profile never grants consent', () => {
  const payload = canonicalDraft(emptyDraft('profile', 'en'));
  assert.ok('reveal_consent' in payload);
  assert.equal(payload.reveal_consent, false);
  assert.ok('anonymized_presentation_consent' in payload);
  assert.equal(payload.anonymized_presentation_consent, false);
});
test('renamed executable rejected', async () => {
  await assert.rejects(
    () =>
      extractDocument(strToU8('MZ executable'), 'CV.pdf', 'application/pdf'),
    /INVALID_FILE/,
  );
});
test('oversized upload rejected', async () => {
  await assert.rejects(
    () =>
      extractDocument(
        new Uint8Array(10 * 1024 * 1024 + 1),
        'CV.pdf',
        'application/pdf',
      ),
    /FILE_TOO_LARGE/,
  );
});
test('DOCX text extraction preserves professional facts', async () => {
  const data = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      '<w:document><w:p><w:r><w:t>Senior Java developer with nine years of experience in Paris.</w:t></w:r></w:p></w:document>',
    ),
  });
  assert.match(
    await extractDocument(
      data,
      'fictional.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ),
    /Senior Java/,
  );
});
test('macro-bearing DOCX is rejected', async () => {
  const data = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8('<w:p>CV</w:p>'),
    'word/vbaProject.bin': strToU8('macro'),
  });
  await assert.rejects(
    () => extractDocument(data, 'cv.docx', ''),
    /INVALID_FILE/,
  );
});
function pdfFixture(text: string) {
  const stream = `BT /F1 12 Tf 40 100 Td (${text.replace(/[()\\]/g, ' ')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => String(x).padStart(10, '0') + ' 00000 n ')
    .join(
      '\n',
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(pdf);
}
test('PDF extracts real text server-side', async () => {
  const text = await extractDocument(
    pdfFixture('Senior Java developer in Paris with nine years of experience.'),
    'cv.pdf',
    'application/pdf',
  );
  assert.match(text, /Senior Java developer/);
});
test('image-only or blank PDF requests text version', async () => {
  await assert.rejects(
    () => extractDocument(pdfFixture(''), 'scan.pdf', 'application/pdf'),
    /NO_DOCUMENT_TEXT/,
  );
});
test('age is never interpreted as years of experience',()=>{const draft=fixtureExtract('Développeur Java, 30 ans, Paris.',emptyDraft('profile','fr'));assert.equal(draft.fields.years_experience,undefined);});
