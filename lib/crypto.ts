import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";

// デモモード専用の固定値。Google 連携時は SESSION_SECRET が必須(config.ts で検査)。
const DEMO_SECRET = "demo-mode-secret-not-for-real-data";

function key(purpose: string): Buffer {
  const secret = config.sessionSecret ?? DEMO_SECRET;
  return createHash("sha256").update(`${purpose}:${secret}`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("enc"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** 復号できない(改ざん・鍵違い・壊れた値)場合は null */
export function decrypt(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 28) return null;
    const decipher = createDecipheriv("aes-256-gcm", key("enc"), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function sign(value: string): string {
  return createHmac("sha256", key("sig")).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
