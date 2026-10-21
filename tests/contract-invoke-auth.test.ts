import {
  Account,
  Address,
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../src/client';
import { invokeContract } from '../src/contract/invoke';

// Unlike tests/contract.test.ts, this file does not mock `@stellar/stellar-sdk`:
// the real `rpc.assembleTransaction` must run, or a regression in how the
// simulation response is handed to it goes unnoticed (#433).

const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const CALLER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const PASSPHRASE = 'Test SDF Network ; September 2015';

/** A `require_auth` entry for `release` on the test contract, as the RPC returns it. */
function buildAuthEntry(): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
          functionName: 'release',
          args: [],
        }),
      ),
      subInvocations: [],
    }),
  });
}

describe('invokeContract with signAndSubmit against the real stellar-sdk (#433)', () => {
  it('carries the simulated authorization entries into the transaction it submits', async () => {
    const auth = buildAuthEntry();
    // Shaped like the parsed success response `server.simulateTransaction` returns.
    const simulated = {
      _parsed: true,
      id: 'simulation-1',
      latestLedger: 1,
      events: [],
      cost: { cpuInsns: '0', memBytes: '0' },
      minResourceFee: '1000',
      transactionData: new SorobanDataBuilder(),
      result: { auth: [auth], retval: xdr.ScVal.scvVoid() },
    };
    const server = {
      getAccount: jest.fn().mockResolvedValue(new Account(CALLER, '1')),
      simulateTransaction: jest.fn().mockResolvedValue(simulated),
    };
    const client = {
      contractId: CONTRACT_ID,
      getSorobanServer: () => server,
      getNetworkPassphrase: () => PASSPHRASE,
      resolveAccount: () => null,
    } as unknown as TrustFlowClient;
    const signAndSubmit = jest.fn().mockResolvedValue('tx-hash');

    const result = await invokeContract(client, 'release', [], CALLER, signAndSubmit, {
      retry: { attempts: 1 },
    });

    expect(result.success).toBe(true);
    expect(result.txHash).toBe('tx-hash');
    expect(signAndSubmit).toHaveBeenCalledTimes(1);

    const submitted = TransactionBuilder.fromXDR(
      signAndSubmit.mock.calls[0][0] as string,
      PASSPHRASE,
    ) as Transaction;
    const operation = submitted.operations[0] as { auth?: xdr.SorobanAuthorizationEntry[] };
    expect(operation.auth?.map((entry) => entry.toXDR('base64'))).toEqual([auth.toXDR('base64')]);
  });
});
