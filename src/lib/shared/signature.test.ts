import { test } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { importVerifyKey, signingPayload, verifyState } from "./signature.ts";

// Mirrors src/lib/server/signing.ts (which is server-only and env-bound).
const { privateKey } = generateKeyPairSync("ed25519");
const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
const publicRaw = Buffer.from(spki.subarray(spki.length - 32)).toString("base64url");
const signState = (messageId: string, state: string) =>
  sign(null, Buffer.from(signingPayload(messageId, state)), privateKey).toString("base64url");

test("server signature (node:crypto) verifies with @noble/ed25519; tampering and replay onto another card are detected", async () => {
  const key = importVerifyKey(publicRaw);
  assert.ok(key, "public key decodes");
  assert.equal(importVerifyKey("short"), null);
  const state = JSON.stringify({ ver: 3, confirms: 17, disputes: 1 });
  const sig = signState("MSG-1", state);

  assert.equal(await verifyState(key, "MSG-1", state, sig), true);
  // Edited tally
  assert.equal(await verifyState(key, "MSG-1", state.replace("17", "99"), sig), false);
  // Valid state replayed onto a different message
  assert.equal(await verifyState(key, "MSG-2", state, sig), false);
  // Garbage signature
  assert.equal(await verifyState(key, "MSG-1", state, "not-a-signature"), false);
});
