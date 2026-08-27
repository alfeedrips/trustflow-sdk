import {
  Keypair,
  Transaction,
  TransactionBuilder,
  Account,
  Networks,
  Operation,
  Asset,
} from '@stellar/stellar-sdk';
import { MultiSigEscrowClient } from '../src/escrow/multisig';
import type { ContractConfig } from '../src/types/contract';

// ---------------------------------------------------------------------------
// Helpers — build real Stellar XDR payloads
// ---------------------------------------------------------------------------

const NETWORK_PASSPHRASE = Networks.TESTNET;
const CONTRACT_CONFIG: ContractConfig = {
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: NETWORK_PASSPHRASE,
};

function makeKeyPair() {
  return Keypair.random();
}

/** Builds a minimal unsigned Stellar transaction XDR (v1 envelope). */
function buildUnsignedXdr(sourceKeypair: Keypair, destKeypair: Keypair): string {
  const account = new Account(sourceKeypair.publicKey(), '100');
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: destKeypair.publicKey(),
        asset: Asset.native(),
        amount: '1',
      }),
    )
    .setTimeout(30)
    .build();
  return tx.toEnvelope().toXDR('base64');
}

/** Signs the given XDR with the provided keypair and returns the new XDR. */
function signXdr(baseXdr: string, keypair: Keypair): string {
  const tx = new Transaction(baseXdr, NETWORK_PASSPHRASE);
  tx.sign(keypair);
  return tx.toEnvelope().toXDR('base64');
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const KP_A = makeKeyPair();
const KP_B = makeKeyPair();
const KP_C = makeKeyPair();
const KP_DEST = makeKeyPair();

const BASE_XDR = buildUnsignedXdr(KP_A, KP_DEST);
const SIGNED_A = signXdr(BASE_XDR, KP_A);
const SIGNED_B = signXdr(BASE_XDR, KP_B);

const ESCROW_ID = 'esc-test-001';

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

describe('MultiSigEscrowClient', () => {
  let client: MultiSigEscrowClient;

  beforeEach(() => {
    client = new MultiSigEscrowClient(CONTRACT_CONFIG);
  });

  // -------------------------------------------------------------------------
  // initMultiSigOperation
  // -------------------------------------------------------------------------
  describe('initMultiSigOperation', () => {
    it('returns an operationId for valid params', () => {
      const result = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey()],
        threshold: 2,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.operationId).toMatch(/^msig-/);
      }
    });

    it('supports 1-of-N threshold', () => {
      const result = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey(), KP_C.publicKey()],
        threshold: 1,
        operationType: 'cancel',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(result.ok).toBe(true);
    });

    it('fails when escrowId is missing', () => {
      const result = client.initMultiSigOperation({
        escrowId: '',
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('escrowId');
    });

    it('fails when threshold exceeds signer count', () => {
      const result = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey()],
        threshold: 3,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('threshold');
    });

    it('fails when threshold is zero', () => {
      const result = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey()],
        threshold: 0,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('threshold');
    });

    it('fails when signers list is empty', () => {
      const result = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('signer');
    });

    it('fails when signers contain duplicates', () => {
      const result = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Duplicate');
    });

    it('fails when unsignedXdr is missing', () => {
      const result = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: '',
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('unsignedXdr');
    });
  });

  // -------------------------------------------------------------------------
  // addSignature
  // -------------------------------------------------------------------------
  describe('addSignature', () => {
    let operationId: string;

    beforeEach(() => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey()],
        threshold: 2,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (init.ok) operationId = init.data.operationId;
    });

    it('accepts a valid signature from an authorised signer', () => {
      const result = client.addSignature({
        operationId,
        signerAddress: KP_A.publicKey(),
        signedXdr: SIGNED_A,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.signaturesCollected).toBe(1);
        expect(result.data.signersSigned).toContain(KP_A.publicKey());
        expect(result.data.signersRemaining).toContain(KP_B.publicKey());
        expect(result.data.isReady).toBe(false);
      }
    });

    it('marks operation ready when threshold is met', () => {
      client.addSignature({ operationId, signerAddress: KP_A.publicKey(), signedXdr: SIGNED_A });
      const result = client.addSignature({
        operationId,
        signerAddress: KP_B.publicKey(),
        signedXdr: SIGNED_B,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.signaturesCollected).toBe(2);
        expect(result.data.isReady).toBe(true);
        expect(result.data.status).toBe('ready');
      }
    });

    it('rejects a signer not in the authorised list', () => {
      const result = client.addSignature({
        operationId,
        signerAddress: KP_C.publicKey(),
        signedXdr: signXdr(BASE_XDR, KP_C),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('not an authorised signer');
    });

    it('rejects duplicate signatures from the same signer', () => {
      client.addSignature({ operationId, signerAddress: KP_A.publicKey(), signedXdr: SIGNED_A });
      const dup = client.addSignature({
        operationId,
        signerAddress: KP_A.publicKey(),
        signedXdr: SIGNED_A,
      });
      expect(dup.ok).toBe(false);
      if (!dup.ok) expect(dup.error).toContain('already signed');
    });

    it('rejects an invalid XDR payload', () => {
      const result = client.addSignature({
        operationId,
        signerAddress: KP_A.publicKey(),
        signedXdr: 'not-valid-xdr',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('valid Stellar transaction envelope');
    });

    it('returns error for unknown operationId', () => {
      const result = client.addSignature({
        operationId: 'does-not-exist',
        signerAddress: KP_A.publicKey(),
        signedXdr: SIGNED_A,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('not found');
    });
  });

  // -------------------------------------------------------------------------
  // getMultiSigStatus
  // -------------------------------------------------------------------------
  describe('getMultiSigStatus', () => {
    it('returns correct initial status', () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey()],
        threshold: 2,
        operationType: 'cancel',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const status = client.getMultiSigStatus(init.data.operationId);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.data.signaturesCollected).toBe(0);
        expect(status.data.threshold).toBe(2);
        expect(status.data.isReady).toBe(false);
        expect(status.data.status).toBe('pending');
        expect(status.data.signersAuthorised).toHaveLength(2);
        expect(status.data.signersRemaining).toHaveLength(2);
        expect(status.data.signersSigned).toHaveLength(0);
      }
    });

    it('returns error for unknown operationId', () => {
      const result = client.getMultiSigStatus('ghost-id');
      expect(result.ok).toBe(false);
    });

    it('marks expired operations', () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
        expiresAt: Date.now() - 1000,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const status = client.getMultiSigStatus(init.data.operationId);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.data.status).toBe('expired');
      }
    });
  });

  // -------------------------------------------------------------------------
  // getAssembledXdr
  // -------------------------------------------------------------------------
  describe('getAssembledXdr', () => {
    it('produces a valid XDR with merged signatures', () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey()],
        threshold: 2,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const opId = init.data.operationId;
      client.addSignature({ operationId: opId, signerAddress: KP_A.publicKey(), signedXdr: SIGNED_A });
      client.addSignature({ operationId: opId, signerAddress: KP_B.publicKey(), signedXdr: SIGNED_B });

      const assembled = client.getAssembledXdr(opId);
      expect(assembled.ok).toBe(true);
      if (assembled.ok) {
        // Must be parseable and contain both signatures
        const tx = new Transaction(assembled.data.xdr, NETWORK_PASSPHRASE);
        expect(tx.signatures).toHaveLength(2);
      }
    });

    it('returns error when no signatures have been collected', () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const assembled = client.getAssembledXdr(init.data.operationId);
      expect(assembled.ok).toBe(false);
      if (!assembled.ok) expect(assembled.error).toContain('No signatures');
    });
  });

  // -------------------------------------------------------------------------
  // submitWhenReady
  // -------------------------------------------------------------------------
  describe('submitWhenReady', () => {
    it('returns threshold-not-met error when below threshold', async () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey()],
        threshold: 2,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const opId = init.data.operationId;
      client.addSignature({ operationId: opId, signerAddress: KP_A.publicKey(), signedXdr: SIGNED_A });

      const result = await client.submitWhenReady(opId, 'https://horizon-testnet.stellar.org');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Threshold not met');
    });

    it('returns expired error for an expired operation', async () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
        expiresAt: Date.now() - 1,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const result = await client.submitWhenReady(
        init.data.operationId,
        'https://horizon-testnet.stellar.org',
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('expired');
    });

    it('attempts submission when threshold is met (mocked fetch)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'abc123', successful: true, ledger: 42 }),
      }) as jest.Mock;

      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey()],
        threshold: 2,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const opId = init.data.operationId;
      client.addSignature({ operationId: opId, signerAddress: KP_A.publicKey(), signedXdr: SIGNED_A });
      client.addSignature({ operationId: opId, signerAddress: KP_B.publicKey(), signedXdr: SIGNED_B });

      const result = await client.submitWhenReady(opId, 'https://horizon-testnet.stellar.org');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.txHash).toBe('abc123');
        expect(result.data.escrowId).toBe(ESCROW_ID);
      }

      (global.fetch as jest.Mock).mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // listOperations
  // -------------------------------------------------------------------------
  describe('listOperations', () => {
    it('returns all operations for a given escrowId', () => {
      client.initMultiSigOperation({
        escrowId: 'esc-111',
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      client.initMultiSigOperation({
        escrowId: 'esc-111',
        signers: [KP_B.publicKey()],
        threshold: 1,
        operationType: 'cancel',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      client.initMultiSigOperation({
        escrowId: 'esc-999',
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'dispute',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      const ops = client.listOperations('esc-111');
      expect(ops).toHaveLength(2);
      expect(ops.every((op) => op.escrowId === 'esc-111')).toBe(true);
    });

    it('returns empty array when no operations exist for escrowId', () => {
      expect(client.listOperations('no-such-escrow')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // exportState / importState
  // -------------------------------------------------------------------------
  describe('exportState / importState', () => {
    it('returns undefined for an unknown operationId', () => {
      expect(client.exportState('no-such-op')).toBeUndefined();
    });

    it('round-trips operation state through export/import into a fresh client', () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey()],
        threshold: 2,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;
      const operationId = init.data.operationId;

      client.addSignature({ operationId, signerAddress: KP_A.publicKey(), signedXdr: SIGNED_A });

      const snapshot = client.exportState(operationId);
      expect(snapshot).toBeDefined();
      if (!snapshot) return;
      expect(snapshot.version).toBe(1);

      const otherClient = new MultiSigEscrowClient(CONTRACT_CONFIG);
      expect(otherClient.getMultiSigStatus(operationId).ok).toBe(false);

      const imported = otherClient.importState(snapshot);
      expect(imported.ok).toBe(true);

      const status = otherClient.getMultiSigStatus(operationId);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.data.signaturesCollected).toBe(1);
        expect(status.data.signersSigned).toContain(KP_A.publicKey());
      }

      // Continuing the flow on the second process's client should work as normal.
      const completed = otherClient.addSignature({
        operationId,
        signerAddress: KP_B.publicKey(),
        signedXdr: SIGNED_B,
      });
      expect(completed.ok).toBe(true);
      if (completed.ok) {
        expect(completed.data.isReady).toBe(true);
      }
    });

    it('does not mutate the exporting client when the importing client is mutated', () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey(), KP_B.publicKey()],
        threshold: 2,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;
      const operationId = init.data.operationId;

      const snapshot = client.exportState(operationId)!;
      const otherClient = new MultiSigEscrowClient(CONTRACT_CONFIG);
      otherClient.importState(snapshot);

      otherClient.addSignature({ operationId, signerAddress: KP_A.publicKey(), signedXdr: SIGNED_A });

      const original = client.getMultiSigStatus(operationId);
      expect(original.ok).toBe(true);
      if (original.ok) {
        expect(original.data.signaturesCollected).toBe(0);
      }
    });

    it('rejects a malformed snapshot instead of throwing', () => {
      const malformed = { version: 1, operationId: 'op-1' } as unknown as ReturnType<
        MultiSigEscrowClient['exportState']
      >;
      const result = client.importState(malformed!);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/escrowId/);
      }
      // Nothing should have been admitted into the client's state.
      expect(client.getMultiSigStatus('op-1').ok).toBe(false);
    });

    it('rejects a snapshot with a missing or mismatched version', () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const snapshot = client.exportState(init.data.operationId)!;

      const missingVersion = { ...snapshot } as { version?: number };
      delete missingVersion.version;
      const resultMissing = client.importState(missingVersion as typeof snapshot);
      expect(resultMissing.ok).toBe(false);
      if (!resultMissing.ok) {
        expect(resultMissing.error).toMatch(/version/);
      }

      const futureVersion = { ...snapshot, version: 999 };
      const resultFuture = client.importState(futureVersion);
      expect(resultFuture.ok).toBe(false);
      if (!resultFuture.ok) {
        expect(resultFuture.error).toMatch(/version/);
      }
    });

    it('rejects a snapshot with a non-array signers field', () => {
      const init = client.initMultiSigOperation({
        escrowId: ESCROW_ID,
        signers: [KP_A.publicKey()],
        threshold: 1,
        operationType: 'release',
        unsignedXdr: BASE_XDR,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      expect(init.ok).toBe(true);
      if (!init.ok) return;

      const snapshot = client.exportState(init.data.operationId)!;
      const corrupted = { ...snapshot, signers: 'not-an-array' } as unknown as typeof snapshot;

      const otherClient = new MultiSigEscrowClient(CONTRACT_CONFIG);
      const result = otherClient.importState(corrupted);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/signers/);
      }
    });
  });
});
