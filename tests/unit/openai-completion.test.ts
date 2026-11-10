import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LUNA_DEPLOYMENT,
  completionParams,
  resolveDeployment,
} from '../../src/backend/services/openai-completion';

describe('resolveDeployment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to gpt-6-luna when AZURE_OPENAI_DEPLOYMENT is unset', () => {
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', undefined);

    expect(resolveDeployment()).toBe('gpt-6-luna');
    expect(LUNA_DEPLOYMENT).toBe('gpt-6-luna');
  });

  it('defaults to gpt-6-luna when AZURE_OPENAI_DEPLOYMENT is blank', () => {
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', '  ');

    expect(resolveDeployment()).toBe('gpt-6-luna');
  });

  it('uses AZURE_OPENAI_DEPLOYMENT when it is set', () => {
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', 'my-deployment');

    expect(resolveDeployment()).toBe('my-deployment');
  });

  it('trims whitespace so an exact luna match is not lost', () => {
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', ' gpt-6-luna\n');

    expect(resolveDeployment()).toBe('gpt-6-luna');
  });

  it('prefers an explicit override over the environment', () => {
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', 'from-env');

    expect(resolveDeployment('from-flag')).toBe('from-flag');
  });
});

describe('completionParams', () => {
  it('sends max_completion_tokens, temperature and reasoning_effort none to gpt-6-luna', () => {
    expect(completionParams('gpt-6-luna', { temperature: 0.1, maxCompletionTokens: 500 })).toStrictEqual({
      temperature: 0.1,
      max_completion_tokens: 500,
      reasoning_effort: 'none',
    });
  });

  it('omits reasoning_effort entirely for any other deployment', () => {
    const params = completionParams('some-legacy-deployment', {
      temperature: 0.1,
      maxCompletionTokens: 500,
    });

    expect(params).toStrictEqual({ temperature: 0.1, max_completion_tokens: 500 });
    expect(Object.keys(params)).not.toContain('reasoning_effort');
  });

  it('never emits max_tokens', () => {
    for (const deployment of ['gpt-6-luna', 'some-legacy-deployment']) {
      const params = completionParams(deployment, { temperature: 0, maxCompletionTokens: 10 });

      expect(Object.keys(params)).not.toContain('max_tokens');
    }
  });

  it('keeps a temperature of zero instead of dropping it', () => {
    expect(completionParams('gpt-6-luna', { temperature: 0, maxCompletionTokens: 2500 })).toStrictEqual({
      temperature: 0,
      max_completion_tokens: 2500,
      reasoning_effort: 'none',
    });
  });
});
