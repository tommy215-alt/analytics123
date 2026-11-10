import { cookies } from "next/headers";
import { cookieBase } from "./auth.ts";
import { config, usesRedis } from "./config.ts";
import { decrypt, encrypt } from "./crypto.ts";
import type { Account, RefChannel } from "./types.ts";

/**
 * 連携したアカウントと参考チャンネルの保存先。
 * - Redis(Upstash)が設定されていればサーバー側に保存し、どの端末からも同じ内容が見える。
 * - 未設定なら、暗号化して端末ごとの Cookie に保存する(追加の契約なしで動く)。
 * Cookie への書き込みは Server Action と Route Handler からのみ行えるので、
 * 書き込み系の関数はそこからだけ呼ぶこと。
 */

const ACCOUNT_COOKIE_PREFIX = "ytm_a_";
const REFS_COOKIE = "ytm_refs";
const ACTIVE_COOKIE = "ytm_active";
const YEAR = 365 * 86400;
const REDIS_ACCOUNTS = "ytm:accounts";
const REDIS_REFS = "ytm:refs";

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(config.redisUrl!, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`保存先(Redis)への接続に失敗しました(${res.status})`);
  return ((await res.json()) as { result: unknown }).result;
}

function unpack<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const plain = decrypt(token);
  if (!plain) return null;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}

export async function listAccounts(): Promise<Account[]> {
  let accounts: Account[];
  if (usesRedis()) {
    accounts = unpack<Account[]>((await redis(["GET", REDIS_ACCOUNTS])) as string | null) ?? [];
  } else {
    accounts = (await cookies())
      .getAll()
      .filter((c) => c.name.startsWith(ACCOUNT_COOKIE_PREFIX))
      .map((c) => unpack<Account>(c.value))
      .filter((a): a is Account => a !== null);
  }
  return accounts.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export async function upsertAccount(account: Account): Promise<void> {
  if (usesRedis()) {
    const rest = (await listAccounts()).filter((a) => a.channelId !== account.channelId);
    await redis(["SET", REDIS_ACCOUNTS, encrypt(JSON.stringify([...rest, account]))]);
  } else {
    (await cookies()).set(ACCOUNT_COOKIE_PREFIX + account.channelId, encrypt(JSON.stringify(account)), {
      ...cookieBase,
      maxAge: YEAR,
    });
  }
}

export async function deleteAccount(channelId: string): Promise<void> {
  if (usesRedis()) {
    const rest = (await listAccounts()).filter((a) => a.channelId !== channelId);
    await redis(["SET", REDIS_ACCOUNTS, encrypt(JSON.stringify(rest))]);
  } else {
    (await cookies()).delete(ACCOUNT_COOKIE_PREFIX + channelId);
  }
}

export async function listRefs(): Promise<RefChannel[]> {
  const token = usesRedis()
    ? ((await redis(["GET", REDIS_REFS])) as string | null)
    : (await cookies()).get(REFS_COOKIE)?.value;
  return unpack<RefChannel[]>(token) ?? [];
}

export async function saveRefs(refs: RefChannel[]): Promise<void> {
  const token = encrypt(JSON.stringify(refs));
  if (usesRedis()) await redis(["SET", REDIS_REFS, token]);
  else (await cookies()).set(REFS_COOKIE, token, { ...cookieBase, maxAge: YEAR });
}

/** 表示中のチャンネルは端末ごとに覚える */
export async function getActiveId(): Promise<string | undefined> {
  return (await cookies()).get(ACTIVE_COOKIE)?.value;
}

export async function setActiveId(channelId: string): Promise<void> {
  (await cookies()).set(ACTIVE_COOKIE, channelId, { ...cookieBase, maxAge: YEAR });
}
