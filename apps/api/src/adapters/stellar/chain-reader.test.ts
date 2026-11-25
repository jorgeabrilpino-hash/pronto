import {
  Account,
  Address,
  Keypair,
  nativeToScVal,
  Operation,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  decodeChainOffer,
  decodeInvocation,
  offerLedgerKey,
  StellarChainReader,
} from './chain-reader';
import {
  ACCEPTED_OFFER_ENTRY_XDR,
  ACCEPTED_OFFER_ID,
  ACCEPTED_OFFER_LEDGER_KEY,
  BUYER,
  CREATE_TX_ENVELOPE_XDR,
  CREATE_TX_HASH,
  OPEN_OFFER_ID,
  SUPPLIER,
  USDC_CONTRACT_ID,
  XLM_CONTRACT_ID,
} from './fixtures';
import type { JsonRpcTransport } from './json-rpc';
import { RpcResponseError } from './json-rpc';
import { TESTNET_PASSPHRASE } from './network';

/** Replays canned results per method and records the calls. */
class ReplayTransport implements JsonRpcTransport {
  readonly calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  constructor(private readonly results: Record<string, unknown>) {}
  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, params });
    if (!(method in this.results)) throw new Error(`unexpected method ${method}`);
    return this.results[method] as T;
  }
}

function offerScVal(fields: {
  status?: xdr.ScVal[];
  face?: bigint;
  buyer?: string;
  expires?: bigint;
}): xdr.ScVal {
  return nativeToScVal(
    {
      buyer: new Address(fields.buyer ?? BUYER),
      expires_at: fields.expires ?? 1795716810n,
      face: fields.face ?? 100000000n,
      net: 98500000n,
      status: fields.status ?? [xdr.ScVal.scvSymbol('Open')],
      supplier: new Address(SUPPLIER),
    },
    {
      type: {
        buyer: ['symbol'],
        expires_at: ['symbol', 'u64'],
        face: ['symbol', 'i128'],
        net: ['symbol', 'i128'],
        status: ['symbol'],
        supplier: ['symbol'],
      },
    },
  );
}

function invokeEnvelope(contractId: string, fn: string, args: xdr.ScVal[], ops = 1): string {
  const source = new Account(Keypair.random().publicKey(), '1');
  const builder = new TransactionBuilder(source, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  }).setTimeout(0);
  for (let i = 0; i < ops; i++) {
    builder.addOperation(
      Operation.invokeContractFunction({ contract: contractId, function: fn, args }),
    );
  }
  return builder.build().toXDR();
}

const idArg = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));

describe('offerLedgerKey', () => {
  it('encodes DataKey::Offer(BytesN<32>) exactly as the deployed contract stores it', () => {
    expect(offerLedgerKey(XLM_CONTRACT_ID, ACCEPTED_OFFER_ID).toXDR('base64')).toBe(
      ACCEPTED_OFFER_LEDGER_KEY,
    );
  });
  it('accepts upper case hex and rejects ids that are not 32 bytes', () => {
    expect(offerLedgerKey(XLM_CONTRACT_ID, ACCEPTED_OFFER_ID.toUpperCase()).toXDR('base64')).toBe(
      ACCEPTED_OFFER_LEDGER_KEY,
    );
    expect(() => offerLedgerKey(XLM_CONTRACT_ID, 'abcd')).toThrow(TypeError);
  });
});

describe('decodeChainOffer', () => {
  it('maps Open and Reclaimed and keeps amounts as bigint', () => {
    expect(decodeChainOffer(offerScVal({})).status).toBe('open');
    const reclaimed = decodeChainOffer(offerScVal({ status: [xdr.ScVal.scvSymbol('Reclaimed')] }));
    expect(reclaimed.status).toBe('reclaimed');
    expect(typeof reclaimed.amount).toBe('bigint');
  });
  it('rejects unknown status, wrong types and non struct values', () => {
    expect(() => decodeChainOffer(offerScVal({ status: [xdr.ScVal.scvSymbol('Weird')] }))).toThrow(
      RpcResponseError,
    );
    expect(() => decodeChainOffer(xdr.ScVal.scvU32(1))).toThrow(RpcResponseError);
    const badParty = nativeToScVal({ buyer: 'nope', supplier: 'nope' });
    expect(() => decodeChainOffer(badParty)).toThrow(/parties/);
    const badAmount = nativeToScVal(
      { buyer: new Address(BUYER), supplier: new Address(SUPPLIER), face: 'x' },
      { type: { buyer: ['symbol'], supplier: ['symbol'], face: ['symbol'] } },
    );
    expect(() => decodeChainOffer(badAmount)).toThrow(/amounts/);
  });
});

describe('StellarChainReader.getOffer', () => {
  it('reads and decodes the recorded accepted offer', async () => {
    const transport = new ReplayTransport({
      getLedgerEntries: {
        entries: [{ key: ACCEPTED_OFFER_LEDGER_KEY, xdr: ACCEPTED_OFFER_ENTRY_XDR }],
        latestLedger: 5893257,
      },
    });
    const reader = new StellarChainReader({ contractId: XLM_CONTRACT_ID, transport });
    const offer = await reader.getOffer(ACCEPTED_OFFER_ID);
    expect(offer).toEqual({
      buyer: BUYER,
      supplier: SUPPLIER,
      amount: 100000000n,
      net: 98500000n,
      expiresAt: new Date(1795716810 * 1000),
      status: 'accepted',
    });
    expect(transport.calls).toEqual([
      { method: 'getLedgerEntries', params: { keys: [ACCEPTED_OFFER_LEDGER_KEY] } },
    ]);
    expect(reader.contractId()).toBe(XLM_CONTRACT_ID);
  });

  it('returns null when the entry does not exist', async () => {
    const transport = new ReplayTransport({ getLedgerEntries: { entries: [], latestLedger: 1 } });
    const reader = new StellarChainReader({ contractId: XLM_CONTRACT_ID, transport });
    expect(await reader.getOffer(OPEN_OFFER_ID)).toBeNull();
    const nullEntries = new ReplayTransport({
      getLedgerEntries: { entries: null, latestLedger: 1 },
    });
    expect(
      await new StellarChainReader({
        contractId: XLM_CONTRACT_ID,
        transport: nullEntries,
      }).getOffer(OPEN_OFFER_ID),
    ).toBeNull();
  });

  it('rejects an invalid contract id', () => {
    expect(() => new StellarChainReader({ contractId: BUYER })).toThrow(TypeError);
  });
});

describe('StellarChainReader.getTransaction', () => {
  const reader = (result: unknown) =>
    new StellarChainReader({
      contractId: XLM_CONTRACT_ID,
      transport: new ReplayTransport({ getTransaction: result }),
    });

  it('decodes the recorded create_offer call', async () => {
    const tx = await reader({
      status: 'SUCCESS',
      envelopeXdr: CREATE_TX_ENVELOPE_XDR,
    }).getTransaction(CREATE_TX_HASH);
    expect(tx).toEqual({
      status: 'SUCCESS',
      invocation: { contractId: XLM_CONTRACT_ID, fn: 'create_offer', offerIdHex: OPEN_OFFER_ID },
    });
  });

  it('returns NOT_FOUND and FAILED without an invocation when there is none', async () => {
    expect(await reader({ status: 'NOT_FOUND' }).getTransaction(CREATE_TX_HASH)).toEqual({
      status: 'NOT_FOUND',
    });
    expect(await reader({ status: 'FAILED' }).getTransaction(CREATE_TX_HASH)).toEqual({
      status: 'FAILED',
    });
  });

  it('throws on an unknown status or a malformed hash', async () => {
    await expect(reader({ status: 'PENDING' }).getTransaction(CREATE_TX_HASH)).rejects.toThrow(
      RpcResponseError,
    );
    await expect(reader({ status: 'SUCCESS' }).getTransaction('xyz')).rejects.toThrow(TypeError);
  });
});

describe('decodeInvocation', () => {
  it('decodes accept and reclaim, and reports a foreign contract as such', () => {
    expect(
      decodeInvocation(
        invokeEnvelope(XLM_CONTRACT_ID, 'accept', [idArg(OPEN_OFFER_ID)]),
        TESTNET_PASSPHRASE,
      ),
    ).toEqual({ contractId: XLM_CONTRACT_ID, fn: 'accept', offerIdHex: OPEN_OFFER_ID });
    expect(
      decodeInvocation(
        invokeEnvelope(USDC_CONTRACT_ID, 'reclaim', [idArg(OPEN_OFFER_ID)]),
        TESTNET_PASSPHRASE,
      )?.contractId,
    ).toBe(USDC_CONTRACT_ID);
  });

  it('ignores other functions, bad ids, several operations, non invoke ops and garbage', () => {
    const id = idArg(OPEN_OFFER_ID);
    expect(
      decodeInvocation(invokeEnvelope(XLM_CONTRACT_ID, 'transfer', [id]), TESTNET_PASSPHRASE),
    ).toBeUndefined();
    expect(
      decodeInvocation(
        invokeEnvelope(XLM_CONTRACT_ID, 'accept', [xdr.ScVal.scvBytes(Buffer.alloc(4))]),
        TESTNET_PASSPHRASE,
      ),
    ).toBeUndefined();
    expect(
      decodeInvocation(invokeEnvelope(XLM_CONTRACT_ID, 'accept', []), TESTNET_PASSPHRASE),
    ).toBeUndefined();
    expect(
      decodeInvocation(invokeEnvelope(XLM_CONTRACT_ID, 'accept', [id], 2), TESTNET_PASSPHRASE),
    ).toBeUndefined();
    const payment = new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), {
      fee: '100',
      networkPassphrase: TESTNET_PASSPHRASE,
    })
      .setTimeout(0)
      .addOperation(Operation.bumpSequence({ bumpTo: '5' }))
      .build()
      .toXDR();
    expect(decodeInvocation(payment, TESTNET_PASSPHRASE)).toBeUndefined();
    expect(decodeInvocation('not-xdr', TESTNET_PASSPHRASE)).toBeUndefined();
  });

  it('reads through a fee bump envelope', () => {
    const inner = TransactionBuilder.fromXDR(
      invokeEnvelope(XLM_CONTRACT_ID, 'accept', [idArg(OPEN_OFFER_ID)]),
      TESTNET_PASSPHRASE,
    );
    if (!('operations' in inner) || inner.operations === undefined) throw new Error('bad inner');
    const feeSource = Keypair.random();
    const bump = TransactionBuilder.buildFeeBumpTransaction(
      feeSource,
      '200',
      inner as Parameters<typeof TransactionBuilder.buildFeeBumpTransaction>[2],
      TESTNET_PASSPHRASE,
    ).toXDR();
    expect(decodeInvocation(bump, TESTNET_PASSPHRASE)?.fn).toBe('accept');
  });
});
