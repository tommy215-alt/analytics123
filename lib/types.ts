export type Account = {
  channelId: string;
  title: string;
  handle?: string;
  thumbnail?: string;
  refreshToken: string;
  addedAt: string;
};

/** 画面に渡してよい範囲のアカウント情報(トークンを含まない) */
export type AccountInfo = Omit<Account, "refreshToken">;

export type RefChannel = {
  channelId: string;
  title: string;
  handle?: string;
  thumbnail?: string;
};

export type Video = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  durationSec: number;
  views: number;
  likes: number | null;
  comments: number | null;
  tags: string[];
  categoryId?: string;
  isLive?: boolean;
  /** タイトル・タグ・説明文に AI 関連の語がある(キーワードによる推定) */
  aiRelated?: boolean;
  /** 投稿者が「改変・合成コンテンツ」と申告している(API が返した場合のみ) */
  synthetic?: boolean;
};

export type ChannelSummary = {
  channelId: string;
  title: string;
  handle?: string;
  thumbnail?: string;
  subscribers: number | null;
  totalViews: number;
  videoCount: number;
};

export type DailyPoint = {
  date: string;
  views: number;
  minutes: number;
  subsGained: number;
  subsLost: number;
  likes: number;
  avgViewDurationSec: number;
};

export type Totals = {
  views: number;
  minutes: number;
  avgViewDurationSec: number;
  subsGained: number;
  subsLost: number;
  likes: number;
  comments: number;
  shares: number;
};

export type TopVideoRow = {
  videoId: string;
  views: number;
  minutes: number;
  avgViewDurationSec: number;
  avgViewPercentage: number;
  subsGained: number;
};

export type NamedValue = { key: string; label: string; value: number };

export type Demographics = {
  ages: NamedValue[];
  genders: NamedValue[];
};

/** 取得に失敗しても画面全体は止めないための結果型 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
