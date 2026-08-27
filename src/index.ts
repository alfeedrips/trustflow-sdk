export * from './types';
export * from './types/contract';
export * from './types/events';
export * from './types/multisig';
export * from './types/juror';
export * from './escrow';
export * from './juror';
export * from './storage';
export * from './auth';
export * from './stellar';
export * from './utils/validation';
export * from './utils/format';
export * from './tx-pipeline';
export { TrustFlowClient } from './client';
export { TrustFlowError } from './errors';
export type { TrustFlowErrorCode } from './errors';

// Zod runtime validation schemas (#45) — re-exported by name rather than
// `export *` because `Network` and `ClientConfig` already exist as plain
// TS types from './types'; only the schema objects and the composite
// "*Input" types are exposed here to avoid ambiguous re-exports.
export {
  StellarAddressSchema,
  ContractIdSchema,
  StroopsSchema,
  NetworkSchema,
  CreateEscrowSchema,
  ReleaseEscrowSchema,
  DisputeEscrowSchema,
  ClientConfigSchema,
} from './schemas';
export type { CreateEscrowInput, ReleaseEscrowInput, DisputeEscrowInput } from './schemas';

export const SDK_VERSION = '0.1.0';
