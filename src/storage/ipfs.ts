import type { SDKResult } from '../types/index';
import { createApiHttpClient, toApiErrorMessage } from '../utils/http';

/** Default upload endpoint — a raw-body IPFS upload API (e.g. web3.storage-compatible). */
const DEFAULT_IPFS_API_URL = 'https://api.web3.storage/upload';
/** Default read gateway used to build a browsable URL from a returned CID. */
const DEFAULT_IPFS_GATEWAY = 'https://w3s.link/ipfs';

export interface IPFSConfig {
  /** Upload endpoint. Defaults to a web3.storage-compatible raw-body upload API. */
  apiUrl?: string;
  /** Bearer token / API key for the upload service. */
  apiKey?: string;
  /** Read gateway used to build the returned `url` from a CID. */
  gatewayUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
}

export interface IPFSUploadOptions {
  /** Original filename, forwarded to the upload service when supported. */
  filename?: string;
  /** MIME type of the file. Defaults to `application/octet-stream`. */
  contentType?: string;
}

export interface IPFSUploadResult {
  /** Content identifier of the uploaded file. */
  cid: string;
  /** Gateway URL the uploaded file can be fetched from. */
  url: string;
}

/**
 * Minimal IPFS upload helper — `trustflow.storage.upload(file)`.
 *
 * Uploads a file as a raw request body (no multipart/form-data encoding),
 * which is compatible with web3.storage-style upload APIs. Point `apiUrl`
 * at any service that accepts a raw file body and returns `{ cid }`.
 *
 * @example
 * ```typescript
 * const storage = new IPFSStorage({ apiKey: process.env.IPFS_API_KEY });
 * const result = await storage.upload(fileBuffer, { filename: 'contract.pdf' });
 * if (result.ok) console.log('Uploaded:', result.data.url);
 * ```
 */
export class IPFSStorage {
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly gatewayUrl: string;
  private readonly timeoutMs?: number;

  constructor(config: IPFSConfig = {}) {
    this.apiUrl = config.apiUrl ?? DEFAULT_IPFS_API_URL;
    this.apiKey = config.apiKey;
    this.gatewayUrl = config.gatewayUrl ?? DEFAULT_IPFS_GATEWAY;
    this.timeoutMs = config.timeoutMs;
  }

  /**
   * Uploads a file to IPFS.
   *
   * @param file - File contents as a `Buffer` or `Uint8Array`
   * @param options - Optional filename / content type metadata
   * @returns `{ ok: true, data: { cid, url } }` on success, `{ ok: false, error }` on failure
   */
  async upload(
    file: Buffer | Uint8Array,
    options: IPFSUploadOptions = {},
  ): Promise<SDKResult<IPFSUploadResult>> {
    if (!file || file.byteLength === 0) {
      return { ok: false, error: 'file must be a non-empty Buffer or Uint8Array' };
    }

    const http = createApiHttpClient({
      baseURL: this.apiUrl,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      additionalHeaders: {
        'Content-Type': options.contentType ?? 'application/octet-stream',
        ...(options.filename ? { 'X-Name': options.filename } : {}),
      },
    });

    try {
      const response = await http.post<{ cid?: string }>('/', file);
      const cid = response.data?.cid;
      if (!cid) {
        return { ok: false, error: 'Upload succeeded but response did not include a CID' };
      }
      return { ok: true, data: { cid, url: `${this.gatewayUrl}/${cid}` } };
    } catch (err) {
      return { ok: false, error: toApiErrorMessage(err) };
    }
  }
}
