import "server-only";
import { createPrivateKey, createPublicKey, sign, type KeyObject } from "node:crypto";
import { META } from "@/lib/shared/cards";
import { signingPayload } from "@/lib/shared/signature";
import { env } from "./env";

let keys: { priv: KeyObject; publicRaw: string } | null = null;

function load() {
  if (keys) return keys;
  const priv = createPrivateKey({ key: Buffer.from(env().STATE_SIGNING_KEY, "base64"), format: "der", type: "pkcs8" });
  // Raw 32-byte public key = last 32 bytes of the SPKI DER encoding.
  const spki = createPublicKey(priv).export({ format: "der", type: "spki" });
  keys = { priv, publicRaw: Buffer.from(spki.subarray(spki.length - 32)).toString("base64url") };
  return keys;
}

/** base64url raw Ed25519 public key, served to clients. */
export function statePublicKey(): string {
  return load().publicRaw;
}

/** Metadata entries for a card/pool message: the state JSON and its signature, bound to the card/pool ID. */
export function signedMetadata(refId: string, state: object): Record<string, string> {
  const json = JSON.stringify(state);
  const sig = sign(null, Buffer.from(signingPayload(refId, json), "utf8"), load().priv).toString("base64url");
  return { [META.state]: json, [META.sig]: sig };
}
