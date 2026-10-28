import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const VERSION = "v1";
const AAD = Buffer.from("icenter:checkout-pii:v1", "utf8");

function encryptionKey() {
  const encoded = process.env.REQUEST_PII_KEY;
  if (!encoded) throw new Error("REQUEST_PII_KEY is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("REQUEST_PII_KEY must be a canonical base64-encoded 32-byte key");
  }
  return key;
}

export function encryptPii(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPii<T>(payload: string): T {
  const [version, ivValue, tagValue, ciphertextValue, ...extra] = payload.split(".");
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue || extra.length) {
    throw new Error("Invalid encrypted PII payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const cleartext = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]);
  return JSON.parse(cleartext.toString("utf8")) as T;
}

export function requestHash(value: unknown) {
  return createHmac("sha256", encryptionKey()).update(JSON.stringify(value)).digest("hex");
}
