import { config } from "./config.ts";
import type { Account } from "./types.ts";

export const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** 連携が切れていて、もう一度 Google でログインし直す必要がある状態 */
export class ReauthRequiredError extends Error {
  constructor() {
    super("Google との連携が切れています。「アカウント」画面から連携し直してください。");
    this.name = "ReauthRequiredError";
  }
}

export class GoogleApiError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.reason = reason;
  }
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // 毎回同意画面を出して、必ず refresh_token を受け取る
    prompt: "consent select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId!,
      client_secret: config.googleClientSecret!,
      ...body,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    if (json.error === "invalid_grant") {
      // 連携時(認可コードの交換)と、連携後(トークン更新)では意味が違う
      if (body.grant_type === "authorization_code") {
        throw new GoogleApiError(res.status, "Google の認可コードが無効か期限切れです。もう一度連携をお試しください。");
      }
      throw new ReauthRequiredError();
    }
    throw new GoogleApiError(res.status, `Google 認証に失敗しました: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json;
}

export function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

// アクセストークン(約1時間有効)とAPI応答のメモリ内キャッシュ。
// サーバーのインスタンスごとに持つだけなので、消えても取り直すだけで済む。
type Cached<T> = { value: T; expires: number };
const g = globalThis as unknown as {
  __ytmTokens?: Map<string, Cached<string>>;
  __ytmResponses?: Map<string, Cached<unknown>>;
};
const tokenCache = (g.__ytmTokens ??= new Map());
const responseCache = (g.__ytmResponses ??= new Map());
const MAX_CACHED_RESPONSES = 500;

export async function accessTokenFor(account: Pick<Account, "channelId" | "refreshToken">): Promise<string> {
  const hit = tokenCache.get(account.channelId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const token = await tokenRequest({ refresh_token: account.refreshToken, grant_type: "refresh_token" });
  tokenCache.set(account.channelId, {
    value: token.access_token,
    expires: Date.now() + (token.expires_in - 120) * 1000,
  });
  return token.access_token;
}

export function forgetAccount(channelId: string): void {
  tokenCache.delete(channelId);
  for (const key of responseCache.keys()) {
    if (key.startsWith(`${channelId}|`)) responseCache.delete(key);
  }
}

function describeError(status: number, reason: string | undefined, message: string | undefined): string {
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return "YouTube API の1日の利用上限に達しました。日本時間の夕方ごろにリセットされます。";
  }
  if (status === 403 && reason === "accessNotConfigured") {
    return "Google Cloud 側で API が有効になっていません(YouTube Data API v3 と YouTube Analytics API を有効にしてください)。";
  }
  return `YouTube API エラー(${status}${reason ? ` ${reason}` : ""}): ${message ?? "不明なエラー"}`;
}

/** アクセストークン付きで Google API を GET する(JSON)。 */
export async function googleGetWithToken<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    if (res.status === 401) throw new ReauthRequiredError();
    const reason = body.error?.errors?.[0]?.reason;
    throw new GoogleApiError(res.status, describeError(res.status, reason, body.error?.message), reason);
  }
  return (await res.json()) as T;
}

/** 連携済みアカウントの権限で GET する。ttlSec のあいだは同じURLの結果を使い回す。 */
export async function googleGet<T>(account: Account, url: string, ttlSec: number): Promise<T> {
  const cacheKey = `${account.channelId}|${url}`;
  const hit = responseCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const data = await googleGetWithToken<T>(await accessTokenFor(account), url);

  if (responseCache.size >= MAX_CACHED_RESPONSES) {
    const now = Date.now();
    for (const [key, entry] of responseCache) if (entry.expires <= now) responseCache.delete(key);
    if (responseCache.size >= MAX_CACHED_RESPONSES) responseCache.clear();
  }
  responseCache.set(cacheKey, { value: data, expires: Date.now() + ttlSec * 1000 });
  return data;
}
