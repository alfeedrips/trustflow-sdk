# TrustFlow SDK Quick Start

Get up and running in 5 minutes.

## Install

```bash
npm install @trustflow/sdk
# or
yarn add @trustflow/sdk
```

---

## 1. Connect to the Network

```typescript
import { TrustFlowClient } from '@trustflow/sdk';

const client = new TrustFlowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET', // or 'MAINNET'
});

await client.connect();
console.log('Connected to', client.network); // 'TESTNET'
console.log('Config:', client.getConfig());
```

---

## 2. Create an Escrow

### Using `TrustFlowEscrowClient` + `EscrowBuilder` (recommended)

```typescript
import { TrustFlowEscrowClient, EscrowBuilder } from '@trustflow/sdk';

const escrowClient = new TrustFlowEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
});

const params = new EscrowBuilder()
  .setDepositor('GDEPOSITOR...')
  .setBeneficiary('GBENEFICIARY...')
  .setAmount('50') // XLM
  .setDeadline(17280) // ~1 day in ledgers
  .build();

const result = await escrowClient.createEscrow(params);
if (result.ok) {
  console.log('Escrow ID:', result.data.escrowId);
  console.log('Tx Hash:', result.data.txHash);
} else {
  console.error('Error:', result.error);
}
```

### Using `createEscrow` function directly

```typescript
import { TrustFlowClient } from '@trustflow/sdk';
import { createEscrow } from '@trustflow/sdk/escrow';
import { xlmToStroops } from '@trustflow/sdk/utils';

const client = new TrustFlowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
});
await client.connect();

const escrow = await createEscrow(client, {
  sender: 'GSENDER...',
  recipient: 'GRECIPIENT...',
  amountStroops: xlmToStroops('50'), // 50 XLM → stroops
  durationBlocks: 17280,
  metadata: { orderId: 'ORD-001', description: 'Freelance payment' },
});

console.log('Escrow created:', escrow.id);
console.log('Amount (stroops):', escrow.amount.toString());
```

---

## 3. Fund / Release an Escrow

```typescript
import { TrustFlowClient } from '@trustflow/sdk';
import { releaseEscrow } from '@trustflow/sdk/escrow';
import { connectWallet } from '@trustflow/sdk/wallet';

const wallet = await connectWallet('freighter');

const client = new TrustFlowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
});
await client.connect();

const txHash = await releaseEscrow(client, {
  escrowId: 'escrow-1234567890',
  caller: wallet.publicKey,
});

console.log('Released! Transaction:', txHash);
```

---

## 4. Check Balance

```typescript
const balance = await client.getBalance('GDEPOSITOR...');
console.log(`Balance: ${balance} XLM`);
```

---

## 5. Raise a Dispute

```typescript
import { DisputeClient } from '@trustflow/sdk';

const disputes = new DisputeClient(
  'https://api.trustflow.xyz',
  process.env.AUTH_TOKEN!,
);

const result = await disputes.raiseDispute({
  escrowId: 'escrow-1234567890',
  reason: 'Work not delivered as agreed',
  evidence: 'https://evidence.example.com/proof.pdf',
});

if (result.ok) {
  console.log('Dispute raised:', result.data.disputeId);
}
```

---

## 6. Multi-Sig Escrow (M-of-N)

Collect signatures from multiple approvers before broadcasting:

```typescript
import { MultiSigEscrowClient } from '@trustflow/sdk';
import { Networks } from '@stellar/stellar-sdk';

const client = new MultiSigEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

// Register a 2-of-2 release operation
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

// Each approver submits their signed XDR independently
client.addSignature({ operationId, signerAddress: APPROVER_A, signedXdr: SIGNED_XDR_A });
client.addSignature({ operationId, signerAddress: APPROVER_B, signedXdr: SIGNED_XDR_B });

// Broadcast once threshold is met
const result = await client.submitWhenReady(operationId, 'https://horizon-testnet.stellar.org');
if (result.ok) console.log('Released! tx:', result.data.txHash);
```

---

## 7. Paginated Gig Listing

```typescript
const escrowClient = new TrustFlowEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  apiBaseUrl: 'https://api.trustflow.xyz',
  apiKey: process.env.API_KEY,
});

let cursor: string | undefined;
do {
  const page = await escrowClient.getGigs({ cursor, limit: 20, status: 'active' });
  if (!page.ok) { console.error(page.error); break; }
  console.log(page.data.data);
  cursor = page.data.nextCursor ?? undefined;
} while (cursor);
```

---

## Environment Variables

```bash
TRUSTFLOW_CONTRACT_ID=C...          # Soroban contract address
API_KEY=your-api-key                # TrustFlow backend API key
AUTH_TOKEN=your-jwt-token           # JWT for dispute/auth endpoints
UNSIGNED_RELEASE_XDR=...            # Base64 XDR for multi-sig flows
```

See [API Reference](./API.md) for the full method list and [examples/](../examples/) for runnable scripts.
