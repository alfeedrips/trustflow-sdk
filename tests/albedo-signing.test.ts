import {
  Account,
  BASE_FEE,
  FeeBumpTransaction,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { signWithAlbedo, type AlbedoWallet } from '../src/wallet/albedo';
import { TrustFlowError } from '../src/errors';

/** Builds a standard transaction, signed by its source account. */
function standardTx(source: Keypair): Transaction {
  const account = new Account(source.publicKey(), '100');
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: '200' }))
    .setTimeout(30)
    .build();
  tx.sign(source);
  return tx;
}

/** Wraps `inner` in an unsigned fee-bump envelope. */
function feeBumpTx(inner: Transaction): FeeBumpTransaction {
  const feeSource = Keypair.random();
  return TransactionBuilder.buildFeeBumpTransaction(
    feeSource,
    BASE_FEE,
    inner,
    Networks.TESTNET,
  );
}

/** A fake Albedo that adds one signature from `signer` to whatever envelope it is sent. */
function albedoSigningWith(signer: Keypair): jest.Mock {
  return jest.fn(async ({ xdr }: { xdr: string }) => {
    const envelope = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    envelope.sign(signer);
    return {
      signed_envelope_xdr: envelope.toEnvelope().toXDR('base64'),
      tx_hash: envelope.hash().toString('hex'),
    };
  });
}

describe('signWithAlbedo (#345)', () => {
  const originalWindow = global.window;
  let tx: jest.Mock;

  function installAlbedo(wallet: AlbedoWallet | undefined): void {
    global.window = { albedo: wallet } as any;
  }

  beforeEach(() => {
    tx = albedoSigningWith(Keypair.random());
    installAlbedo({ publicKey: jest.fn(), tx } as unknown as AlbedoWallet);
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it('signs a standard transaction and returns the signed envelope', async () => {
    const source = Keypair.random();
    const unsigned = standardTx(source);
    const extra = Keypair.random();
    tx.mockImplementationOnce(async ({ xdr }: { xdr: string }) => {
      const envelope = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
      envelope.sign(extra);
      return { signed_envelope_xdr: envelope.toEnvelope().toXDR('base64'), tx_hash: '' };
    });

    const result = await signWithAlbedo(unsigned, 'TESTNET', {
      expectedSigner: extra.publicKey(),
    });

    expect(result.hash).toBe(unsigned.hash().toString('hex'));
    const signed = TransactionBuilder.fromXDR(result.xdr, Networks.TESTNET);
    expect(signed).toBeInstanceOf(Transaction);
  });

  it('signs a fee-bump transaction and returns a fee-bump envelope', async () => {
    const inner = standardTx(Keypair.random());
    const bump = feeBumpTx(inner);

    const result = await signWithAlbedo(bump, 'TESTNET');

    const signed = TransactionBuilder.fromXDR(result.xdr, Networks.TESTNET);
    expect(signed).toBeInstanceOf(FeeBumpTransaction);
    expect(result.hash).toBe(bump.hash().toString('hex'));
    expect(signed.signatures.length).toBeGreaterThan(0);
  });

  it('sends the full envelope, so a fee-bump keeps its envelope type', async () => {
    const bump = feeBumpTx(standardTx(Keypair.random()));

    await signWithAlbedo(bump, 'TESTNET');

    const sent = tx.mock.calls[0][0] as { xdr: string; network: string };
    expect(sent.xdr).toBe(bump.toEnvelope().toXDR('base64'));
    expect(sent.network).toBe('testnet');
  });

  it("maps MAINNET to Albedo's public network name", async () => {
    const mainnetTx = new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), {
      fee: BASE_FEE,
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
      .setTimeout(30)
      .build();
    tx.mockImplementationOnce(async () => ({ signed_envelope_xdr: '', tx_hash: '' }));

    await expect(signWithAlbedo(mainnetTx, 'MAINNET')).rejects.toMatchObject({
      code: 'SIGNING_ERROR',
    });
    expect(tx.mock.calls[0][0]).toMatchObject({ network: 'public' });
  });

  it('rejects a transaction built for a different network', async () => {
    const otherNetwork = new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), {
      fee: BASE_FEE,
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
      .setTimeout(30)
      .build();

    await expect(signWithAlbedo(otherNetwork, 'TESTNET')).rejects.toMatchObject({
      code: 'SIGNING_ERROR',
    });
    expect(tx).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when Albedo is not installed', async () => {
    installAlbedo(undefined);

    const error = await signWithAlbedo(standardTx(Keypair.random()), 'TESTNET').catch((e) => e);

    expect(error).toBeInstanceOf(TrustFlowError);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('maps a user rejection to USER_REJECTED', async () => {
    tx.mockRejectedValueOnce(new Error('User rejected the request'));

    const error = await signWithAlbedo(standardTx(Keypair.random()), 'TESTNET').catch((e) => e);

    expect(error.code).toBe('USER_REJECTED');
  });

  it('fails with SIGNING_ERROR when Albedo returns an envelope that does not verify', async () => {
    const source = Keypair.random();
    const unsigned = standardTx(source);
    tx.mockResolvedValueOnce({ signed_envelope_xdr: unsigned.toEnvelope().toXDR('base64') });

    const error = await signWithAlbedo(unsigned, 'TESTNET').catch((e) => e);

    expect(error.code).toBe('SIGNING_ERROR');
    expect(error.message).toContain('wallet did not add a signature');
  });
});
