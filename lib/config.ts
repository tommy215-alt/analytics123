const env = (name: string): string | undefined => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

export const config = {
  get appPassword() {
    return env("APP_PASSWORD");
  },
  /**
   * 暗号化と署名の元になる秘密の値。
   * SESSION_SECRET が無ければ、Google のクライアントシークレット(十分に長いランダム値)と
   * パスワードから作るので、設定する環境変数は3つで済む。
   */
  get sessionSecret() {
    const explicit = env("SESSION_SECRET");
    if (explicit) return explicit;
    const clientSecret = env("GOOGLE_CLIENT_SECRET");
    const password = env("APP_PASSWORD");
    return clientSecret && password ? `derived:${clientSecret}:${password}` : undefined;
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
  const explicit = env("SESSION_SECRET");
  if (explicit && explicit.length < 32) problems.push("SESSION_SECRET が32文字未満です(未設定でも動きます)。");
  return problems;
}

export function usesRedis(): boolean {
  return Boolean(config.redisUrl && config.redisToken);
}
