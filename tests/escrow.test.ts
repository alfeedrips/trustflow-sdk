import { EscrowBuilder } from '../src/escrow/builder';

describe('EscrowBuilder', () => {
  const ADDR_A = 'G' + 'A'.repeat(55);
  const ADDR_B = 'G' + 'B'.repeat(55);

  it('builds valid escrow params', () => {
    const params = new EscrowBuilder().setDepositor(ADDR_A).setBeneficiary(ADDR_B).setAmount('100').build();
    expect(params.depositor).toBe(ADDR_A);
    expect(params.amountXLM).toBe('100');
  });

  it('throws if depositor missing', () => {
    expect(() => new EscrowBuilder().setBeneficiary(ADDR_B).setAmount('1').build()).toThrow('depositor required');
  });

  it('sets optional deadline', () => {
    const p = new EscrowBuilder().setDepositor(ADDR_A).setBeneficiary(ADDR_B).setAmount('50').setDeadline(1000).build();
    expect(p.deadlineBlocks).toBe(1000);
  });
});
