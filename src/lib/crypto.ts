import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

function key(): Buffer {
  const kek = process.env.DATA_ENCRYPTION_KEK;
  if (!kek) throw new Error("DATA_ENCRYPTION_KEK is not set");
  // scrypt makes the KEK length-independent. Salt is intentionally constant —
  // the KEK itself is the secret, scrypt just stretches it to 32 bytes.
  return scryptSync(kek, "volvo-charging.kek-salt.v1", KEY_LEN);
}

/**
 * Encrypt a UTF-8 string. Output format: base64(iv || tag || ciphertext).
 */
export function encrypt(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decrypt(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
