import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Every chat-completion request the app builds ends in this mocked SDK call, so
// the assertions below pin the exact request body each deployment will receive.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('openai', () => ({
  AzureOpenAI: class {
    chat = { completions: { create: createMock } };
  },
}));

type AgentModule = typeof import('../../src/backend/services/agent');
type RecognitionModule = typeof import('../../src/backend/services/invoice-recognition');

interface Modules {
  agent: AgentModule;
  recognition: RecognitionModule;
}

interface RequestSite {
  name: string;
  call: (modules: Modules) => Promise<unknown>;
  reply: string;
  temperature: number;
  maxCompletionTokens: number;
  sendsTools: boolean;
}

const RECOGNIZED_INVOICE = JSON.stringify({
  vendorName: 'Test SIA',
  invoiceNumber: 'T-1',
  invoiceDate: '2026-01-15',
  currency: 'EUR',
  lines: [],
  subtotal: 0,
  vatAmount: 0,
  total: 0,
  confidence: 'high',
});

const SITES: RequestSite[] = [
  {
    name: 'chat agent',
    call: ({ agent }) => agent.handleChat({ message: 'hello', history: [], userId: 'user-1' }),
    reply: 'Hello',
    temperature: 0.1,
    maxCompletionTokens: 2000,
    sendsTools: true,
  },
  {
    name: 'item parser',
    call: ({ agent }) => agent.parseItemDescription('a box of pens'),
    reply: '{}',
    temperature: 0.1,
    maxCompletionTokens: 500,
    sendsTools: false,
  },
  {
    name: 'invoice parser',
    call: ({ agent }) => agent.parseInvoiceDescription('invoice for consulting'),
    reply: '{}',
    temperature: 0.1,
    maxCompletionTokens: 800,
    sendsTools: false,
  },
  {
    name: 'contact parser',
    call: ({ agent }) => agent.parseContactDescription('Test SIA, a vendor'),
    reply: '{}',
    temperature: 0.1,
    maxCompletionTokens: 600,
    sendsTools: false,
  },
  {
    name: 'asset parser',
    call: ({ agent }) => agent.parseAssetDescription('a laptop for 1200 EUR'),
    reply: '{}',
    temperature: 0.1,
    maxCompletionTokens: 500,
    sendsTools: false,
  },
  {
    name: 'invoice recognition',
    call: ({ recognition }) => recognition.recognizeInvoice('AAAA', 'image/png'),
    reply: RECOGNIZED_INVOICE,
    temperature: 0,
    maxCompletionTokens: 2500,
    sendsTools: false,
  },
];

function chatCompletion(content: string) {
  return {
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  };
}

function expectedBody(site: RequestSite, model: string, extra: Record<string, unknown>) {
  return {
    model,
    messages: expect.any(Array),
    ...(site.sendsTools ? { tools: expect.any(Array) } : {}),
    temperature: site.temperature,
    max_completion_tokens: site.maxCompletionTokens,
    ...extra,
  };
}

// agent.ts pulls in most of the backend, so the first import is slow on a busy machine.
const LOAD_TIMEOUT_MS = 60_000;

// agent.ts resolves the deployment once at module load, so each scenario
// imports a fresh copy with the environment it wants to exercise.
async function loadModules(deployment: string | undefined): Promise<Modules> {
  vi.resetModules();
  vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://example.invalid');
  vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-key');
  vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', deployment);
  return {
    agent: await import('../../src/backend/services/agent'),
    recognition: await import('../../src/backend/services/invoice-recognition'),
  };
}

async function sendRequest(site: RequestSite, modules: Modules): Promise<Record<string, unknown>> {
  createMock.mockResolvedValue(chatCompletion(site.reply));

  await site.call(modules);

  expect(createMock).toHaveBeenCalledTimes(1);
  return createMock.mock.calls[0][0];
}

describe('chat completion request bodies on gpt-6-luna', () => {
  let modules: Modules;

  beforeAll(async () => {
    modules = await loadModules('gpt-6-luna');
  }, LOAD_TIMEOUT_MS);
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    createMock.mockReset();
  });

  it.each(SITES)(
    '$name sends max_completion_tokens, its temperature and reasoning_effort none',
    async (site) => {
      const body = await sendRequest(site, modules);

      expect(body).toStrictEqual(expectedBody(site, 'gpt-6-luna', { reasoning_effort: 'none' }));
    },
  );

  it.each(SITES)('$name never sends max_tokens', async (site) => {
    const body = await sendRequest(site, modules);

    expect(Object.keys(body)).not.toContain('max_tokens');
  });
});

describe('chat completion request bodies on a legacy deployment', () => {
  let modules: Modules;

  beforeAll(async () => {
    modules = await loadModules('gpt-4o');
  }, LOAD_TIMEOUT_MS);
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    createMock.mockReset();
  });

  // The live app setting still names a legacy deployment until it is flipped, and
  // those deployments answer HTTP 400 to reasoning_effort.
  it.each(SITES)(
    '$name sends the previous body with max_tokens renamed and no reasoning_effort',
    async (site) => {
      const body = await sendRequest(site, modules);

      expect(body).toStrictEqual(expectedBody(site, 'gpt-4o', {}));
      expect(Object.keys(body)).not.toContain('reasoning_effort');
    },
  );

  it.each(SITES)('$name never sends max_tokens', async (site) => {
    const body = await sendRequest(site, modules);

    expect(Object.keys(body)).not.toContain('max_tokens');
  });
});

describe('chat completion request bodies with no deployment configured', () => {
  let modules: Modules;

  beforeAll(async () => {
    modules = await loadModules(undefined);
  }, LOAD_TIMEOUT_MS);
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    createMock.mockReset();
  });

  it.each(SITES)('$name defaults to gpt-6-luna with reasoning_effort none', async (site) => {
    const body = await sendRequest(site, modules);

    expect(body).toStrictEqual(expectedBody(site, 'gpt-6-luna', { reasoning_effort: 'none' }));
  });
});
