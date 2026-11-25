import {
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { env } from '@/lib/env';
import { wallet } from '@/wallet';

export type OpKind = 'create' | 'accept' | 'reclaim';
export type StepId = 'prepare' | 'sign' | 'send' | 'confirm';
export const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'prepare', label: 'Preparar' },
  { id: 'sign', label: 'Firmar' },
  { id: 'send', label: 'Enviar' },
  { id: 'confirm', label: 'Confirmado' },
];

export interface OpParams {
  kind: OpKind;
  address: string;
  offerIdHex: string;
  /** create_offer only */
  buyer?: string;
  supplier?: string;
  face?: bigint;
  net?: bigint;
  expiresAt?: string;
}

/** The transaction was refused, failed, or did not confirm in time. Never shown as success. */
export class ChainError extends Error {
  readonly kind: 'failed' | 'timeout';
  readonly txHash: string | undefined;
  constructor(kind: 'failed' | 'timeout', txHash?: string) {
    super(kind);
    this.name = 'ChainError';
    this.kind = kind;
    this.txHash = txHash;
  }
}

const FN: Record<OpKind, string> = { create: 'create_offer', accept: 'accept', reclaim: 'reclaim' };
const POLL_LIMIT = 30;
const POLL_MS = 1500;

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
}

function args(p: OpParams) {
  const id = nativeToScVal(hexToBytes(p.offerIdHex), { type: 'bytes' });
  if (p.kind !== 'create') return [id];
  if (!p.buyer || !p.supplier || p.face === undefined || p.net === undefined || !p.expiresAt) {
    throw new ChainError('failed');
  }
  return [
    new Address(p.buyer).toScVal(),
    new Address(p.supplier).toScVal(),
    id,
    nativeToScVal(p.face, { type: 'i128' }),
    nativeToScVal(p.net, { type: 'i128' }),
    nativeToScVal(BigInt(Math.floor(Date.parse(p.expiresAt) / 1000)), { type: 'u64' }),
  ];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One contract call with the CLAUDE.md pattern: fresh account, setTimeout(180), simulate,
 * assemble, sign with the wallet, send, poll getTransaction with a limit. Success only
 * with status SUCCESS. Never two transactions at once from the same account.
 */
export async function runOperation(
  p: OpParams,
  onStep: (s: StepId, txHash?: string) => void,
): Promise<string> {
  onStep('prepare');
  if (env.useMocks) return runMock(p, onStep);
  if (!env.contractId) throw new ChainError('failed');

  const server = new rpc.Server(env.rpcUrl);
  const account = await server.getAccount(p.address);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(new Contract(env.contractId).call(FN[p.kind], ...args(p)))
    .setTimeout(180)
    .build();
  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) throw new ChainError('failed');
  const prepared = rpc.assembleTransaction(built, sim).build();

  onStep('sign');
  const signedXdr = await wallet.sign(prepared.toXDR(), p.address);

  onStep('send');
  const sent = await server.sendTransaction(
    TransactionBuilder.fromXDR(signedXdr, env.networkPassphrase),
  );
  if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') throw new ChainError('failed');

  onStep('confirm', sent.hash);
  for (let i = 0; i < POLL_LIMIT; i++) {
    const res = await server.getTransaction(sent.hash);
    if (res.status === 'SUCCESS') return sent.hash;
    if (res.status === 'FAILED') throw new ChainError('failed', sent.hash);
    await sleep(POLL_MS);
  }
  throw new ChainError('timeout', sent.hash);
}

async function runMock(p: OpParams, onStep: (s: StepId, txHash?: string) => void): Promise<string> {
  const { applyChainOperation } = await import('@/mocks/db');
  await sleep(500);
  onStep('sign');
  await wallet.sign(`mock-tx:${p.kind}`, p.address);
  onStep('send');
  await sleep(500);
  const hash = applyChainOperation(p.kind, p.offerIdHex);
  onStep('confirm', hash);
  await sleep(700);
  return hash;
}
