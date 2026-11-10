// Request shape for Azure OpenAI chat completions.
//
// The legacy deployments (retiring 2027-04-14) and gpt-6-luna disagree on three
// parameters (MEASURED live on api-version 2024-10-21):
//   - max_tokens: luna answers HTTP 400; max_completion_tokens works on both.
//   - reasoning_effort: the legacy deployments answer HTTP 400; luna needs "none"
//     so reasoning tokens are not billed as output.
//   - temperature: luna accepts it ONLY together with reasoning_effort "none".
//
// Every call site builds its sampling parameters here, keyed on the deployment
// the process resolved at runtime. The app keeps talking to the legacy
// deployment until AZURE_OPENAI_DEPLOYMENT is flipped, so both bodies must work.

import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

export const LUNA_DEPLOYMENT = 'gpt-6-luna';

/** Explicit override, else AZURE_OPENAI_DEPLOYMENT, else gpt-6-luna. */
export function resolveDeployment(override?: string): string {
  return override?.trim() || process.env.AZURE_OPENAI_DEPLOYMENT?.trim() || LUNA_DEPLOYMENT;
}

export interface CompletionLimits {
  temperature: number;
  maxCompletionTokens: number;
}

export type CompletionParams = Pick<
  ChatCompletionCreateParamsNonStreaming,
  'temperature' | 'max_completion_tokens' | 'reasoning_effort'
>;

/**
 * Sampling parameters for one chat completion. The legacy body is exactly the
 * previous one with max_tokens renamed; only an exact gpt-6-luna match adds
 * reasoning_effort.
 */
export function completionParams(
  deployment: string,
  { temperature, maxCompletionTokens }: CompletionLimits,
): CompletionParams {
  const params: CompletionParams = { temperature, max_completion_tokens: maxCompletionTokens };
  return deployment === LUNA_DEPLOYMENT ? { ...params, reasoning_effort: 'none' } : params;
}
