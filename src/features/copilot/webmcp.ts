import { z } from 'zod';
export function registerComposerTool(stage: (message: string) => void) {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: {
            name: string;
            description: string;
            inputSchema: object;
            annotations: object;
            execute: (input: unknown) => unknown;
          },
          options: { signal: AbortSignal },
        ) => unknown;
      };
    }
  ).modelContext;
  if (!context) return;
  const lifecycle = new AbortController();
  const schema = z
    .object({ message: z.string().trim().min(1).max(12000) })
    .strict();
  try {
    void Promise.resolve(
      context.registerTool(
        {
          name: 'stage_copilot_message',
          description:
            'Place a message in the visible Copilot composer for user review. Does not send, save, publish, or contact anyone.',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', minLength: 1, maxLength: 12000 },
            },
            required: ['message'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) {
            const { message } = schema.parse(input);
            stage(message);
            return { staged: true, sent: false };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {
    lifecycle.abort();
  }
  return () => lifecycle.abort();
}
