import { EscrowBuilder } from '../src/escrow/builder';
import { isValidStellarAddress, xlmToStroops } from '../src/utils/validation';
import { stroopsToXLM } from '../src/utils/format';

describe('SDK integration: escrow round-trip', () => {
  const ADDR_A = 'G' + 'A'.repeat(55);
  const ADDR_B = 'G' + 'B'.repeat(55);

  it('builds valid params and validates them', () => {
    const params = new EscrowBuilder().setDepositor(ADDR_A).setBeneficiary(ADDR_B).setAmount('500').build();
    expect(isValidStellarAddress(params.depositor)).toBe(true);
    expect(isValidStellarAddress(params.beneficiary)).toBe(true);
    const stroops = xlmToStroops(params.amountXLM);
    expect(stroops).toBe(5_000_000_000n);
    expect(stroopsToXLM(stroops)).toBe('500');
  });
});
