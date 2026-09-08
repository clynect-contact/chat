import { AppError } from './errors';
import type { Actor } from './store';
import type {
  Action,
  Conversation,
} from '../../src/features/copilot/contracts';
export const toolCatalog = {
  get_user_context: { risk: 'read', confirmation: false },
  search_clynect_knowledge: { risk: 'read', confirmation: false },
  get_current_pricing: { risk: 'read', confirmation: false },
  upload_and_extract_document: { risk: 'sensitive', confirmation: true },
  save_mission_draft: { risk: 'draft_write', confirmation: false },
  save_profile_draft: { risk: 'draft_write', confirmation: false },
  search_matching_missions: { risk: 'read', confirmation: false },
  search_matching_profiles: { risk: 'read', confirmation: false },
  create_support_handoff: { risk: 'external_or_public', confirmation: true },
  record_copilot_feedback: { risk: 'draft_write', confirmation: false },
} as const;
export function authorize(a: Actor, action: Action, c: Conversation) {
  if (!a.authenticated) throw new AppError('SIGN_IN_REQUIRED', 401);
  if (!a.capabilities.includes(action.tool))
    throw new AppError('FORBIDDEN', 403);
  if (c.role !== a.role) throw new AppError('ROLE_CHANGED', 409);
  if (action.revision !== (c.draft?.revision ?? 0))
    throw new AppError('CONFLICT', 409);
  if (
    action.tool === 'save_mission_draft' &&
    !['business', 'project'].includes(a.role)
  )
    throw new AppError('FORBIDDEN', 403);
  if (action.tool === 'save_profile_draft' && a.role !== 'talent')
    throw new AppError('FORBIDDEN', 403);
  if (
    action.tool === 'create_support_handoff' &&
    (!action.confirmed || !action.transcriptConsent)
  )
    throw new AppError('CONFIRMATION_REQUIRED', 403);
}
export function guardText(
  text: string,
): 'discrimination' | 'restricted' | null {
  if (
    /(?:young developers|under\s*30|moins de\s*30|jeunes uniquement|young only|men only|hommes uniquement|women only|femmes uniquement|white developers|développeurs blancs)/i.test(
      text,
    )
  )
    return 'discrimination';
  if (
    /(?:reveal all|all candidate emails|system prompt|ignore previous instructions|ignore.*instructions précédentes|secret profile.*(?:exists|exist)|profil secret.*existe|full cv library|cvthèque complète|candidate emails|emails des candidats)/i.test(
      text,
    )
  )
    return 'restricted';
  return null;
}
