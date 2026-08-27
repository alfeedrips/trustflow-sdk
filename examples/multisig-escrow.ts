/**
 * Example: Collect M-of-N signatures for a shared backend Escrow release
 *
 * Two approvers (e.g. a platform and an arbitrator) must both sign before
 * the release transaction is broadcast to Horizon.
 */
import { MultiSigEscrowClient } from '../src/escrow/multisig';
import { Networks } from '@stellar/stellar-sdk';

const APPROVER_A = 'GAPPROVER_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const APPROVER_B = 'GAPPROVER_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

async function main() {
  const client = new MultiSigEscrowClient({
    contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
    network: 'TESTNET',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
  });

  // Step 1 — register a 2-of-2 release operation for escrow "esc-42"
  const init = client.initMultiSigOperation({
    escrowId: 'esc-42',
    signers: [APPROVER_A, APPROVER_B],
    threshold: 2,
    operationType: 'release',
    unsignedXdr: process.env.UNSIGNED_RELEASE_XDR!,
    networkPassphrase: Networks.TESTNET,
  });

  if (!init.ok) throw new Error(init.error);
  const { operationId } = init.data;
  console.log('Operation created:', operationId);

  // Step 2 — each approver signs the XDR independently and submits their envelope
  client.addSignature({
    operationId,
    signerAddress: APPROVER_A,
    signedXdr: process.env.SIGNED_XDR_A!,
  });

  const statusAfterA = client.getMultiSigStatus(operationId);
  if (statusAfterA.ok) {
    console.log(`Signatures: ${statusAfterA.data.signaturesCollected}/${statusAfterA.data.threshold}`);
  }

  client.addSignature({
    operationId,
    signerAddress: APPROVER_B,
    signedXdr: process.env.SIGNED_XDR_B!,
  });

  // Step 3 — threshold met, broadcast the assembled transaction
  const result = await client.submitWhenReady(
    operationId,
    'https://horizon-testnet.stellar.org',
  );

  if (!result.ok) throw new Error(result.error);
  console.log('Escrow released! tx:', result.data.txHash);
}

main().catch(console.error);
