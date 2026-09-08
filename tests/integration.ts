import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3001';
let cookie = '';
async function request(path: string, body?: unknown, session = cookie) {
  const response = await fetch(`${base}/api/copilot/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie: session,
      origin: base,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return response;
}
let r = await request('session');
assert.equal(r.status, 200);
cookie = r.headers.get('set-cookie')!.split(';')[0];
async function json(path: string, body?: unknown) {
  const r = await request(path, body);
  assert.equal(r.status, 200, `${path}: ${await r.clone().text()}`);
  return r.json() as Promise<any>;
}
await json('session', { role: 'business', locale: 'fr' });
const c = await json('conversations', { role: 'business', locale: 'fr' });
const req = {
  conversationId: c.id,
  requestId: crypto.randomUUID(),
  message:
    'Développeur React senior à Lyon, hybride. Freelance. Octobre, 3 mois. TJM maximum 650 EUR. Langues : français. Responsabilités : développer les API.',
  locale: 'fr',
  attachmentIds: [],
};
r = await request('respond', req);
assert.equal(r.status, 200);
const stream = await r.text();
assert.match(stream, /event: done/);
assert.doesNotMatch(stream, /event: error/);
let loaded = (await json('conversations')).find((x: any) => x.id === c.id);
assert.equal(loaded.draft.fields.day_rate_max, 650);
const save = {
  actionId: crypto.randomUUID(),
  tool: 'save_mission_draft',
  conversationId: c.id,
  revision: loaded.draft.revision,
  confirmed: false,
  transcriptConsent: false,
};
assert.equal((await request('actions', save)).status, 401);
await json('session', { role: 'business', locale: 'fr', signIn: true });
const saved = await json('actions', save);
assert.equal(saved.private, true);
const again = await json('actions', save);
assert.equal(saved.id, again.id);
assert.equal((await json('drafts')).length, 1);
r = await request('respond', req);
assert.match(r.headers.get('content-type')!, /application\/json/);
assert.equal(((await r.json()) as any).conversation.messages.length, 2);
const other = await request('session', undefined, '');
const otherCookie = other.headers.get('set-cookie')!.split(';')[0];
assert.equal(
  (
    await request(
      'respond',
      { ...req, requestId: crypto.randomUUID() },
      otherCookie,
    )
  ).status,
  404,
);
assert.equal(
  (
    await fetch(`${base}/api/copilot/conversations`, {
      method: 'POST',
      headers: {
        cookie,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ role: 'business', locale: 'fr' }),
    })
  ).status,
  403,
);
await json('session', { role: 'talent', locale: 'en', signIn: true });
assert.equal(
  (await request('actions', { ...save, actionId: crypto.randomUUID() })).status,
  403,
);
const profile = await json('conversations', { role: 'talent', locale: 'en' });
const data = zipSync({
  '[Content_Types].xml': strToU8('<Types/>'),
  'word/document.xml': strToU8(
    '<w:document><w:p><w:r><w:t>Senior Java developer in Paris. 9 years of experience. Java, Spring Boot, AWS. Remote. Available now. Minimum 580, target 620 EUR. Confidential visibility.</w:t></w:r></w:p></w:document>',
  ),
});
const form = new FormData();
form.set(
  'file',
  new File([data], 'fictional-cv.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }),
);
form.set('purpose', 'profile');
form.set('consent', 'true');
r = await fetch(`${base}/api/copilot/files`, {
  method: 'POST',
  headers: { cookie, origin: base },
  body: form,
});
assert.equal(r.status, 200, await r.clone().text());
const file = (await r.json()) as any;
r = await request('respond', {
  conversationId: profile.id,
  requestId: crypto.randomUUID(),
  message: 'Prepare my profile from this CV.',
  locale: 'en',
  attachmentIds: [file.id],
});
const ps = await r.text();
assert.match(ps, /event: done/);
loaded = (await json('conversations')).find((x: any) => x.id === profile.id);
assert.equal(loaded.draft.fields.minimum_day_rate, 580);
await json('actions', {
  ...save,
  actionId: crypto.randomUUID(),
  tool: 'save_profile_draft',
  conversationId: profile.id,
  revision: loaded.draft.revision,
});
assert.equal((await json('drafts')).length, 2);
const support = {
  ...save,
  actionId: crypto.randomUUID(),
  tool: 'create_support_handoff',
  conversationId: profile.id,
  revision: loaded.draft.revision,
};
assert.equal((await request('actions', support)).status, 403);
const handoff = await json('actions', {
  ...support,
  confirmed: true,
  transcriptConsent: true,
});
assert.equal(handoff.status, 'staging_recorded_not_sent');
console.log(
  'PASS: mission intake, CV upload/intake, two private saves, idempotency, reload, anonymous denial, cross-tenant denial, CSRF, role enforcement, consented handoff.',
);
