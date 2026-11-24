import { describe, expect, it } from 'vitest';
import { StellarChainReader } from './chain-reader';
import {
  ACCEPTED_OFFER_ID,
  BUYER,
  CREATE_TX_HASH,
  OPEN_OFFER_ID,
  SUPPLIER,
  XLM_CONTRACT_ID,
} from './fixtures';

/**
 * Live smoke tests against Stellar TESTNET (public data only). Skip with PRONTO_SKIP_LIVE=1.
 * The transport retries network errors 3 times and then fails with RpcUnavailableError,
 * whose message names the RPC URL, so an offline run is obvious.
 */
describe.skipIf(process.env.PRONTO_SKIP_LIVE === '1')('StellarChainReader (live testnet)', () => {
  const reader = new StellarChainReader({ contractId: XLM_CONTRACT_ID });

  it('reads the accepted offer from current contract state', { timeout: 60_000 }, async () => {
    const offer = await reader.getOffer(ACCEPTED_OFFER_ID);
    console.info('[live] accepted offer status:', offer?.status);
    expect(offer).toMatchObject({
      buyer: BUYER,
      supplier: SUPPLIER,
      amount: 100000000n,
      net: 98500000n,
      status: 'accepted',
    });
  });

  it('reads the open offer created in B3', { timeout: 60_000 }, async () => {
    const offer = await reader.getOffer(OPEN_OFFER_ID);
    console.info('[live] open offer status:', offer?.status);
    expect(offer).toMatchObject({
      buyer: BUYER,
      supplier: SUPPLIER,
      amount: 10000000n,
      net: 9900000n,
    });
  });

  it('returns null for an offer id that was never created', { timeout: 60_000 }, async () => {
    expect(await reader.getOffer('00'.repeat(32))).toBeNull();
  });

  it('decodes the create_offer transaction while the RPC still retains it', {
    timeout: 60_000,
  }, async () => {
    const tx = await reader.getTransaction(CREATE_TX_HASH);
    console.info('[live] create tx status:', tx.status);
    // RPC history is short (about 24 h to 7 days): after that the answer is NOT_FOUND.
    if (tx.status === 'NOT_FOUND') return;
    expect(tx).toEqual({
      status: 'SUCCESS',
      invocation: { contractId: XLM_CONTRACT_ID, fn: 'create_offer', offerIdHex: OPEN_OFFER_ID },
    });
  });

  it('reports NOT_FOUND for an unknown hash', { timeout: 60_000 }, async () => {
    expect(await reader.getTransaction('00'.repeat(32))).toEqual({ status: 'NOT_FOUND' });
  });
});
