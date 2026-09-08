import type { Field, Locale } from './contracts';
export const options: Partial<Record<Field, string[]>> = {
  work_mode: ['remote', 'hybrid', 'onsite'],
  visibility: ['visible', 'confidential', 'secret'],
  availability: [
    'available_now',
    '2_weeks',
    '1_month',
    '2_months',
    'on_mission_open',
    'unavailable',
  ],
  budget_unknown: ['true', 'false'],
};
export function optionLabel(value: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    remote: ['Remote', 'Remote'],
    hybrid: ['Hybride', 'Hybrid'],
    onsite: ['Sur site', 'On-site'],
    visible: ['Visible', 'Visible'],
    confidential: ['Confidentiel', 'Confidential'],
    secret: ['Secret', 'Secret'],
    available_now: ['Disponible immédiatement', 'Available now'],
    '2_weeks': ['Dans 2 semaines', 'In 2 weeks'],
    '1_month': ['Dans 1 mois', 'In 1 month'],
    '2_months': ['Dans 2 mois', 'In 2 months'],
    on_mission_open: [
      'En mission, à l’écoute',
      'On a mission, open to opportunities',
    ],
    unavailable: ['Indisponible', 'Unavailable'],
    true: ['Oui', 'Yes'],
    false: ['Non', 'No'],
  };
  return labels[value]?.[locale === 'fr' ? 0 : 1] ?? value;
}
