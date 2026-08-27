/**
 * Example: Release escrow funds to recipient
 */
import { TrustFlowClient } from '../src/client';
import { releaseEscrow } from '../src/escrow/release';
import { connectWallet } from '../src/wallet/connect';

async function main() {
  const wallet = await connectWallet('freighter');
  const client = new TrustFlowClient({
    contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
    network: 'TESTNET',
  });

  const escrowId = process.argv[2];
  if (!escrowId) { console.error('Usage: ts-node release-funds.ts <escrow_id>'); process.exit(1); }

  const txHash = await releaseEscrow(client, { escrowId, caller: wallet.publicKey });
  console.log('Released! Transaction:', txHash);
}

main().catch(console.error);
