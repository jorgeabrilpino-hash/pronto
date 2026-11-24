/**
 * Minimal Stellar RPC JSON-RPC transport. The chain reader talks raw JSON so unit tests can
 * replay recorded responses; the SDK is used only to encode and decode XDR.
 */

export interface JsonRpcTransport {
  call<T>(method: string, params: Record<string, unknown>): Promise<T>;
}

/** The RPC could not be reached (network error, timeout, 5xx or 429) after every retry. */
export class RpcUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RpcUnavailableError';
  }
}

/** The RPC answered with a JSON-RPC error object or a malformed body. Not retried. */
export class RpcResponseError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'RpcResponseError';
  }
}

export interface FetchJsonRpcOptions {
  url: string;
  /** Total attempts, including the first one. Default 3. */
  attempts?: number;
  /** Delay before the second attempt; doubles on each retry. Default 300 ms. */
  baseDelayMs?: number;
  /** Per request timeout. Default 15 s. */
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class RetryableError extends Error {}

export class FetchJsonRpcTransport implements JsonRpcTransport {
  private readonly url: string;
  private readonly attempts: number;
  private readonly baseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private nextId = 1;

  constructor(options: FetchJsonRpcOptions) {
    this.url = options.url;
    this.attempts = Math.max(1, options.attempts ?? 3);
    this.baseDelayMs = options.baseDelayMs ?? 300;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        return await this.once<T>(method, params);
      } catch (err) {
        if (!(err instanceof RetryableError)) throw err;
        lastError = err;
        if (attempt < this.attempts) await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new RpcUnavailableError(
      `Stellar RPC unreachable at ${this.url} after ${this.attempts} attempts (${method}): ${reason}`,
      { cause: lastError },
    );
  }

  private async once<T>(method: string, params: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // fetch rejects only on network failures and aborts (timeouts): both are retryable.
      throw new RetryableError(err instanceof Error ? err.message : String(err), { cause: err });
    }
    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`HTTP ${res.status}`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new RpcResponseError(`Non JSON response from RPC (HTTP ${res.status})`);
    }
    if (typeof body !== 'object' || body === null) {
      throw new RpcResponseError('Malformed JSON-RPC response');
    }
    const envelope = body as { result?: unknown; error?: { code?: number; message?: string } };
    if (envelope.error !== undefined) {
      throw new RpcResponseError(
        `RPC error in ${method}: ${envelope.error.message ?? 'unknown'}`,
        envelope.error.code,
      );
    }
    if (envelope.result === undefined) {
      throw new RpcResponseError(`RPC response without result (${method})`);
    }
    return envelope.result as T;
  }
}
