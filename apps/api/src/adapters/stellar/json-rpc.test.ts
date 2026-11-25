import { describe, expect, it } from 'vitest';
import { FetchJsonRpcTransport, RpcResponseError, RpcUnavailableError } from './json-rpc';

type Step = Error | { status: number; body?: unknown; text?: string };

function scriptedFetch(steps: Step[]) {
  const bodies: unknown[] = [];
  const fn = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const step = steps.shift();
    if (step === undefined) throw new Error('no more steps');
    if (step instanceof Error) throw step;
    const payload = step.text ?? JSON.stringify(step.body);
    return new Response(payload, { status: step.status });
  }) as typeof fetch;
  return { fn, bodies };
}

const sleeps: number[] = [];
const sleep = async (ms: number) => {
  sleeps.push(ms);
};

describe('FetchJsonRpcTransport', () => {
  it('posts a JSON-RPC 2.0 request and returns the result', async () => {
    const { fn, bodies } = scriptedFetch([{ status: 200, body: { result: { ok: 1 } } }]);
    const t = new FetchJsonRpcTransport({ url: 'http://rpc.test', fetchFn: fn, sleep });
    expect(await t.call('getHealth', {})).toEqual({ ok: 1 });
    expect(bodies[0]).toMatchObject({ jsonrpc: '2.0', method: 'getHealth', params: {} });
  });

  it('retries network errors and 5xx/429 with exponential backoff, then succeeds', async () => {
    sleeps.length = 0;
    const { fn } = scriptedFetch([
      new TypeError('fetch failed'),
      { status: 503, text: 'busy' },
      { status: 200, body: { result: 'ok' } },
    ]);
    const t = new FetchJsonRpcTransport({
      url: 'http://rpc.test',
      fetchFn: fn,
      sleep,
      baseDelayMs: 10,
    });
    expect(await t.call('m', {})).toBe('ok');
    expect(sleeps).toEqual([10, 20]);
  });

  it('fails clearly after 3 attempts when the RPC is unreachable', async () => {
    const { fn } = scriptedFetch([
      new TypeError('fetch failed'),
      { status: 429, text: '' },
      new TypeError('fetch failed'),
    ]);
    const t = new FetchJsonRpcTransport({ url: 'http://rpc.test', fetchFn: fn, sleep });
    const err = await t.call('getLedgerEntries', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcUnavailableError);
    expect(String(err)).toMatch(
      /unreachable at http:\/\/rpc\.test after 3 attempts \(getLedgerEntries\)/,
    );
  });

  it('does not retry JSON-RPC errors or malformed bodies', async () => {
    const cases: Step[] = [
      { status: 200, body: { error: { code: -32602, message: 'invalid params' } } },
      { status: 200, text: 'not json' },
      { status: 200, body: { id: 1 } },
      { status: 200, body: null },
      { status: 200, body: { error: {} } },
    ];
    for (const step of cases) {
      const { fn } = scriptedFetch([step]);
      const t = new FetchJsonRpcTransport({ url: 'http://rpc.test', fetchFn: fn, sleep });
      await expect(t.call('m', {})).rejects.toBeInstanceOf(RpcResponseError);
    }
  });
});
