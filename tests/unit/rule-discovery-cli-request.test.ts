import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// scripts/rule-discovery.ts runs main() on import, so it is exercised as a real
// process against a local fake Azure OpenAI endpoint that records the wire body.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI_TIMEOUT_MS = 120_000;

interface RecordedRequest {
  url: string;
  body: Record<string, unknown>;
}

describe('rule-discovery CLI request body', () => {
  let server: Server;
  let endpoint: string;
  let workDir: string;
  let amendmentPath: string;
  const requests: RecordedRequest[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        requests.push({
          url: req.url ?? '',
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 0,
            model: 'test',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: JSON.stringify({ proposedChanges: [] }) },
              },
            ],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    workDir = await mkdtemp(join(tmpdir(), 'era-rule-discovery-'));
    amendmentPath = join(workDir, 'amendment.txt');
    await writeFile(
      amendmentPath,
      '§ 12. Fixed assets are depreciated over their useful life.\n§ 13. Inventory is valued at cost.\n',
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(workDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    requests.length = 0;
  });

  function runCli(extraArgs: string[]): Promise<{ code: number | null; stderr: string }> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AZURE_OPENAI_ENDPOINT: endpoint,
      AZURE_OPENAI_API_KEY: 'test-key',
      NO_PROXY: '127.0.0.1',
    };
    delete env.AZURE_OPENAI_DEPLOYMENT;

    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/rule-discovery.ts',
          '--text',
          amendmentPath,
          '--out',
          join(workDir, 'report.md'),
          ...extraArgs,
        ],
        { cwd: REPO_ROOT, env },
      );
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stderr }));
    });
  }

  it(
    'sends max_completion_tokens and reasoning_effort none to gpt-6-luna by default',
    async () => {
      const run = await runCli([]);

      expect(run.code, run.stderr).toBe(0);
      expect(requests).toHaveLength(1);
      expect(requests[0].body).toStrictEqual({
        model: 'gpt-6-luna',
        messages: expect.any(Array),
        temperature: 0,
        max_completion_tokens: 4000,
        reasoning_effort: 'none',
      });
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'sends the previous body with max_tokens renamed when --deployment names a legacy deployment',
    async () => {
      const run = await runCli(['--deployment', 'gpt-4o']);

      expect(run.code, run.stderr).toBe(0);
      expect(requests).toHaveLength(1);
      expect(requests[0].body).toStrictEqual({
        model: 'gpt-4o',
        messages: expect.any(Array),
        temperature: 0,
        max_completion_tokens: 4000,
      });
    },
    CLI_TIMEOUT_MS,
  );
});
