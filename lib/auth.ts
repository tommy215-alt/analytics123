import { cookies } from "next/headers";
import { config } from "./config.ts";
import { safeEqual, sign } from "./crypto.ts";

const SESSION_COOKIE = "ytm_session";
const SESSION_DAYS = 90;

export const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** パスワード未設定(デモモード)のときはログイン不要 */
export function loginRequired(): boolean {
  return Boolean(config.appPassword);
}

export async function isLoggedIn(): Promise<boolean> {
  if (!loginRequired()) return true;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig) return false;
  if (!safeEqual(sig, sign(`session:${exp}`))) return false;
  return Number(exp) > Date.now();
}

export function checkPassword(input: string): boolean {
  const expected = config.appPassword;
  if (!expected) return false;
  return safeEqual(input, expected);
}

export async function startSession(): Promise<void> {
  const exp = String(Date.now() + SESSION_DAYS * 86400_000);
  (await cookies()).set(SESSION_COOKIE, `${exp}.${sign(`session:${exp}`)}`, {
    ...cookieBase,
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
