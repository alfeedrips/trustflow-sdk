import { isValidStellarAddress, isValidContractId } from '../src/utils/validate';

describe('address validation', () => {
  it('accepts valid G address', () => {
    expect(isValidStellarAddress('GBAB222222222222222222222222222222222222222222222222222A')).toBe(true);
  });
  it('rejects short address', () => {
    expect(isValidStellarAddress('GABCD')).toBe(false);
  });
  it('accepts valid C contract', () => {
    expect(isValidContractId('CTEST22222222222222222222222222222222222222222222222222A')).toBe(true);
  });
});
