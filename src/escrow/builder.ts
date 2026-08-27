import { EscrowParams } from '../types/index';

export class EscrowBuilder {
  private params: Partial<EscrowParams> = {};

  setDepositor(address: string): this {
    this.params.depositor = address;
    return this;
  }
  setBeneficiary(address: string): this {
    this.params.beneficiary = address;
    return this;
  }
  setAmount(xlm: string): this {
    this.params.amountXLM = xlm;
    return this;
  }
  setToken(address: string): this {
    this.params.tokenAddress = address;
    return this;
  }
  setDeadline(blocks: number): this {
    this.params.deadlineBlocks = blocks;
    return this;
  }

  build(): EscrowParams {
    if (!this.params.depositor) {
      throw new Error('depositor required');
    }
    if (!this.params.beneficiary) {
      throw new Error('beneficiary required');
    }
    if (!this.params.amountXLM) {
      throw new Error('amountXLM required');
    }
    return this.params as EscrowParams;
  }
}
