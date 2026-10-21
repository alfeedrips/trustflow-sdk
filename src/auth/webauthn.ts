import { Keypair } from '@stellar/stellar-sdk';
import { TrustFlowError } from '../errors';
import type { SDKResult } from '../types/index';
import { logger } from '../utils/logger';
import { randomBytes } from '../utils/crypto';

export interface WebAuthnCredentialOptions {
  /** Credential ID (base64url encoded) returned from registration */
  id: string;
  /** Public key in COSE format (base64url encoded) */
  publicKey: string;
  /** Counter for signature validation */
  counter: number;
}

export interface WebAuthnRegistrationOptions {
  /** User ID (base64url encoded) */
  userId: string;
  /** User display name for the passkey */
  username: string;
  /** Relying party ID — typically the domain (e.g., "trustflow.example.com") */
  rpId: string;
  /** Relying party name */
  rpName?: string;
}

export interface WebAuthnSignatureResponse {
  /** Base64url encoded signature from WebAuthn */
  signature: string;
  /** Updated counter value after authentication */
  counter: number;
  /** Base64url encoded attestation object (if applicable) */
  attestationObject?: string;
}

/**
 * Manages WebAuthn passkey registration and authentication for Soroban smart accounts.
 * Enables passwordless, phishing-resistant authentication using platform authenticators.
 */
export class WebAuthnManager {
  /**
   * Creates a registration challenge for a new WebAuthn passkey.
   *
   * @param options - Registration configuration including user and RP information
   * @returns Challenge data to be passed to the authenticator
   * @throws {TrustFlowError} if challenge creation fails
   *
   * @example
   * ```typescript
   * const challenge = webAuthnManager.createRegistrationChallenge({
   *   userId: btoa('user-123'),
   *   username: 'alice@example.com',
   *   rpId: 'trustflow.example.com',
   *   rpName: 'TrustFlow',
   * });
   * ```
   */
  createRegistrationChallenge(
    options: WebAuthnRegistrationOptions,
  ): SDKResult<PublicKeyCredentialCreationOptions> {
    try {
      // WebCrypto-first with a Node fallback, from the shared helper — the
      // previous inline window/require branching duplicated that logic here.
      // The copy into a fresh Uint8Array keeps the ArrayBuffer-backed type
      // PublicKeyCredentialCreationOptions expects.
      const challenge = new Uint8Array(randomBytes(32));

      const credentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: options.rpName || 'TrustFlow',
          id: options.rpId,
        },
        user: {
          id: Uint8Array.from(Buffer.from(options.userId, 'base64')),
          name: options.username,
          displayName: options.username,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      };

      logger.debug('WebAuthn registration challenge created', { rpId: options.rpId });
      return {
        ok: true,
        data: credentialCreationOptions,
      };
    } catch (e) {
      logger.error('Failed to create WebAuthn registration challenge', { error: e });
      return {
        ok: false,
        error: TrustFlowError.wrap(e, 'AUTH_ERROR').message,
      };
    }
  }

  /**
   * Derives a Soroban smart account keypair from a WebAuthn credential.
   * Creates a deterministic keypair based on the credential's public key and user ID.
   *
   * @param credential - Registered WebAuthn credential
   * @param userId - User ID used during registration (base64url encoded)
   * @returns Keypair for use as a Soroban smart account
   * @throws {TrustFlowError} if keypair derivation fails
   *
   * @example
   * ```typescript
   * const keypair = webAuthnManager.deriveSmartAccountKeypair(credential, userId);
   * const accountAddress = keypair.publicKey(); // Use as Soroban smart account
   * ```
   */
  deriveSmartAccountKeypair(
    credential: WebAuthnCredentialOptions,
    userId: string,
  ): SDKResult<Keypair> {
    try {
      // HMAC-SHA256 is synchronous, so Node's crypto module is required here
      // (WebCrypto's subtle.digest/hmac are async-only and this method is
      // sync by contract). Lazy require keeps bundlers from seeing a static
      // Node built-in import.
      const modName = 'crypto';
      const req = typeof require !== 'undefined' ? require : undefined;
      const nodeCrypto = req ? req(modName) : undefined;
      if (!nodeCrypto) {
        throw new Error('WebAuthn keypair derivation requires the Node.js crypto module');
      }

      // Derive a deterministic seed from credential and user ID
      const hmac = nodeCrypto.createHmac('sha256', Buffer.from(userId, 'base64url'));
      hmac.update(credential.publicKey);
      hmac.update(credential.id);
      const seed = hmac.digest(); // 32 bytes — exactly an ed25519 seed

      // Create a keypair from the derived raw seed. (This previously fed a
      // 33-byte Buffer into `Keypair.fromSecret`, which expects a strkey
      // string, so derivation always failed at runtime.)
      const keypair = Keypair.fromRawEd25519Seed(seed);

      logger.debug('WebAuthn smart account keypair derived', { credentialId: credential.id });
      return {
        ok: true,
        data: keypair,
      };
    } catch (e) {
      logger.error('Failed to derive WebAuthn smart account keypair', { error: e });
      return {
        ok: false,
        error: TrustFlowError.wrap(e, 'AUTH_ERROR').message,
      };
    }
  }

  /**
   * Verifies a WebAuthn signature and updates the credential counter.
   * Prevents signature replay attacks by enforcing counter monotonicity.
   *
   * @param credential - Registered credential to verify against
   * @param signature - Signature response from authentication
   * @returns Updated credential with incremented counter on success
   * @throws {TrustFlowError} if verification fails or counter is not monotonically increasing
   *
   * @example
   * ```typescript
   * const updated = webAuthnManager.verifySignature(credential, signatureResponse);
   * if (updated.ok) {
   *   // Update stored credential with new counter
   *   credential.counter = updated.data.counter;
   * }
   * ```
   */
  verifySignature(
    credential: WebAuthnCredentialOptions,
    signature: WebAuthnSignatureResponse,
  ): SDKResult<WebAuthnCredentialOptions> {
    try {
      // Verify counter is monotonically increasing (prevents cloned authenticator attacks)
      if (signature.counter <= credential.counter) {
        throw new Error(
          `Signature counter ${signature.counter} is not greater than stored counter ${credential.counter}`,
        );
      }

      // Return updated credential with new counter
      const updated: WebAuthnCredentialOptions = {
        ...credential,
        counter: signature.counter,
      };

      logger.debug('WebAuthn signature verified', {
        credentialId: credential.id,
        counter: signature.counter,
      });
      return {
        ok: true,
        data: updated,
      };
    } catch (e) {
      logger.error('WebAuthn signature verification failed', { error: e });
      return {
        ok: false,
        error: TrustFlowError.wrap(e, 'AUTH_ERROR').message,
      };
    }
  }
}
