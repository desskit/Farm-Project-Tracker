/**
 * AI "Suggest steps" — replaces the prototype's offline keyword-matching
 * placeholder (js/store.js suggestSteps) with a real Claude call. Given a
 * project name and description, returns a validated list of concrete task
 * steps a farm crew can act on.
 *
 * Env-gated: if ANTHROPIC_API_KEY is unset the feature is treated as
 * unavailable, and the UI hides the button (aiSuggestConfigured()).
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { DataError } from '@/lib/data/errors';

export type SuggestedStep = { title: string; description?: string };

const StepsSchema = z.object({
  steps: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional(),
    }),
  ),
});

/** Whether AI suggestions are available on this server (an API key is set). */
export function aiSuggestConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function suggestSteps(name: string, description?: string): Promise<SuggestedStep[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new DataError('AI suggestions are not set up on this server.', 503);
  }

  const client = new Anthropic();
  const detail = description?.trim() ? `\n\nDetails from the project owner:\n${description.trim()}` : '';
  const prompt =
    `You are helping a small farm crew break a project into a practical, ordered checklist of tasks.\n\n` +
    `Project: "${name.trim()}"${detail}\n\n` +
    `Return 4–8 concrete steps in the order they should be done. Each step should be a short, ` +
    `action-oriented task title (e.g. "Set corner and gate posts in concrete"). Add a one-line ` +
    `description only when it adds genuinely useful detail; otherwise leave it out. Keep it grounded ` +
    `in real farm work — permits, materials, site prep, the build itself, and a final check.`;

  let res;
  try {
    res = await client.messages.parse({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      output_config: { effort: 'low', format: zodOutputFormat(StepsSchema) },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[ai] suggest-steps failed', e);
    throw new DataError('Could not reach the AI service. Try again in a moment.', 502);
  }

  const parsed = res.parsed_output;
  if (!parsed) throw new DataError('The AI response could not be read. Try again.', 502);

  return parsed.steps
    .slice(0, 10)
    .map((s) => ({ title: s.title.trim(), description: s.description?.trim() || undefined }))
    .filter((s) => s.title.length > 0);
}
