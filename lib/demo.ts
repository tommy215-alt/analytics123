import type { DateRange } from "./format.ts";
import type { AccountInfo, ChannelSummary, DailyPoint, Demographics, NamedValue, RefChannel, TopVideoRow, Totals, Video } from "./types.ts";

/**
 * Google 連携を設定する前に画面を確認するためのサンプルデータ。
 * 実在のチャンネルや動画とは関係のない、作り物の数字とタイトル。
 */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const DEMO_ACCOUNTS: AccountInfo[] = [
  { channelId: "UCdemo000000000000000001", title: "サンプル料理チャンネル", handle: "@sample-kitchen", addedAt: "2026-01-01T00:00:00Z" },
  { channelId: "UCdemo000000000000000002", title: "サンプルゲーム実況", handle: "@sample-games", addedAt: "2026-02-01T00:00:00Z" },
];

export const DEMO_REFS: RefChannel[] = [
  { channelId: "UCdemoref0000000000000001", title: "参考チャンネルA(サンプル)", handle: "@reference-a" },
  { channelId: "UCdemoref0000000000000002", title: "参考チャンネルB(サンプル)", handle: "@reference-b" },
];

const PALETTES = [
  ["#2a78d6", "#86b6ef"],
  ["#eb6834", "#f5b08f"],
  ["#1baf7a", "#8fd9bd"],
  ["#6250d6", "#b0a7ee"],
  ["#e87ba4", "#f4bdd2"],
];

function demoThumb(seed: number, vertical: boolean): string {
  const [a, b] = PALETTES[seed % PALETTES.length];
  const inner = vertical
    ? `<rect x="124" y="0" width="72" height="180" fill="${b}" opacity=".55"/>`
    : `<circle cx="${80 + (seed % 160)}" cy="${60 + (seed % 60)}" r="46" fill="${b}" opacity=".55"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="${a}"/>${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const TOPICS: Record<string, { long: string[]; short: string[]; tags: string[] }> = {
  cooking: {
    long: [
      "【保存版】平日5日分の作り置きおかず10品",
      "プロが教える失敗しないチャーハンの作り方",
      "100円食材だけで1週間暮らしてみた結果",
      "【検証】高級卵と普通の卵、本当に違いはある?",
      "一人暮らしの自炊ルーティン|仕事終わりの30分",
      "炊飯器に入れるだけ!ほったらかし角煮",
      "【初心者向け】包丁の研ぎ方を1から解説",
      "業務用スーパーで買うべき冷凍食材ベスト7",
    ],
    short: [
      "卵1個でふわふわオムレツ #shorts",
      "30秒でわかる玉ねぎのみじん切り",
      "レンジで3分!やみつきキャベツ #簡単レシピ",
      "知らないと損する米の研ぎ方",
      "コンビニ食材だけで作る夜食 #shorts",
      "バズった無限ピーマン作ってみた!",
    ],
    tags: ["レシピ", "簡単レシピ", "作り置き", "自炊", "料理", "時短", "節約"],
  },
  games: {
    long: [
      "【初見実況】話題の新作を最後までプレイ #1",
      "世界ランク1位の立ち回りを徹底解説",
      "【縛りプレイ】初期装備だけでラスボスに挑む",
      "新シーズン最強キャラランキングTOP10",
      "100日間サバイバルしたらどうなる?【総集編】",
      "視聴者参加型!深夜のランクマッチ配信まとめ",
      "【検証】このバグ技、本当に使える?",
    ],
    short: [
      "神回避すぎた瞬間 #shorts",
      "1秒で決まった逆転劇!",
      "初心者がやりがちなミス3選 #ゲーム",
      "この裏技知ってた? #shorts",
      "ラスト1人で大逆転した結果…!",
    ],
    tags: ["ゲーム実況", "攻略", "初見", "解説", "ランクマ", "総集編"],
  },
  general: {
    long: [
      "【密着】早朝4時から働く職人の1日",
      "買ってよかったもの2026年上半期ベスト10",
      "【検証】1か月毎日続けたら人生は変わるのか?",
      "誰でもできるスマホ動画編集の基本",
      "初めての一人旅で失敗したこと7選",
      "【ルームツアー】6畳ワンルームの収納術",
      "話題の新商品を正直にレビューします",
      "プロに聞いた睡眠の質を上げる5つの習慣",
    ],
    short: [
      "3秒で笑える猫のリアクション #shorts",
      "知らなかった!洗濯の裏ワザ",
      "これは便利すぎる…!100均の新商品",
      "意外と知らない電車の豆知識 #雑学",
      "朝の5分ストレッチ #shorts",
      "子犬が初めて雪を見た結果!",
    ],
    tags: ["検証", "レビュー", "ルーティン", "雑学", "裏ワザ", "vlog", "日常"],
  },
  global: {
    long: [
      "I Spent 50 Hours Building a Tiny House",
      "Why Everyone Is Quitting This Job (Explained)",
      "We Tried Every Street Food in One Night",
      "The Truth About Cheap Flights in 2026",
      "How This 19-Year-Old Built a $1M Business",
      "Top 10 Gadgets You Actually Need",
      "24 Hours in the World's Smallest Hotel",
    ],
    short: [
      "Wait for it… #shorts",
      "He did NOT expect that!",
      "This trick saves you 10 minutes #lifehack",
      "POV: your dog learns a new word",
      "3 mistakes every beginner makes",
      "Is this the best goal of 2026?",
    ],
    tags: ["challenge", "vlog", "explained", "lifehack", "review", "funny"],
  },
  ai_ja: {
    long: [
      "【生成AI】全編AIで短編アニメを作ってみた",
      "AIだけで1曲作ってMVまで完成させる方法",
      "【検証】AI動画はどこまで実写に近づいたのか?",
      "初心者向け|AI動画生成ツール5つを比較",
      "AIで作る解説動画の作り方を全部見せます",
    ],
    short: [
      "AIが描いた100年後の東京 #AI",
      "この猫、実は全部AI生成です",
      "AIに昭和のCMを作らせた結果!",
      "AI生成で歴史上の人物が自撮りしたら",
      "1枚の写真からAIで動画を作る #shorts",
    ],
    tags: ["AI", "生成AI", "AI動画", "AIアニメ", "Sora", "Suno"],
  },
  ai_en: {
    long: [
      "I Made a Short Film Using Only AI",
      "AI Video Generators Ranked: 2026 Edition",
      "Can AI Write a Hit Song? Full Experiment",
      "How I Make Faceless AI Videos (Full Workflow)",
      "This AI Animation Took Me 3 Hours",
    ],
    short: [
      "AI imagines cities in the year 3000 #ai",
      "This cat is 100% AI generated",
      "AI recreates famous paintings as selfies",
      "If history had smartphones (AI) #shorts",
      "One photo → AI video in 10 seconds",
    ],
    tags: ["AI", "ai generated", "ai video", "ai animation", "Sora", "Midjourney"],
  },
};

function topicFor(channelId: string): keyof typeof TOPICS {
  if (channelId === DEMO_ACCOUNTS[0].channelId) return "cooking";
  if (channelId === DEMO_ACCOUNTS[1].channelId) return "games";
  return "general";
}

function makeVideos(seedKey: string, topic: keyof typeof TOPICS, count: number, opts: { maxAgeDays: number; scale: number; channelTitle?: string; channelId?: string; kind?: "long" | "short" }, now: number): Video[] {
  const rand = rng(hash(seedKey));
  const t = TOPICS[topic];
  const ai = topic === "ai_ja" || topic === "ai_en";
  const videos: Video[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rand();
    const short = opts.kind ? opts.kind === "short" : roll < 0.45;
    const pool = short ? t.short : t.long;
    const title = pool[Math.floor(rand() * pool.length)];
    const ageHours = 3 + rand() * opts.maxAgeDays * 24;
    const published = new Date(now - ageHours * 3600_000);
    // 夕方〜夜(日本時間)に公開が集まるようにする
    published.setUTCHours([8, 9, 10, 11, 12, 3][Math.floor(rand() * 6)], Math.floor(rand() * 60), 0, 0);
    const views = Math.round(opts.scale * (0.15 + rand() ** 3 * 6) * (short ? 1.6 : 1) * Math.min(1, ageHours / 72 + 0.2));
    const id = `demo-${hash(`${seedKey}:${i}`).toString(36)}`;
    videos.push({
      id,
      title,
      channelId: opts.channelId ?? `UCdemoother${String(i % 9).padStart(13, "0")}`,
      channelTitle: opts.channelTitle ?? `サンプルチャンネル${(i % 9) + 1}`,
      publishedAt: published.toISOString(),
      thumbnail: demoThumb(hash(id), short),
      durationSec: short ? 18 + Math.floor(rand() * 40) : 360 + Math.floor(rand() * 1500),
      views,
      likes: Math.round(views * (0.02 + rand() * 0.04)),
      comments: Math.round(views * (0.001 + rand() * 0.003)),
      tags: t.tags.filter(() => rand() < 0.45),
      isLive: false,
      aiRelated: ai,
      synthetic: ai && rand() < 0.5,
    });
  }
  return videos;
}

const scaleFor = (channelId: string): number => (channelId === DEMO_ACCOUNTS[1].channelId ? 42000 : 18000);

export function demoChannel(account: AccountInfo): ChannelSummary {
  const scale = scaleFor(account.channelId);
  return {
    channelId: account.channelId,
    title: account.title,
    handle: account.handle,
    subscribers: Math.round(scale * 2.9),
    totalViews: scale * 610,
    videoCount: account.channelId === DEMO_ACCOUNTS[1].channelId ? 412 : 187,
  };
}

export function demoUploads(account: AccountInfo, now = Date.now()): Video[] {
  return makeVideos(`uploads:${account.channelId}`, topicFor(account.channelId), 36, {
    maxAgeDays: 150,
    scale: scaleFor(account.channelId),
    channelTitle: account.title,
    channelId: account.channelId,
  }, now).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function demoDaily(account: AccountInfo, range: DateRange): DailyPoint[] {
  const base = scaleFor(account.channelId) / 4;
  const points: DailyPoint[] = [];
  const start = new Date(`${range.start}T00:00:00Z`).getTime();
  for (let i = 0; i < range.days; i++) {
    const day = new Date(start + i * 86400_000);
    const date = day.toISOString().slice(0, 10);
    const rand = rng(hash(`${account.channelId}:${date}`));
    const dayIndex = Math.floor(day.getTime() / 86400_000);
    const weekend = [0, 6].includes(day.getUTCDay()) ? 1.25 : 1;
    const trend = 1 + (dayIndex % 365) / 900;
    const spike = rand() < 0.07 ? 1.8 + rand() : 1;
    const views = Math.round(base * weekend * trend * spike * (0.8 + rand() * 0.4));
    points.push({
      date,
      views,
      minutes: Math.round(views * (2.1 + rand() * 0.6)),
      subsGained: Math.round(views / 260 + rand() * 6),
      subsLost: Math.round(views / 1500 + rand() * 3),
      likes: Math.round(views * (0.028 + rand() * 0.012)),
      avgViewDurationSec: 130 + rand() * 30,
    });
  }
  return points;
}

export function demoTotals(account: AccountInfo, range: DateRange): Totals {
  const daily = demoDaily(account, range);
  const sum = (pick: (p: DailyPoint) => number) => daily.reduce((total, p) => total + pick(p), 0);
  const views = sum((p) => p.views);
  const minutes = sum((p) => p.minutes);
  return {
    views,
    minutes,
    avgViewDurationSec: views === 0 ? 0 : (minutes * 60) / views,
    subsGained: sum((p) => p.subsGained),
    subsLost: sum((p) => p.subsLost),
    likes: sum((p) => p.likes),
    comments: Math.round(views * 0.002),
    shares: Math.round(views * 0.004),
  };
}

export function demoTopVideos(account: AccountInfo, range: DateRange): { rows: TopVideoRow[]; videos: Video[] } {
  const total = demoTotals(account, range).views;
  const videos = demoUploads(account).sort((a, b) => b.views - a.views).slice(0, 10);
  const weights = [0.2, 0.13, 0.09, 0.07, 0.05, 0.04, 0.035, 0.03, 0.025, 0.02];
  const rows = videos.map((v, i) => {
    const views = Math.round(total * weights[i]);
    const pct = v.durationSec <= 180 ? 72 + (i % 4) * 5 : 31 + (i % 5) * 4;
    const avg = (v.durationSec * pct) / 100;
    return {
      videoId: v.id,
      views,
      minutes: Math.round((views * avg) / 60),
      avgViewDurationSec: avg,
      avgViewPercentage: pct,
      subsGained: Math.round(views / 300),
    };
  });
  return { rows, videos };
}

export function demoTraffic(account: AccountInfo, range: DateRange): NamedValue[] {
  const total = demoTotals(account, range).views;
  const parts: [string, string, number][] = [
    ["SHORTS", "ショートフィード", 0.34],
    ["SUBSCRIBER", "ブラウジング(ホーム等)", 0.24],
    ["RELATED_VIDEO", "関連動画", 0.17],
    ["YT_SEARCH", "YouTube 検索", 0.13],
    ["EXT_URL", "外部サイト", 0.05],
    ["YT_CHANNEL", "チャンネルページ", 0.04],
    ["NOTIFICATION", "通知", 0.03],
  ];
  return parts.map(([key, label, share]) => ({ key, label, value: Math.round(total * share) }));
}

export function demoContentTypes(account: AccountInfo, range: DateRange): NamedValue[] {
  const total = demoTotals(account, range).views;
  return [
    { key: "videoOnDemand", label: "長尺動画", value: Math.round(total * 0.52) },
    { key: "shorts", label: "ショート", value: Math.round(total * 0.41) },
    { key: "liveStream", label: "ライブ配信", value: Math.round(total * 0.07) },
  ];
}

export function demoDemographics(): Demographics {
  return {
    ages: [
      { key: "age13-17", label: "13–17歳", value: 6 },
      { key: "age18-24", label: "18–24歳", value: 22 },
      { key: "age25-34", label: "25–34歳", value: 31 },
      { key: "age35-44", label: "35–44歳", value: 21 },
      { key: "age45-54", label: "45–54歳", value: 12 },
      { key: "age55-64", label: "55–64歳", value: 6 },
      { key: "age65-", label: "65歳以上", value: 2 },
    ],
    genders: [
      { key: "female", label: "女性", value: 56 },
      { key: "male", label: "男性", value: 43 },
      { key: "user_specified", label: "その他", value: 1 },
    ],
  };
}

export function demoRevenue(account: AccountInfo, range: DateRange): number {
  return Math.round(demoTotals(account, range).views * 0.21);
}

export function demoCountries(account: AccountInfo, range: DateRange): NamedValue[] {
  const total = demoTotals(account, range).views;
  const parts: [string, string, number][] = [
    ["JP", "日本", 0.86],
    ["US", "アメリカ合衆国", 0.05],
    ["TW", "台湾", 0.03],
    ["KR", "韓国", 0.02],
    ["TH", "タイ", 0.01],
  ];
  return parts.map(([key, label, share]) => ({ key, label, value: Math.round(total * share) }));
}

export function demoDevices(account: AccountInfo, range: DateRange): NamedValue[] {
  const total = demoTotals(account, range).views;
  const parts: [string, string, number][] = [
    ["MOBILE", "スマホ", 0.68],
    ["TV", "テレビ", 0.15],
    ["DESKTOP", "パソコン", 0.11],
    ["TABLET", "タブレット", 0.06],
  ];
  return parts.map(([key, label, share]) => ({ key, label, value: Math.round(total * share) }));
}

/** 急上昇・AI系・検索用のサンプル動画 */
export function demoTrendVideos(
  key: string,
  options: { days: number; kind: "long" | "short"; region: string; ai?: boolean },
  now = Date.now(),
): Video[] {
  const japan = options.region === "JP";
  const topic = options.ai ? (japan ? "ai_ja" : "ai_en") : japan ? "general" : "global";
  return makeVideos(`trend:${key}:${options.region}:${options.kind}`, topic, 30, { maxAgeDays: options.days, scale: 260000, kind: options.kind }, now).sort(
    (a, b) => b.views - a.views,
  );
}

export function demoRefUploads(ref: RefChannel, now = Date.now()): Video[] {
  return makeVideos(`ref:${ref.channelId}`, "general", 30, {
    maxAgeDays: 90,
    scale: 90000,
    channelTitle: ref.title,
    channelId: ref.channelId,
  }, now).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
