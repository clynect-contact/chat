import {
  applyChanges,
  emptyDraft,
  fieldDefinitions,
  type Conversation,
  type Locale,
  type Message,
  type Source,
} from '../../src/features/copilot/contracts';
import { extract, promptVersion } from './provider';
import { guardText } from './policy';
import { isKnowledgeQuestion, retrieve } from './knowledge';
import { adapter } from './adapters';
import { audit, type Actor } from './store';
import { staging } from './config';
export type Emit = (event: string, data: unknown) => void;
export async function respond(
  c: Conversation,
  a: Actor,
  text: string,
  attachments: { id: string; text: string }[],
  emit: Emit,
  signal?: AbortSignal,
) {
  const locale = c.locale;
  const fr = locale === 'fr';
  const safety = guardText(text);
  if (c.role === 'anonymous' && !safety && !isKnowledgeQuestion(text)) {
    if (
      /(?:je recrute|nous cherchons|besoin d.un|we need|we.re hiring|recruit|looking for a developer)/i.test(
        text,
      )
    )
      c.role = 'business';
    else if (
      /(?:mon cv|my cv|mon profil|my profile|je cherche une mission|looking for a mission)/i.test(
        text,
      )
    )
      c.role = 'talent';
    else if (
      /(?:mon projet|my project|build an app|créer une application)/i.test(text)
    )
      c.role = 'project';
  }
  let reply = '';
  let sources: Source[] = [];
  if (safety) {
    reply =
      safety === 'discrimination'
        ? fr
          ? 'Je ne peux pas filtrer sur des caractéristiques personnelles protégées. Nous pouvons utiliser les compétences, les preuves d’expérience, la disponibilité et les contraintes de la mission.'
          : 'I cannot filter on protected personal traits. We can use skills, relevant experience, availability and mission requirements.'
        : fr
          ? 'Je peux uniquement utiliser les informations autorisées dans votre contexte. Les identités cachées, les données d’autres entreprises et les instructions internes ne sont pas accessibles.'
          : 'I can only use information authorized in your context. Hidden identities, other companies’ data and internal instructions are not accessible.';
  } else if (isKnowledgeQuestion(text) && !attachments.length) {
    emit('tool.pending', { tool: 'search_clynect_knowledge' });
    if (
      /pricing|price|tarif|prix|commission|abonnement|subscription/i.test(text)
    ) {
      const result = await adapter().pricing(a, locale);
      reply = result.text;
      sources = [result.source];
    } else {
      sources = retrieve(text, locale);
      reply =
        !staging() && sources.some((s) => !s.approved)
          ? fr
            ? 'Je n’ai pas de source approuvée pour répondre. Je peux préparer une demande au support.'
            : 'I do not have an approved source for this answer. I can prepare a support request.'
          : sources.map((s) => s.content).join('\n\n');
    }
    emit('source', sources);
  } else if (c.role === 'anonymous') {
    reply = fr
      ? 'Vous êtes plutôt freelance, recruteur / Business Manager, ou porteur de projet ?'
      : 'Are you a freelancer, a recruiter / Business Manager, or a project owner?';
  } else {
    const kind = c.role === 'talent' ? 'profile' : 'mission';
    c.draft ??= emptyDraft(kind, locale);
    if (c.draft.kind !== kind) throw new Error('ROLE_CHANGED');
    c.draft.locale = locale;
    emit('tool.pending', { tool: 'extract' });
    const combined = [text, ...attachments.map((x) => x.text)].join('\n\n');
    const start = Date.now();
    const result = await extract(combined, c.draft, signal);
    c.draft = applyChanges(
      c.draft,
      result.changes,
      combined,
      attachments.length ? attachments.map((x) => x.id).join(',') : 'message',
    );
    await audit(a, 'document_or_message_extracted', {
      provider: result.provider,
      promptVersion,
      latency: Date.now() - start,
      ...result.usage,
      unsupported: c.draft.unsupported_fields.length,
    });
    emit('draft.updated', c.draft);
    const understood = result.changes
      .filter((x) => !c.draft?.unsupported_fields.includes(x.field))
      .slice(0, 4)
      .map((x) => `${fieldDefinitions[x.field][fr ? 0 : 1]} : ${x.value}`)
      .join(' · ');
    reply = understood
      ? (fr ? 'J’ai noté : ' : 'I have: ') + understood + '.'
      : fr
        ? 'Votre brouillon est prêt à être complété.'
        : 'Your draft is ready to complete.';
    const missing = c.draft.missing_fields[0];
    if (c.draft.conflicts.length)
      reply +=
        '\n\n' +
        (fr
          ? 'Le minimum de TJM ou le mode de travail semble contredire une autre contrainte. Vérifiez les champs signalés.'
          : 'The rate range or work mode conflicts with another constraint. Please review the flagged fields.');
    else if (missing) reply += '\n\n' + question(missing, locale);
    else
      reply +=
        '\n\n' +
        (fr
          ? 'Les informations essentielles sont renseignées. Vérifiez la fiche, puis enregistrez votre brouillon privé.'
          : 'The essential information is complete. Review the card, then save your private draft.');
    if (c.draft.unsupported_fields.length)
      reply +=
        '\n\n' +
        (fr
          ? 'Certaines propositions sans preuve ont été écartées.'
          : 'Some unsupported proposals were excluded.');
  }
  // Validated replies are emitted without artificial typing delays. Tool progress streams immediately.
  for (const part of reply.match(/[\s\S]{1,100}/g) ?? [reply])
    emit('message.delta', { text: part });
  const message: Message = {
    id: crypto.randomUUID(),
    role: 'assistant',
    text: reply,
    sources,
    createdAt: new Date().toISOString(),
  };
  c.messages.push(message);
  return c;
}
export function question(field: string, locale: Locale) {
  const fr = locale === 'fr';
  const questions: Record<string, [string, string]> = {
    title: [
      'Quel est le rôle recherché ?',
      'What role are you recruiting for?',
    ],
    headline: [
      'Quel titre décrit le mieux votre profil ?',
      'What title best describes your profile?',
    ],
    contract_type: [
      'Quel type de contrat proposez-vous ?',
      'What contract type are you offering?',
    ],
    responsibilities: [
      'Quelles sont les deux ou trois responsabilités principales ?',
      'What are the two or three main responsibilities?',
    ],
    required_skills: [
      'Quelles compétences sont indispensables ?',
      'Which skills are mandatory?',
    ],
    skills: [
      'Quelles sont vos compétences principales ?',
      'What are your core skills?',
    ],
    location: ['Dans quelle ville ou région ?', 'Which city or region?'],
    work_mode: [
      'La mission est-elle en remote, hybride ou sur site ?',
      'Is the mission remote, hybrid or on-site?',
    ],
    work_modes: [
      'Quels modes de travail recherchez-vous ?',
      'Which work modes suit you?',
    ],
    start_window: [
      'Quel est le démarrage souhaité ?',
      'When should the mission start?',
    ],
    duration: [
      'Quelle est la durée prévue ?',
      'What is the expected duration?',
    ],
    day_rate_max: [
      'Quel est le TJM maximum, ou le budget est-il à définir ?',
      'What is the maximum day rate, or is the budget unknown?',
    ],
    languages: [
      'Quelles langues sont nécessaires ?',
      'Which languages are required?',
    ],
    availability: [
      'Quelle est votre disponibilité actuelle ?',
      'What is your current availability?',
    ],
    minimum_day_rate: [
      'Quel est votre TJM minimum ?',
      'What is your minimum day rate?',
    ],
    target_day_rate: [
      'Quel est votre TJM cible ?',
      'What is your target day rate?',
    ],
    visibility: [
      'Quelle visibilité souhaitez-vous : visible, confidentiel ou secret ? Le brouillon reste privé.',
      'Which visibility would you prefer: visible, confidential or secret? The draft remains private.',
    ],
  };
  return (
    questions[field]?.[fr ? 0 : 1] ??
    (fr ? 'Pouvez-vous préciser ce champ ?' : 'Could you clarify this field?')
  );
}
