import { z } from 'zod';
export const localeSchema = z.enum(['fr', 'en']);
export type Locale = z.infer<typeof localeSchema>;
export const roleSchema = z.enum([
  'anonymous',
  'business',
  'talent',
  'project',
]);
export type Role = z.infer<typeof roleSchema>;
export type Kind = 'mission' | 'profile';
export const fieldDefinitions = {
  title: ['Intitulé', 'Title', 'text'],
  role_family: ['Famille de métier', 'Role family', 'text'],
  seniority: ['Séniorité', 'Seniority', 'text'],
  contract_type: ['Contrat', 'Contract', 'text'],
  headcount: ['Nombre de personnes', 'Headcount', 'number'],
  context: ['Contexte', 'Context', 'text'],
  objectives: ['Objectifs', 'Objectives', 'list'],
  responsibilities: ['Responsabilités', 'Responsibilities', 'list'],
  deliverables: ['Livrables', 'Deliverables', 'list'],
  project_phase: ['Phase du projet', 'Project phase', 'text'],
  required_skills: ['Compétences requises', 'Required skills', 'list'],
  optional_skills: ['Compétences optionnelles', 'Optional skills', 'list'],
  methodologies: ['Méthodologies', 'Methodologies', 'list'],
  tools: ['Outils', 'Tools', 'list'],
  location: ['Localisation', 'Location', 'text'],
  work_mode: ['Mode de travail', 'Work mode', 'text'],
  on_site_days_per_week: [
    'Jours sur site / semaine',
    'On-site days / week',
    'number',
  ],
  travel: ['Déplacements', 'Travel', 'text'],
  start_window: ['Démarrage', 'Start window', 'text'],
  duration: ['Durée', 'Duration', 'text'],
  workload: ['Charge de travail', 'Workload', 'text'],
  currency: ['Devise', 'Currency', 'text'],
  day_rate_min: ['TJM minimum', 'Minimum day rate', 'number'],
  day_rate_max: ['TJM maximum', 'Maximum day rate', 'number'],
  budget_unknown: ['Budget à définir', 'Budget unknown', 'boolean'],
  rate_visibility: ['Visibilité du TJM', 'Rate visibility', 'text'],
  languages: ['Langues', 'Languages', 'list'],
  sector: ['Secteur', 'Sector', 'text'],
  client_type: ['Type de client', 'Client type', 'text'],
  security_clearance: ['Habilitation', 'Clearance', 'text'],
  mandatory_constraints: [
    'Contraintes obligatoires',
    'Mandatory constraints',
    'list',
  ],
  rejection_criteria: ['Critères éliminatoires', 'Rejection criteria', 'list'],
  headline: ['Titre du profil', 'Profile headline', 'text'],
  role_families: ['Métiers', 'Roles', 'list'],
  commercial_summary: ['Présentation', 'Summary', 'text'],
  years_experience: ['Années d’expérience', 'Years of experience', 'number'],
  skills: ['Compétences', 'Skills', 'list'],
  projects: ['Expériences et projets', 'Experience and projects', 'list'],
  sectors: ['Secteurs', 'Sectors', 'list'],
  certifications: ['Certifications', 'Certifications', 'list'],
  target_regions: ['Régions recherchées', 'Target regions', 'list'],
  work_modes: ['Modes de travail', 'Work modes', 'list'],
  max_on_site_days: [
    'Jours sur site maximum',
    'Maximum on-site days',
    'number',
  ],
  travel_radius: ['Mobilité (km)', 'Travel radius (km)', 'number'],
  availability: ['Disponibilité', 'Availability', 'text'],
  estimated_end_date: [
    'Fin de mission estimée',
    'Estimated mission end',
    'text',
  ],
  current_day_rate: ['TJM actuel', 'Current day rate', 'number'],
  minimum_day_rate: ['TJM minimum', 'Minimum day rate', 'number'],
  target_day_rate: ['TJM cible', 'Target day rate', 'number'],
  contract_preferences: ['Contrats recherchés', 'Contract preferences', 'list'],
  visibility: ['Visibilité souhaitée', 'Preferred visibility', 'text'],
  blocked_companies: ['Entreprises bloquées', 'Blocked companies', 'list'],
} as const;
export type Field = keyof typeof fieldDefinitions;
export const missionFields: Field[] = [
  'title',
  'role_family',
  'seniority',
  'contract_type',
  'headcount',
  'context',
  'objectives',
  'responsibilities',
  'deliverables',
  'project_phase',
  'required_skills',
  'optional_skills',
  'methodologies',
  'tools',
  'location',
  'work_mode',
  'on_site_days_per_week',
  'travel',
  'start_window',
  'duration',
  'workload',
  'currency',
  'day_rate_min',
  'day_rate_max',
  'budget_unknown',
  'rate_visibility',
  'languages',
  'sector',
  'client_type',
  'security_clearance',
  'mandatory_constraints',
  'rejection_criteria',
];
export const profileFields: Field[] = [
  'headline',
  'role_families',
  'commercial_summary',
  'years_experience',
  'seniority',
  'skills',
  'projects',
  'sectors',
  'certifications',
  'location',
  'target_regions',
  'work_modes',
  'max_on_site_days',
  'travel_radius',
  'availability',
  'estimated_end_date',
  'currency',
  'current_day_rate',
  'minimum_day_rate',
  'target_day_rate',
  'contract_preferences',
  'languages',
  'visibility',
  'blocked_companies',
];
export const requiredFields: Record<Kind, Field[]> = {
  mission: [
    'title',
    'contract_type',
    'responsibilities',
    'required_skills',
    'location',
    'work_mode',
    'start_window',
    'duration',
    'day_rate_max',
    'languages',
  ],
  profile: [
    'headline',
    'skills',
    'location',
    'work_modes',
    'availability',
    'minimum_day_rate',
    'target_day_rate',
    'visibility',
  ],
};
export const fieldSchema = z.enum(
  Object.keys(fieldDefinitions) as [Field, ...Field[]],
);
const valueSchema = z.union([
  z.string().max(6000),
  z.number().min(0).max(100000000),
  z.boolean(),
  z.array(z.string().max(3000)).max(100),
  z.null(),
]);
export const draftSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['mission', 'profile']),
    locale: localeSchema,
    status: z.literal('draft'),
    fields: z.partialRecord(fieldSchema, valueSchema),
    evidence: z
      .array(
        z.object({
          field: fieldSchema,
          quote: z.string().max(3000),
          source: z.string().max(100),
          origin: z.enum(['explicit', 'suggestion', 'user']),
        }),
      )
      .max(500),
    suggestions_to_confirm: z.array(fieldSchema),
    unsupported_fields: z.array(fieldSchema),
    missing_fields: z.array(fieldSchema),
    conflicts: z.array(z.string()),
    completeness_score: z.number().min(0).max(100),
    revision: z.number().int().min(0),
    saved_revision: z.number().int().nullable(),
    freshness_at: z.string(),
    user_confirmed_at: z.string().nullable(),
  })
  .strict();
export type Draft = z.infer<typeof draftSchema>;
export type Source = {
  id: string;
  title: string;
  version: string;
  content: string;
  approved: boolean;
};
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: Source[];
  createdAt: string;
};
export type Conversation = {
  id: string;
  role: Role;
  locale: Locale;
  title: string;
  messages: Message[];
  draft: Draft | null;
  version: number;
  updatedAt: string;
};
export type Session = {
  authenticated: boolean;
  role: Role;
  roles: Role[];
  locale: Locale;
  provider: 'fixture' | 'openai' | 'unconfigured';
  mode: 'staging' | 'production';
  capabilities: string[];
  displayName: string;
  copilotName: string;
};
export const changeSchema = z
  .object({
    field: fieldSchema,
    value: z.string().max(6000),
    evidence: z.string().max(3000),
    origin: z.enum(['explicit', 'suggestion']),
  })
  .strict();
export const extractionSchema = z
  .object({ changes: z.array(changeSchema).max(80) })
  .strict();
export type Change = z.infer<typeof changeSchema>;
export const respondSchema = z
  .object({
    conversationId: z.uuid(),
    message: z.string().trim().min(1).max(12000),
    locale: localeSchema,
    attachmentIds: z.array(z.uuid()).max(3).default([]),
    requestId: z.uuid(),
  })
  .strict();
export const actionSchema = z
  .object({
    actionId: z.uuid(),
    tool: z.enum([
      'save_mission_draft',
      'save_profile_draft',
      'create_support_handoff',
      'search_matching_missions',
      'search_matching_profiles',
      'get_current_pricing',
    ]),
    conversationId: z.uuid(),
    revision: z.number().int().min(0),
    confirmed: z.boolean().default(false),
    transcriptConsent: z.boolean().default(false),
  })
  .strict();
export type Action = z.infer<typeof actionSchema>;
export function emptyDraft(kind: Kind, locale: Locale): Draft {
  return {
    id: crypto.randomUUID(),
    kind,
    locale,
    status: 'draft',
    fields: {},
    evidence: [],
    suggestions_to_confirm: [],
    unsupported_fields: [],
    missing_fields: [...requiredFields[kind]],
    conflicts: [],
    completeness_score: 0,
    revision: 0,
    saved_revision: null,
    freshness_at: new Date().toISOString(),
    user_confirmed_at: null,
  };
}
export function displayValue(value: Draft['fields'][Field]): string {
  return Array.isArray(value)
    ? value.join(', ')
    : value == null
      ? ''
      : String(value);
}
export function parseField(field: Field, text: string): Draft['fields'][Field] {
  const type = fieldDefinitions[field][2];
  if (!text.trim()) return null;
  if (type === 'list')
    return text
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  if (type === 'number') {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100000000)
      throw new Error('INVALID_FIELD');
    if (['on_site_days_per_week', 'max_on_site_days'].includes(field) && n > 7)
      throw new Error('INVALID_FIELD');
    return n;
  }
  if (type === 'boolean') {
    if (!['true', 'false'].includes(text)) throw new Error('INVALID_FIELD');
    return text === 'true';
  }
  if (
    field === 'visibility' &&
    !['visible', 'confidential', 'secret'].includes(text)
  )
    throw new Error('INVALID_FIELD');
  return text;
}
export function completeDraft(d: Draft): Draft {
  const allowed = d.kind === 'mission' ? missionFields : profileFields;
  d.fields = Object.fromEntries(
    Object.entries(d.fields).filter(([k]) => allowed.includes(k as Field)),
  );
  d.missing_fields = requiredFields[d.kind].filter((f) => {
    if (f === 'day_rate_max' && d.fields.budget_unknown === true) return false;
    const v = d.fields[f];
    return (
      v == null ||
      v === '' ||
      (Array.isArray(v) && v.length === 0) ||
      d.suggestions_to_confirm.includes(f)
    );
  });
  d.completeness_score = Math.round(
    100 * (1 - d.missing_fields.length / requiredFields[d.kind].length),
  );
  d.conflicts = [];
  const min =
      d.kind === 'mission' ? d.fields.day_rate_min : d.fields.minimum_day_rate,
    max =
      d.kind === 'mission' ? d.fields.day_rate_max : d.fields.target_day_rate;
  if (typeof min === 'number' && typeof max === 'number' && min > max)
    d.conflicts.push('rate_range');
  if (
    d.fields.work_mode === 'remote' &&
    Number(d.fields.on_site_days_per_week) > 0
  )
    d.conflicts.push('remote_onsite');
  return draftSchema.parse(d);
}
export function applyChanges(
  draft: Draft,
  changes: Change[],
  sourceText: string,
  source = 'message',
): Draft {
  const d = structuredClone(draft);
  for (const change of changes) {
    if (
      !(d.kind === 'mission' ? missionFields : profileFields).includes(
        change.field,
      )
    )
      continue;
    const supported =
      change.origin === 'explicit' &&
      change.evidence.trim().length > 0 &&
      sourceText
        .toLocaleLowerCase()
        .includes(change.evidence.toLocaleLowerCase());
    if (!supported) {
      if (!d.unsupported_fields.includes(change.field))
        d.unsupported_fields.push(change.field);
      continue;
    }
    try {
      d.fields[change.field] = parseField(change.field, change.value);
    } catch {
      continue;
    }
    d.evidence = d.evidence.filter((e) => e.field !== change.field);
    d.evidence.push({
      field: change.field,
      quote: change.evidence,
      source,
      origin: 'explicit',
    });
    d.unsupported_fields = d.unsupported_fields.filter(
      (f) => f !== change.field,
    );
    d.suggestions_to_confirm = d.suggestions_to_confirm.filter(
      (f) => f !== change.field,
    );
  }
  d.revision++;
  d.freshness_at = new Date().toISOString();
  return completeDraft(d);
}
// Canonical adapter payloads. Identity and tenant ownership are injected by the server adapter.
export function canonicalDraft(d: Draft) {
  const f = d.fields;
  const evidenceFor = (field: Field) =>
    d.evidence.filter((e) => e.field === field);
  const names = (field: Field) =>
    (Array.isArray(f[field]) ? f[field] : []) as string[];
  const common = {
    id: d.id,
    locale: d.locale,
    status: 'draft' as const,
    source_type: d.evidence.some((e) => e.source !== 'message')
      ? 'document'
      : 'conversation',
    source_reference: d.evidence.map((e) => e.source),
    missing_fields: d.missing_fields,
    user_confirmed_at: d.user_confirmed_at,
  };
  if (d.kind === 'mission')
    return {
      ...f,
      ...common,
      location: { city: f.location ?? null, region: null, country: null },
      required_skills: names('required_skills').map((name) => ({
        name,
        level: null,
        evidence: evidenceFor('required_skills'),
      })),
      explicit_facts: d.evidence,
      suggestions_to_confirm: d.suggestions_to_confirm,
      conflicts: d.conflicts,
      completeness_score: d.completeness_score,
    };
  return {
    ...f,
    ...common,
    location: { city: f.location ?? null },
    skills: names('skills').map((name) => ({
      name,
      level: null,
      years: null,
      last_used: null,
      evidence_ids: evidenceFor('skills').map((_, i) => `skills-${i}`),
    })),
    projects: names('projects').map((description) => ({ description })),
    languages: names('languages').map((name) => ({
      name,
      CEFR_or_label: null,
    })),
    source_spans: d.evidence,
    unsupported_fields: d.unsupported_fields,
    freshness_at: d.freshness_at,
    reveal_consent: false,
    anonymized_presentation_consent: false,
  };
}
