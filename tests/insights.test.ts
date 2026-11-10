import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeVideos, filterAndSort, isShort, jstParts, median, titleWords } from "../lib/insights.ts";
import type { Video } from "../lib/types.ts";

const NOW = new Date("2026-11-10T00:00:00Z").getTime();

function video(partial: Partial<Video>): Video {
  return {
    id: "v",
    title: "テスト",
    channelId: "c",
    channelTitle: "ch",
    publishedAt: "2026-11-09T00:00:00Z",
    thumbnail: "",
    durationSec: 600,
    views: 1000,
    likes: 10,
    comments: 1,
    tags: [],
    ...partial,
  };
}

test("isShort は3分以下をショートと推定し、ライブは除く", () => {
  assert.equal(isShort({ durationSec: 180 }), true);
  assert.equal(isShort({ durationSec: 181 }), false);
  assert.equal(isShort({ durationSec: 0 }), false);
  assert.equal(isShort({ durationSec: 30, isLive: true }), false);
});

test("median", () => {
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("jstParts は日本時間の時と曜日を返す", () => {
  // UTC 日曜 15:30 = 日本時間 月曜 0:30
  assert.deepEqual(jstParts("2026-11-08T15:30:00Z"), { hour: 0, weekday: 1 });
});

test("titleWords はハッシュタグと数字だけの語を除く", () => {
  const words = titleWords("【検証】100円食材だけで1週間暮らしてみた #shorts");
  assert.ok(words.includes("検証"));
  assert.ok(words.includes("食材"));
  assert.ok(!words.includes("shorts"));
  assert.ok(!words.includes("100"));
});

test("analyzeVideos は割合・中央値・頻出タグをまとめる", () => {
  const result = analyzeVideos(
    [
      video({ id: "a", title: "【検証】卵料理を10個作る", durationSec: 30, views: 3000, tags: ["料理", "検証"] }),
      video({ id: "b", title: "卵料理の基本!", durationSec: 600, views: 1000, tags: ["料理"] }),
      video({ id: "c", title: "ふつうの動画", durationSec: 1200, views: 2000, tags: [] }),
      video({ id: "d", title: "もうひとつの動画", durationSec: 900, views: 500, tags: [] }),
    ],
    NOW,
  );
  assert.equal(result.count, 4);
  assert.equal(result.shortShare, 0.25);
  assert.equal(result.medianViews, 1500);
  assert.equal(result.medianLongSec, 900);
  assert.equal(result.medianShortSec, 30);
  assert.deepEqual(result.tags, [{ label: "料理", count: 2 }]);
  assert.equal(result.titlePatterns.find((p) => p.label === "【】で強調")?.share, 0.25);
  assert.equal(result.timeSlots[0].label, "9–12時");
});

test("analyzeVideos は空の一覧でも落ちない", () => {
  const result = analyzeVideos([], NOW);
  assert.equal(result.count, 0);
  assert.equal(result.shortShare, 0);
});

test("filterAndSort は種類で絞り、指定の順に並べる", () => {
  const list = [
    video({ id: "old-long", durationSec: 600, views: 9000, publishedAt: "2026-10-01T00:00:00Z" }),
    video({ id: "new-short", durationSec: 20, views: 5000, publishedAt: "2026-11-09T12:00:00Z" }),
    video({ id: "mid-long", durationSec: 700, views: 100, publishedAt: "2026-11-05T00:00:00Z" }),
  ];
  assert.deepEqual(filterAndSort(list, "long", "views", NOW).map((v) => v.id), ["old-long", "mid-long"]);
  assert.deepEqual(filterAndSort(list, "all", "new", NOW).map((v) => v.id), ["new-short", "mid-long", "old-long"]);
  assert.deepEqual(filterAndSort(list, "all", "momentum", NOW).map((v) => v.id)[0], "new-short");
});
