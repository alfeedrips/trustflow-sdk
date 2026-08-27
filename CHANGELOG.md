# Changelog

## [Unreleased]
- Exported the Zod validation schemas from `src/schemas.ts` (`StellarAddressSchema`,
  `ContractIdSchema`, `StroopsSchema`, `NetworkSchema`, `CreateEscrowSchema`,
  `ReleaseEscrowSchema`, `DisputeEscrowSchema`, `ClientConfigSchema`, plus the `*Input` inferred
  types) from the package root (#45) so consumers — notably frontend form validation — can reuse
  the same rules the SDK enforces internally instead of duplicating them. The schemas' inferred
  `Network` and `ClientConfig` type aliases are intentionally **not** re-exported from the root
  barrel: those names already exist as plain TS types in `src/types.ts`, and re-exporting both
  via `export *` produces an ambiguous-export error; import them directly from `../schemas` if
  needed. No new runtime dependency — `zod` was already added in #45.
- **Breaking changes: none.** Everything below is additive; existing `saveSession`/`loadSession`/
  `clearSession` and `MultiSigEscrowClient` call signatures are unchanged. See the "Compatibility
  & migration" note at the top of `docs/spikes/issue-79-retry-session-multisig.md`.
- Session storage (`auth/session.ts`) is now pluggable via a `SessionStorageAdapter` and
  `configureSessionStorage()`. Node/CLI/backend usage now defaults to an in-memory adapter
  instead of silently no-op'ing; browser usage is unchanged (`localStorage`). A pre-existing
  session with no stored expiry (written before this change, or by an older SDK version) is
  treated as not-yet-expired rather than retroactively expired.
- Sessions now carry an `expiresAt`, checked via the new `isSessionExpired()`. Best-effort only —
  the backend does not yet return a token TTL (tracked in #82) — see the README's "Session
  Storage" section. A malformed/corrupted stored `expiresAt` is treated as already expired rather
  than valid forever.
- Removed `src/stellar/rpc.ts` (`simulateAndAssemble`): dead code, never referenced or exported,
  fully superseded by `TransactionPipeline.prepare`. Not part of any documented public API
  (verified via repo-wide search of `src/`, `tests/`, `examples/`, and docs).
- Added `MultiSigStateStore` (target abstraction for a future backend-backed store, #83) and
  `MultiSigEscrowClient.exportState`/`importState` (non-breaking stopgap for coordinating signers
  across processes today) to `src/types/multisig.ts` / `src/escrow/multisig.ts`. Exported
  snapshots carry a `version` field (`MULTISIG_SNAPSHOT_VERSION`) so a future schema change can be
  detected and rejected by `importState` instead of silently misinterpreted.
- Retry: `src/utils/retry.ts` kept as-is (tested public utility); consolidating it with
  `TransactionPipeline`'s internal retry loop is tracked separately (#84).
- See `docs/spikes/issue-79-retry-session-multisig.md` for the full retry/session/multisig design
  writeup this release is based on. Follow-up implementation issues: #82, #83, #84.

## [0.2.1] - 2026-06-29
- Add shared backend API transport in `src/utils/http.ts` using `axios` + `axios-retry`
- Add automatic retries for transient backend failures (`429`, `5xx`, network errors)
- Migrate backend SDK endpoints from `fetch` to shared retry-aware transport:
	- `TrustFlowEscrowClient.getGigs`
	- `DisputeClient.raiseDispute` / `DisputeClient.getDispute`
	- `requestChallenge` / `verifyAndGetToken`
- Add Jest coverage for retry policy and backend transport behavior
- Add Jest tests validating contract argument XDR payload encoding
- Architectural decision: centralize backend HTTP behavior to avoid endpoint-specific retry drift

## [0.2.0] - 2026-04-28
- Add DisputeClient for dispute management
- Add EscrowMonitor for real-time event polling
- Add typed error classes and logger
- Add comprehensive test suite (10 files, 40+ tests)

## [0.1.0] - 2026-03-01
- Initial SDK release
- EscrowClient, EscrowBuilder, AuthSession
- Stellar network helpers and validators
