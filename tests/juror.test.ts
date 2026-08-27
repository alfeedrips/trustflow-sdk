import { Keypair } from '@stellar/stellar-sdk';
import { JurorClient } from '../src/juror/client';
import type { ContractConfig } from '../src/types/contract';

const JUROR_ADDRESS = Keypair.random().publicKey();

const CONFIG: ContractConfig = {
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

describe('JurorClient.vote', () => {
  it('accepts a plaintext vote', async () => {
    const jurors = new JurorClient(CONFIG);
    const result = await jurors.vote({
      disputeId: 'dsp-1',
      jurorAddress: JUROR_ADDRESS,
      vote: { encrypted: false, choice: 'approve' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.disputeId).toBe('dsp-1');
      expect(result.data.jurorAddress).toBe(JUROR_ADDRESS);
      expect(result.data.encrypted).toBe(false);
      expect(result.data.txHash).toMatch(/^vote-/);
    }
  });

  it('accepts an encrypted vote with base64 ciphertext', async () => {
    const jurors = new JurorClient(CONFIG);
    const ciphertext = Buffer.from('hidden-choice').toString('base64');
    const result = await jurors.vote({
      disputeId: 'dsp-1',
      jurorAddress: JUROR_ADDRESS,
      vote: { encrypted: true, ciphertext },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.encrypted).toBe(true);
    }
  });

  it('rejects a missing disputeId', async () => {
    const jurors = new JurorClient(CONFIG);
    const result = await jurors.vote({
      disputeId: '',
      jurorAddress: JUROR_ADDRESS,
      vote: { encrypted: false, choice: 'approve' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/disputeId/);
    }
  });

  it('rejects an invalid juror address', async () => {
    const jurors = new JurorClient(CONFIG);
    const result = await jurors.vote({
      disputeId: 'dsp-1',
      jurorAddress: 'not-a-stellar-address',
      vote: { encrypted: false, choice: 'approve' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/jurorAddress/);
    }
  });

  it('rejects an invalid plaintext choice', async () => {
    const jurors = new JurorClient(CONFIG);
    const result = await jurors.vote({
      disputeId: 'dsp-1',
      jurorAddress: JUROR_ADDRESS,
      // @ts-expect-error deliberately invalid choice for the runtime check
      vote: { encrypted: false, choice: 'maybe' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/vote.choice/);
    }
  });

  it('rejects a non-base64 ciphertext', async () => {
    const jurors = new JurorClient(CONFIG);
    const result = await jurors.vote({
      disputeId: 'dsp-1',
      jurorAddress: JUROR_ADDRESS,
      vote: { encrypted: true, ciphertext: 'not base64!!' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/ciphertext/);
    }
  });

  it('rejects an empty ciphertext', async () => {
    const jurors = new JurorClient(CONFIG);
    const result = await jurors.vote({
      disputeId: 'dsp-1',
      jurorAddress: JUROR_ADDRESS,
      vote: { encrypted: true, ciphertext: '' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/ciphertext/);
    }
  });
});
