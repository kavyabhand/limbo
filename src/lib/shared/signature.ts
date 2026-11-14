/**
 * Verifying server-signed live state in the browser.
 *
 * Card tallies and pool seats live in Nexconn message metadata. Any member of a
 * community channel can technically write metadata from the client SDK, so the
 * server signs each state with Ed25519 and clients only trust state whose
 * signature checks out against the server's public key.
 *
 * Uses @noble/ed25519 (pure JS, audited) rather than WebCrypto's Ed25519, which
 * only shipped in Chrome 137 / Safari 17 and is missing on many phones.
 */
import { verifyAsync } from "@noble/ed25519";

/**
 * Exactly what gets signed. Binds the state to one card or pool ID (which is also
 * inside the message content), so a valid state cannot be replayed onto another card.
 */
export function signingPayload(refId: string, state: string): string {
  return `${refId}|${state}`;
}

export function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface VerifyKey {
  raw: Uint8Array;
}

/** Decodes the raw 32-byte public key. Returns null if it is malformed. */
export function importVerifyKey(publicKeyB64Url: string): VerifyKey | null {
  try {
    const raw = base64UrlToBytes(publicKeyB64Url);
    return raw.length === 32 ? { raw } : null;
  } catch {
    return null;
  }
}

export async function verifyState(key: VerifyKey, refId: string, state: string, signatureB64Url: string): Promise<boolean> {
  try {
    const sig = base64UrlToBytes(signatureB64Url);
    if (sig.length !== 64) return false;
    return await verifyAsync(sig, new TextEncoder().encode(signingPayload(refId, state)), key.raw);
  } catch {
    return false;
  }
}
