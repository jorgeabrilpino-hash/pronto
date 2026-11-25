import {
  Address,
  FeeBumpTransaction,
  StrKey,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import type { ChainInvocation, ChainReader, ChainTransaction } from '../../application/ports';
import type { ChainOffer } from '../../domain/types';
import { FetchJsonRpcTransport, type JsonRpcTransport, RpcResponseError } from './json-rpc';
import { TESTNET_PASSPHRASE, TESTNET_RPC_URL } from './network';

const HEX32 = /^[0-9a-fA-F]{64}$/;
const INVOKED_FUNCTIONS = new Set<ChainInvocation['fn']>(['create_offer', 'accept', 'reclaim']);

function assertHex32(value: string, what: string): string {
  if (!HEX32.test(value)) throw new TypeError(`${what} must be 64 hex characters`);
  return value.toLowerCase();
}

/**
 * Ledger key of `DataKey::Offer(BytesN<32>)` in persistent storage. A `#[contracttype]` enum
 * tuple variant encodes as `ScVal::Vec([Symbol("Offer"), Bytes(id)])`; verified against the
 * deployed XLM instance with `getLedgerEntries` (B3).
 */
export function offerLedgerKey(contractId: string, offerIdHex: string): xdr.LedgerKey {
  const id = Buffer.from(assertHex32(offerIdHex, 'offerIdHex'), 'hex');
  const key = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Offer'), xdr.ScVal.scvBytes(id)]);
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isAccountOrContract(v: unknown): v is string {
  return typeof v === 'string' && (StrKey.isValidEd25519PublicKey(v) || StrKey.isValidContract(v));
}

/** Decodes the stored `Offer` struct. Throws on any shape the contract cannot produce. */
export function decodeChainOffer(value: xdr.ScVal): ChainOffer {
  const native: unknown = scValToNative(value);
  if (!isRecord(native)) throw new RpcResponseError('Offer entry is not a struct');
  const { buyer, supplier, face, net, expires_at: expiresAt, status } = native;
  if (!isAccountOrContract(buyer) || !isAccountOrContract(supplier)) {
    throw new RpcResponseError('Offer entry has invalid parties');
  }
  if (typeof face !== 'bigint' || typeof net !== 'bigint' || typeof expiresAt !== 'bigint') {
    throw new RpcResponseError('Offer entry has invalid amounts or expiry');
  }
  const variant = Array.isArray(status) && status.length === 1 ? status[0] : undefined;
  const mapped =
    variant === 'Open'
      ? 'open'
      : variant === 'Accepted'
        ? 'accepted'
        : variant === 'Reclaimed'
          ? 'reclaimed'
          : null;
  if (mapped === null) throw new RpcResponseError('Offer entry has an unknown status');
  return {
    buyer,
    supplier,
    amount: face,
    net,
    // Seconds fit comfortably in a double; amounts stay bigint.
    expiresAt: new Date(Number(expiresAt) * 1000),
    status: mapped,
  };
}

/**
 * Contract call made by a transaction envelope, or undefined when it is not a single
 * `create_offer`, `accept` or `reclaim` invocation whose first argument is a 32 byte id.
 */
export function decodeInvocation(
  envelopeXdr: string,
  networkPassphrase: string,
): ChainInvocation | undefined {
  let parsed: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    parsed = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase);
  } catch {
    return undefined;
  }
  const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
  if (tx.operations.length !== 1) return undefined;
  const op = tx.operations[0];
  if (op === undefined || op.type !== 'invokeHostFunction') return undefined;
  const func = op.func;
  if (func.type !== 'hostFunctionTypeInvokeContract') return undefined;
  const call = func.invokeContract;
  const fn = call.functionName.toString();
  if (!INVOKED_FUNCTIONS.has(fn as ChainInvocation['fn'])) return undefined;
  const first = call.args[0];
  if (first === undefined) return undefined;
  const idBytes: unknown = scValToNative(first);
  if (!(idBytes instanceof Uint8Array) || idBytes.length !== 32) return undefined;
  let contractId: string;
  try {
    contractId = Address.fromScAddress(call.contractAddress).toString();
  } catch {
    return undefined;
  }
  return {
    contractId,
    fn: fn as ChainInvocation['fn'],
    offerIdHex: Buffer.from(idBytes).toString('hex'),
  };
}

interface RawLedgerEntries {
  entries?: Array<{ key: string; xdr: string }> | null;
  latestLedger: number;
}

interface RawTransaction {
  status: string;
  envelopeXdr?: string;
}

export interface StellarChainReaderOptions {
  contractId: string;
  transport?: JsonRpcTransport;
  networkPassphrase?: string;
}

/** `ChainReader` over Stellar RPC (TESTNET). Reads the current contract state, not history. */
export class StellarChainReader implements ChainReader {
  private readonly contract: string;
  private readonly transport: JsonRpcTransport;
  private readonly passphrase: string;

  constructor(options: StellarChainReaderOptions) {
    if (!StrKey.isValidContract(options.contractId)) {
      throw new TypeError('contractId must be a valid C... contract address');
    }
    this.contract = options.contractId;
    this.transport = options.transport ?? new FetchJsonRpcTransport({ url: TESTNET_RPC_URL });
    this.passphrase = options.networkPassphrase ?? TESTNET_PASSPHRASE;
  }

  contractId(): string {
    return this.contract;
  }

  async getOffer(offerIdHex: string): Promise<ChainOffer | null> {
    const key = offerLedgerKey(this.contract, offerIdHex).toXDR('base64');
    const res = await this.transport.call<RawLedgerEntries>('getLedgerEntries', { keys: [key] });
    const entry = (res.entries ?? []).find((e) => e.key === key);
    if (entry === undefined) return null;
    const data = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
    if (data.type !== 'contractData') {
      throw new RpcResponseError('Ledger entry is not contract data');
    }
    return decodeChainOffer(data.contractData.val);
  }

  async getTransaction(hash: string): Promise<ChainTransaction> {
    const txHash = assertHex32(hash, 'hash');
    const res = await this.transport.call<RawTransaction>('getTransaction', { hash: txHash });
    if (res.status === 'NOT_FOUND') return { status: 'NOT_FOUND' };
    if (res.status !== 'SUCCESS' && res.status !== 'FAILED') {
      throw new RpcResponseError(`Unknown transaction status: ${res.status}`);
    }
    const invocation =
      res.envelopeXdr === undefined
        ? undefined
        : decodeInvocation(res.envelopeXdr, this.passphrase);
    return invocation === undefined ? { status: res.status } : { status: res.status, invocation };
  }
}
