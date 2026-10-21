import { inspect } from 'util';
import { TrustFlowClient } from '../src/client';
import { describeError } from '../src/utils/logger';

const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const SECRET = 'secret-api-key';

function makeClient(rpcHeaders?: Record<string, string>): TrustFlowClient {
  return new TrustFlowClient({ contractId: CONTRACT_ID, network: 'TESTNET', rpcHeaders });
}

describe('rpcHeaders (#344)', () => {
  it('sends the configured headers on every Soroban RPC request', () => {
    const client = makeClient({ 'X-Api-Key': SECRET, 'X-Trace-Id': 'trace-1' });

    const server = client.getSorobanServer();

    expect(server.httpClient.defaults.headers).toMatchObject({
      'X-Api-Key': SECRET,
      'X-Trace-Id': 'trace-1',
      'Content-Type': 'application/json',
    });
  });

  it('always keeps the JSON-RPC Content-Type, even when a custom header tries to replace it', () => {
    const client = makeClient({ 'Content-Type': 'text/plain' });

    expect(client.getRpcHeaders()['Content-Type']).toBe('application/json');
  });

  it('sends only the JSON content type when no headers are configured', () => {
    expect(makeClient().getRpcHeaders()).toEqual({ 'Content-Type': 'application/json' });
  });

  it('returns a copy, so mutating the result cannot change the client', () => {
    const client = makeClient({ 'X-Api-Key': SECRET });

    client.getRpcHeaders()['X-Api-Key'] = 'tampered';

    expect(client.getRpcHeaders()['X-Api-Key']).toBe(SECRET);
  });

  it('keeps header values out of JSON and util.inspect output for the client', () => {
    const client = makeClient({ 'X-Api-Key': SECRET });

    expect(JSON.stringify(client)).not.toContain(SECRET);
    expect(inspect(client, { showHidden: true, depth: 5 })).not.toContain(SECRET);
  });

  it('describeError keeps only the name, message and code of a transport error', () => {
    // Axios errors carry the whole request, headers included.
    const error = Object.assign(new Error('socket hang up'), {
      code: 'ECONNRESET',
      config: { headers: { 'X-Api-Key': SECRET } },
    });

    const described = describeError(error);

    expect(described).toEqual({ name: 'Error', message: 'socket hang up', code: 'ECONNRESET' });
    expect(JSON.stringify(described)).not.toContain(SECRET);
  });

  it('describeError handles non-Error throws', () => {
    expect(describeError('boom')).toEqual({ message: 'boom' });
  });
});
