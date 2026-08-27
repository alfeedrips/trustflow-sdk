/**
 * Example: Create a new escrow using TrustFlow SDK
 */
import { TrustFlowClient } from '../src/client';
import { createEscrow } from '../src/escrow/create';
import { connectWallet } from '../src/wallet/connect';
import { xlmToStroops } from '../src/utils/format';

async function main() {
  const wallet = await connectWallet('freighter');

  const client = new TrustFlowClient({
    contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
    network: 'TESTNET',
  });

  await client.connect();

  const escrow = await createEscrow(client, {
    sender: wallet.publicKey,
    recipient: 'GCDE3333333333333333333333333333333333333333333333333333333333',
    amountStroops: xlmToStroops('50'),
    durationBlocks: 17280, // ~1 day
    metadata: { orderId: 'ORD-001', description: 'Freelance payment' },
  });

  console.log('Escrow created:', escrow.id);
  console.log('Amount:', escrow.amount, 'stroops');
}

main().catch(console.error);
