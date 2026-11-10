import assert from "node:assert/strict";
import { test } from "node:test";
import { changeRatio, clock, num, parseIsoDuration, ranges, shortDay, signedPercent, watchTime } from "../lib/format.ts";

test("num は1万未満をそのまま、1万以上を短く表示する", () => {
  assert.equal(num(9999), "9,999");
  assert.equal(num(12345), "1.2万");
  assert.equal(num(null), "–");
});

test("clock は秒を時刻形式にする", () => {
  assert.equal(clock(65), "1:05");
  assert.equal(clock(3723), "1:02:03");
});

test("watchTime は60分未満を分、それ以上を時間で表示する", () => {
  assert.equal(watchTime(45), "45分");
  assert.equal(watchTime(600), "10時間");
});

test("parseIsoDuration は ISO 8601 の長さを秒にする", () => {
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("PT45S"), 45);
  assert.equal(parseIsoDuration("P1DT1M"), 86460);
  assert.equal(parseIsoDuration("P0D"), 0);
  assert.equal(parseIsoDuration(undefined), 0);
});

test("changeRatio は前期間が0なら null", () => {
  assert.equal(changeRatio(10, 0), null);
  assert.equal(changeRatio(150, 100), 0.5);
  assert.equal(signedPercent(0.5), "+50.0%");
  assert.equal(signedPercent(-0.123), "-12.3%");
});

test("ranges は2日前を終わりにした期間と、その直前の同じ長さの期間を返す", () => {
  const { current, previous } = ranges(7, new Date("2026-11-10T04:00:00Z"));
  assert.deepEqual(current, { start: "2026-11-02", end: "2026-11-08", days: 7 });
  assert.deepEqual(previous, { start: "2026-10-26", end: "2026-11-01", days: 7 });
  assert.equal(shortDay(current.start), "11/2");
});
