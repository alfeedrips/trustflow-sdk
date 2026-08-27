import {
  Account,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  Networks,
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { TransactionPipeline } from '../src/tx-pipeline';
import { TrustFlowClient } from '../src/client';
import { TrustFlowError } from '../src/errors';

const CONTRACT_ID = 'CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5';

function makeClient(): TrustFlowClient {
  return new TrustFlowClient({ contractId: CONTRACT_ID, network: 'TESTNET' });
}

function expectValidEnvelopeXdr(xdrString: string): void {
  expect(() => xdr.TransactionEnvelope.fromXDR(xdrString, 'base64')).not.toThrow();
}

function buildUnsignedTx(source: string, fee = BASE_FEE): Transaction {
  const account = new Account(source, '100');
  const contract = new Contract(CONTRACT_ID);
  return new TransactionBuilder(account, { fee, networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call('increment'))
    .setTimeout(30)
    .build();
}

function simSuccess(minResourceFee: string): rpc.Api.SimulateTransactionSuccessResponse {
  return {
    id: '1',
    latestLedger: 100,
    events: [],
    _parsed: true,
    transactionData: new SorobanDataBuilder(),
    minResourceFee,
    result: { auth: [], retval: xdr.ScVal.scvVoid() },
  };
}

function simError(message: string): rpc.Api.SimulateTransactionErrorResponse {
  return { id: '1', latestLedger: 100, events: [], _parsed: true, error: message };
}

describe('TransactionPipeline.assemble', () => {
  afterEach(() => jest.restoreAllMocks());

  it('assembles a transaction whose XDR round-trips', async () => {
    const source = Keypair.random().publicKey();
    jest.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(new Account(source, '100'));

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.assemble({
      sourceAccount: source,
      operations: [new Contract(CONTRACT_ID).call('increment')],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeInstanceOf(Transaction);
    expectValidEnvelopeXdr(result.data.toXDR());
    expect(() => TransactionBuilder.fromXDR(result.data.toXDR(), Networks.TESTNET)).not.toThrow();
  });

  it('surfaces a typed ASSEMBLY_ERROR when the source account cannot be loaded', async () => {
    jest.spyOn(rpc.Server.prototype, 'getAccount').mockRejectedValue(new Error('account not found'));

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.assemble({
      sourceAccount: Keypair.random().publicKey(),
      operations: [new Contract(CONTRACT_ID).call('increment')],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(TrustFlowError);
    expect(result.error.code).toBe('ASSEMBLY_ERROR');
  });
});

describe('TransactionPipeline.prepare', () => {
  afterEach(() => jest.restoreAllMocks());

  it('pads the resource fee reported by simulation onto the transaction fee', async () => {
    const source = Keypair.random().publicKey();
    const tx = buildUnsignedTx(source);
    jest.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue(simSuccess('1000'));

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.prepare(tx, { resourceFeeMultiplier: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number(result.data.fee)).toBe(Number(BASE_FEE) + 2000);
    expectValidEnvelopeXdr(result.data.toXDR());
  });

  it('retries transient simulation failures before succeeding', async () => {
    const tx = buildUnsignedTx(Keypair.random().publicKey());
    const spy = jest
      .spyOn(rpc.Server.prototype, 'simulateTransaction')
      .mockRejectedValueOnce(new Error('network blip'))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(simSuccess('500'));

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.prepare(tx, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 });

    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('surfaces RETRY_EXHAUSTED with the underlying cause once retries run out', async () => {
    const tx = buildUnsignedTx(Keypair.random().publicKey());
    jest.spyOn(rpc.Server.prototype, 'simulateTransaction').mockRejectedValue(new Error('rpc down'));

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.prepare(tx, { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RETRY_EXHAUSTED');
    expect(result.error.cause).toBeInstanceOf(Error);
  });

  it('wraps a simulation error response as a typed SIMULATION_ERROR cause', async () => {
    const tx = buildUnsignedTx(Keypair.random().publicKey());
    jest
      .spyOn(rpc.Server.prototype, 'simulateTransaction')
      .mockResolvedValue(simError('Error(Contract, #1)'));

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.prepare(tx, { maxAttempts: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RETRY_EXHAUSTED');
    const cause = result.error.cause as TrustFlowError;
    expect(cause.code).toBe('SIMULATION_ERROR');
    expect(cause.message).toContain('Error(Contract, #1)');
  });
});

describe('TransactionPipeline.buildFeeBump', () => {
  it('builds a fee-bump envelope that round-trips through TransactionBuilder.fromXDR', () => {
    const sourceKeypair = Keypair.random();
    const feeSource = Keypair.random();
    const inner = buildUnsignedTx(sourceKeypair.publicKey());
    inner.sign(sourceKeypair);

    const pipeline = new TransactionPipeline(makeClient());
    const result = pipeline.buildFeeBump(inner, { feeSource, baseFee: '1000' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.data.sign(feeSource);
    expect(result.data).toBeInstanceOf(FeeBumpTransaction);

    const envelope = xdr.TransactionEnvelope.fromXDR(result.data.toXDR(), 'base64');
    expect(envelope.switch()).toEqual(xdr.EnvelopeType.envelopeTypeTxFeeBump());

    const decoded = TransactionBuilder.fromXDR(result.data.toXDR(), Networks.TESTNET);
    expect(decoded).toBeInstanceOf(FeeBumpTransaction);
  });

  it('surfaces a typed FEE_BUMP_ERROR when the base fee is below the network minimum', () => {
    const sourceKeypair = Keypair.random();
    const inner = buildUnsignedTx(sourceKeypair.publicKey());
    inner.sign(sourceKeypair);

    const pipeline = new TransactionPipeline(makeClient());
    const result = pipeline.buildFeeBump(inner, { feeSource: Keypair.random(), baseFee: '1' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(TrustFlowError);
    expect(result.error.code).toBe('FEE_BUMP_ERROR');
  });
});

describe('TransactionPipeline.submit', () => {
  afterEach(() => jest.restoreAllMocks());

  it('confirms a transaction that is accepted and included on the first attempt', async () => {
    const sourceKeypair = Keypair.random();
    const tx = buildUnsignedTx(sourceKeypair.publicKey());
    tx.sign(sourceKeypair);

    jest.spyOn(rpc.Server.prototype, 'sendTransaction').mockResolvedValue({
      status: 'PENDING',
      hash: 'deadbeef',
      latestLedger: 1,
      latestLedgerCloseTime: 1,
    });
    jest.spyOn(rpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      ledger: 42,
    } as unknown as rpc.Api.GetTransactionResponse);

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.submit(tx, { pollIntervalMs: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      hash: 'deadbeef',
      ledger: 42,
      feeBumped: false,
      attempts: 1,
      feeCharged: tx.fee,
    });
  });

  it('retries after TRY_AGAIN_LATER and succeeds on the next attempt', async () => {
    const sourceKeypair = Keypair.random();
    const tx = buildUnsignedTx(sourceKeypair.publicKey());
    tx.sign(sourceKeypair);

    const sendSpy = jest
      .spyOn(rpc.Server.prototype, 'sendTransaction')
      .mockResolvedValueOnce({
        status: 'TRY_AGAIN_LATER',
        hash: 'deadbeef',
        latestLedger: 1,
        latestLedgerCloseTime: 1,
      })
      .mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'deadbeef',
        latestLedger: 2,
        latestLedgerCloseTime: 2,
      });
    jest.spyOn(rpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      ledger: 43,
    } as unknown as rpc.Api.GetTransactionResponse);

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.submit(tx, { maxAttempts: 2, baseDelayMs: 1, pollIntervalMs: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.attempts).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  it('surfaces RETRY_EXHAUSTED wrapping a SUBMISSION_ERROR when the node rejects the transaction', async () => {
    const sourceKeypair = Keypair.random();
    const tx = buildUnsignedTx(sourceKeypair.publicKey());
    tx.sign(sourceKeypair);

    jest.spyOn(rpc.Server.prototype, 'sendTransaction').mockResolvedValue({
      status: 'ERROR',
      hash: 'deadbeef',
      latestLedger: 1,
      latestLedgerCloseTime: 1,
    });

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.submit(tx, { maxAttempts: 2, baseDelayMs: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RETRY_EXHAUSTED');
    expect((result.error.cause as TrustFlowError).code).toBe('SUBMISSION_ERROR');
  });
});

describe('TransactionPipeline.run', () => {
  afterEach(() => jest.restoreAllMocks());

  it('assembles, prepares, signs, and submits a transaction end-to-end', async () => {
    const source = Keypair.random();
    jest.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(new Account(source.publicKey(), '100'));
    jest.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue(simSuccess('500'));
    jest.spyOn(rpc.Server.prototype, 'sendTransaction').mockResolvedValue({
      status: 'PENDING',
      hash: 'cafebabe',
      latestLedger: 1,
      latestLedgerCloseTime: 1,
    });
    jest.spyOn(rpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      ledger: 7,
    } as unknown as rpc.Api.GetTransactionResponse);

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.run({
      sourceAccount: source.publicKey(),
      operations: [new Contract(CONTRACT_ID).call('increment')],
      signers: [source],
      submit: { pollIntervalMs: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.feeBumped).toBe(false);
    expect(result.data.hash).toBe('cafebabe');
  });

  it('escalates to a fee-bump transaction when submission is fee-rejected', async () => {
    const source = Keypair.random();
    const sponsor = Keypair.random();

    jest.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(new Account(source.publicKey(), '100'));
    jest.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue(simSuccess('500'));

    const sendSpy = jest
      .spyOn(rpc.Server.prototype, 'sendTransaction')
      .mockResolvedValueOnce({
        status: 'TRY_AGAIN_LATER',
        hash: 'first',
        latestLedger: 1,
        latestLedgerCloseTime: 1,
      })
      .mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'second',
        latestLedger: 2,
        latestLedgerCloseTime: 2,
      });
    jest.spyOn(rpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      ledger: 9,
    } as unknown as rpc.Api.GetTransactionResponse);

    const pipeline = new TransactionPipeline(makeClient());
    const result = await pipeline.run({
      sourceAccount: source.publicKey(),
      operations: [new Contract(CONTRACT_ID).call('increment')],
      signers: [source],
      submit: {
        maxAttempts: 1,
        pollIntervalMs: 1,
        feeBump: { feeSource: sponsor, baseFee: '5000' },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.feeBumped).toBe(true);
    expect(result.data.hash).toBe('second');
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });
});
