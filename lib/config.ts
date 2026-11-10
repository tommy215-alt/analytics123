const env = (name: string): string | undefined => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

export const config = {
  get appPassword() {
    return env("APP_PASSWORD");
  },
  get sessionSecret() {
    return env("SESSION_SECRET");
  },
  get googleClientId() {
    return env("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return env("GOOGLE_CLIENT_SECRET");
  },
  get appUrl() {
    return env("APP_URL")?.replace(/\/+$/, "");
  },
  get redisUrl() {
    return (env("UPSTASH_REDIS_REST_URL") ?? env("KV_REST_API_URL"))?.replace(/\/+$/, "");
  },
  get redisToken() {
    return env("UPSTASH_REDIS_REST_TOKEN") ?? env("KV_REST_API_TOKEN");
  },
};

/** Google の認証情報が未設定のあいだは、サンプルデータで動くデモモードになる */
export function isDemoMode(): boolean {
  return !config.googleClientId || !config.googleClientSecret;
}

/**
 * 設定の不備を返す。Google 連携を有効にするなら、
 * パスワードと秘密鍵が無い状態では動かさない(誰でも見られてしまうため)。
 */
export function configProblems(): string[] {
  if (isDemoMode()) return [];
  const problems: string[] = [];
  if (!config.appPassword) problems.push("APP_PASSWORD が設定されていません。");
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    problems.push("SESSION_SECRET が未設定か、32文字未満です。");
  }
  return problems;
}

export function usesRedis(): boolean {
  return Boolean(config.redisUrl && config.redisToken);
}
