import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
const { decrypt, encrypt, safeEqual, sign } = await import("../lib/crypto.ts");

test("encrypt したものは decrypt で元に戻り、毎回違う値になる", () => {
  const a = encrypt("更新トークン");
  const b = encrypt("更新トークン");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "更新トークン");
});

test("改ざんされた値や壊れた値は null になる", () => {
  const token = encrypt("secret");
  const tampered = token.slice(0, -2) + (token.endsWith("A") ? "B" : "A") + token.slice(-1);
  assert.equal(decrypt(tampered), null);
  assert.equal(decrypt("short"), null);
  assert.equal(decrypt(""), null);
});

test("鍵が変わると復号できず、署名も変わる", () => {
  const token = encrypt("secret");
  const signature = sign("session:1");
  process.env.SESSION_SECRET = "another-secret-another-secret-another-1";
  assert.equal(decrypt(token), null);
  assert.notEqual(sign("session:1"), signature);
});

test("safeEqual", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});
