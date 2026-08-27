import { TrustFlowSDKError, wrapError, ErrorCodes } from '../src/utils/error';

describe('TrustFlowSDKError', () => {
  it('has correct name', () => {
    const e = new TrustFlowSDKError('msg', ErrorCodes.NETWORK_ERROR);
    expect(e.name).toBe('TrustFlowSDKError');
    expect(e.code).toBe('NETWORK_ERROR');
  });

  it('wraps a plain Error', () => {
    const wrapped = wrapError(new Error('original'), 'CONTRACT_ERROR');
    expect(wrapped.message).toBe('original');
    expect(wrapped.code).toBe('CONTRACT_ERROR');
  });

  it('wraps a string', () => {
    const wrapped = wrapError('string error', 'VALIDATION_ERROR');
    expect(wrapped.message).toBe('string error');
  });
});
