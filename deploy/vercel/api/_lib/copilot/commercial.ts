import type { Draft, Locale, Role } from "./contracts.js";

export type CommercialCta = {
  label: string;
  url: string;
  plan: "free" | "start" | "pro" | "unltd";
};
export type SubscriptionOffer = CommercialCta & { price: string; reason: string };
const site = "https://clynect.fr";

export function recommendSubscription(message: string, role: Role, locale: Locale, draft: Draft | null): SubscriptionOffer | null {
  const fr = locale === "fr";
  const pricingIntent = /tarif|prix|abonnement|subscription|pricing|price|plan|co[uû]t|combien/i.test(message);
  const missionIntent = /mission|project|projet|candid|apply|postul|client|opportunit|trouver|chercher|find|search/i.test(message);
  const visibilityIntent = /visibilit|visible|boost|badge|urgent|recherche|profile|profil/i.test(message);
  const commercialIntent = pricingIntent || missionIntent || visibilityIntent;
  if (role === "business" || role === "project") {
    if (!commercialIntent) return null;
    return { plan: "free", price: fr ? "Gratuit" : "Free", reason: fr ? "La publication et la gestion des missions sont gratuites pour les porteurs de projet." : "Publishing and managing missions is free for project owners.", label: fr ? "Créer un compte gratuit" : "Create a free account", url: `${site}/register` };
  }
  const talentContext = role === "talent" || /freelance|d[ée]veloppeur|developer|consultant|sous-traitant/i.test(message);
  const profileReady = draft?.kind === "profile" && draft.completeness_score >= 55;
  if (!talentContext || (!commercialIntent && !profileReady)) return null;
  if (/illimit|unlimited|sans limite|toutes? les missions|maximum|vip|prioritaire|high.?volume/i.test(message))
    return { plan: "unltd", price: "99,00 € / mois", reason: fr ? "UNLTD convient aux freelances qui veulent signer des missions sans plafond, avec visibilité premium et support prioritaire." : "UNLTD suits freelancers who want unlimited signed missions, premium visibility and priority support.", label: fr ? "Passer en UNLTD" : "Choose UNLTD", url: `${site}/billing/subscribe/unltd` };
  if (/plusieurs|multiple|3 missions|urgent|boost|badge|mise en avant|popular|populaire|acc[ée]l[ée]r/i.test(message) || (profileReady && !pricingIntent))
    return { plan: "pro", price: "49,99 € / mois", reason: fr ? "PRO aide à décrocher plusieurs missions grâce à une visibilité renforcée, au badge PRO et à l’accès aux missions urgentes." : "PRO helps win several missions with boosted visibility, a PRO badge and access to urgent missions.", label: fr ? "Découvrir PRO" : "Explore PRO", url: `${site}/billing/subscribe/pro` };
  return { plan: "start", price: "19,99 € / mois", reason: fr ? "START permet de tester Clynect avec les candidatures illimitées, un profil visible, le chat et l’accès aux missions standards." : "START lets you try Clynect with unlimited applications, a visible profile, chat and standard mission access.", label: fr ? "Découvrir START" : "Explore START", url: `${site}/billing/subscribe/start` };
}

export function pricingReply(locale: Locale, offer: SubscriptionOffer) {
  const fr = locale === "fr";
  if (offer.plan === "free") return offer.reason;
  const intro = fr ? "Pour les freelances, Clynect propose trois abonnements sans engagement : START à 19,99 € par mois, PRO à 49,99 € par mois et UNLTD à 99,00 € par mois." : "For freelancers, Clynect offers three subscription plans: START at €19.99/month, PRO at €49.99/month and UNLTD at €99.00/month.";
  const ownerNote = fr ? " La publication des missions reste gratuite pour les porteurs de projet." : " Publishing missions remains free for project owners.";
  return `${intro}${ownerNote}\n\n${offer.reason}`;
}
