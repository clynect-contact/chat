import type { Locale, Source } from "./contracts.js";
export const knowledge: Record<Locale, Source[]> = {
  fr: [
    {
      id: "product",
      title: "Spécification Clynect · produit",
      version: "2026-09-03 · staging",
      approved: false,
      content:
        "Clynect est une plateforme de sourcing IT et de mise en relation. Cly vous aide à structurer une mission ou un profil. Cly est un Copilot IA, pas un recruteur humain.",
    },
    {
      id: "drafts",
      title: "Spécification Clynect · fiches privées",
      version: "2026-09-03 · staging",
      approved: false,
      content:
        "Les missions et profils sont enregistrés dans des fiches privées. Une publication, une candidature ou une prise de contact nécessite une validation distincte. Ces actions ne sont pas activées dans cette version.",
    },
    {
      id: "privacy",
      title: "Spécification Clynect · confidentialité",
      version: "2026-09-03 · staging",
      approved: false,
      content:
        "La spécification prévoit les modes Visible, Confidentiel et Secret, ainsi que les entreprises bloquées. Ce document ne remplace pas la politique de confidentialité approuvée. Je n’ai pas de source juridique approuvée et je peux préparer une demande au support.",
    },
  ],
  en: [
    {
      id: "product",
      title: "Clynect specification · product",
      version: "2026-09-03 · staging",
      approved: false,
      content:
        "Clynect is an IT sourcing and connection platform. Cly helps structure missions and profiles. Cly is an AI Copilot, not a human recruiter.",
    },
    {
      id: "drafts",
      title: "Clynect specification · drafts",
      version: "2026-09-03 · staging",
      approved: false,
      content:
        "Missions and profiles are saved as private drafts. Publishing, applying or contacting someone requires a separate confirmation. These actions are not enabled in this version.",
    },
    {
      id: "privacy",
      title: "Clynect specification · privacy",
      version: "2026-09-03 · staging",
      approved: false,
      content:
        "The specification describes Visible, Confidential and Secret modes, and blocked companies. It does not replace an approved privacy policy. I do not have an approved legal source and can prepare a support request.",
    },
  ],
};
export function retrieve(text: string, locale: Locale) {
  const topic =
    /privacy|confident|secret|donn[ée]es|legal|juridique|retention|rgpd|gdpr/i.test(
      text,
    )
      ? "privacy"
      : /draft|brouillon|publish|publier|application|candidature/i.test(text)
        ? "drafts"
        : "product";
  return knowledge[locale].filter((s) => s.id === topic);
}
export function isKnowledgeQuestion(text: string) {
  return /clynect|pricing|price|tarif|prix|commission|abonnement|subscription|privacy|confidentialit|rgpd|gdpr|politique|legal|juridique|how.*work|comment.*fonctionne/i.test(
    text,
  );
}
