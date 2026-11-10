"use client";

import { useEffect, useRef } from "react";

/**
 * コードだけで描いた架空の人物「紬(つむぎ)」。
 * 実在の人物の写しではなく、まとめ髪・穏やかな表情という雰囲気から起こしたオリジナル。
 * まばたき・呼吸・視線・口の形は、毎フレーム SVG の属性を書き換えて動かす。
 */

export type Mouth = { open: number; wide: number };

const REST: Mouth = { open: 0, wide: 0.15 };

const CX = 200;
const MOUTH_Y = 327;

/** 開き具合(0〜1)と横幅(-1=すぼめる〜1=横に引く)から唇の形を作る */
function lipPaths(open: number, wide: number, smile: number) {
  const hw = 15.5 + wide * 4.5;
  const lift = smile * 2.6 - open * 0.8;
  const cornerY = MOUTH_Y - lift;
  const l = CX - hw;
  const r = CX + hw;
  const topEdge = MOUTH_Y - 0.4 - open * 2.2;
  const bottomEdge = MOUTH_Y + 0.4 + open * 10.5;
  const upperTop = MOUTH_Y - 5.2 - open * 1.6;
  const lowerBottom = MOUTH_Y + 6.8 + open * 10.5;

  const upper =
    `M${l},${cornerY} C${CX - hw * 0.55},${upperTop + 0.6} ${CX - 4.5},${upperTop - 1.4} ${CX},${upperTop + 1.1} ` +
    `C${CX + 4.5},${upperTop - 1.4} ${CX + hw * 0.55},${upperTop + 0.6} ${r},${cornerY} ` +
    `C${CX + hw * 0.5},${topEdge + 0.8} ${CX + 4},${topEdge + 1.2} ${CX},${topEdge + 1.2} C${CX - 4},${topEdge + 1.2} ${CX - hw * 0.5},${topEdge + 0.8} ${l},${cornerY}Z`;
  const lower =
    `M${l},${cornerY} C${CX - hw * 0.5},${bottomEdge - 0.4} ${CX - 4},${bottomEdge} ${CX},${bottomEdge} C${CX + 4},${bottomEdge} ${CX + hw * 0.5},${bottomEdge - 0.4} ${r},${cornerY} ` +
    `C${CX + hw * 0.62},${lowerBottom - 1} ${CX + 5},${lowerBottom} ${CX},${lowerBottom} C${CX - 5},${lowerBottom} ${CX - hw * 0.62},${lowerBottom - 1} ${l},${cornerY}Z`;
  const inner =
    `M${l + 1.5},${cornerY} C${CX - hw * 0.5},${topEdge + 0.8} ${CX - 4},${topEdge + 1.2} ${CX},${topEdge + 1.2} C${CX + 4},${topEdge + 1.2} ${CX + hw * 0.5},${topEdge + 0.8} ${r - 1.5},${cornerY} ` +
    `C${CX + hw * 0.5},${bottomEdge - 0.4} ${CX + 4},${bottomEdge} ${CX},${bottomEdge} C${CX - 4},${bottomEdge} ${CX - hw * 0.5},${bottomEdge - 0.4} ${l + 1.5},${cornerY}Z`;
  const teeth =
    `M${CX - hw * 0.62},${topEdge + 1.1} C${CX - 4},${topEdge + 1.5} ${CX + 4},${topEdge + 1.5} ${CX + hw * 0.62},${topEdge + 1.1} ` +
    `L${CX + hw * 0.5},${topEdge + 1.2 + Math.min(4.2, open * 5.5)} C${CX + 4},${topEdge + 2 + Math.min(4.2, open * 5.5)} ${CX - 4},${topEdge + 2 + Math.min(4.2, open * 5.5)} ${CX - hw * 0.5},${topEdge + 1.2 + Math.min(4.2, open * 5.5)}Z`;
  const line = `M${l},${cornerY} C${CX - hw * 0.5},${MOUTH_Y + 0.9} ${CX + hw * 0.5},${MOUTH_Y + 0.9} ${r},${cornerY}`;
  return { upper, lower, inner, teeth, line };
}

export function Portrait({ mouthTarget, speaking }: { mouthTarget: React.RefObject<Mouth>; speaking: boolean }) {
  const root = useRef<SVGSVGElement>(null);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const get = <T extends SVGElement>(id: string) => svg.querySelector<T>(`#${id}`)!;
    const head = get<SVGGElement>("pt-head");
    const body = get<SVGGElement>("pt-body");
    const lids = [get<SVGGElement>("pt-eye-l"), get<SVGGElement>("pt-eye-r")];
    const irises = [get<SVGGElement>("pt-iris-l"), get<SVGGElement>("pt-iris-r")];
    const upper = get<SVGPathElement>("pt-lip-upper");
    const lower = get<SVGPathElement>("pt-lip-lower");
    const inner = get<SVGPathElement>("pt-mouth-inner");
    const teeth = get<SVGPathElement>("pt-teeth");
    const line = get<SVGPathElement>("pt-lip-line");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mouth = { ...REST };
    let blink = 0; // 0=開いている 1=閉じている
    let nextBlink = performance.now() + 1800;
    let blinkStart = 0;
    let gazeX = 0;
    let gazeY = 0;
    let gazeTX = 0;
    let gazeTY = 0;
    let nextGaze = performance.now() + 2500;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      // 口: 目標の形へなめらかに近づける
      const target = mouthTarget.current ?? REST;
      const k = 1 - Math.exp(-dt * 22);
      mouth.open += (target.open - mouth.open) * k;
      mouth.wide += (target.wide - mouth.wide) * k;
      const smile = speakingRef.current ? 0.55 : 1;
      const paths = lipPaths(Math.max(0, mouth.open), mouth.wide, smile);
      upper.setAttribute("d", paths.upper);
      lower.setAttribute("d", paths.lower);
      inner.setAttribute("d", paths.inner);
      teeth.setAttribute("d", paths.teeth);
      line.setAttribute("d", paths.line);
      const openness = Math.min(1, mouth.open * 6);
      inner.setAttribute("opacity", String(openness));
      teeth.setAttribute("opacity", String(Math.min(1, Math.max(0, mouth.open - 0.12) * 4)));
      line.setAttribute("opacity", String(1 - openness));

      // まばたき
      if (now > nextBlink && blinkStart === 0) blinkStart = now;
      if (blinkStart > 0) {
        const p = (now - blinkStart) / 170;
        blink = p < 0.5 ? p * 2 : Math.max(0, 2 - p * 2);
        if (p >= 1) {
          blink = 0;
          blinkStart = 0;
          nextBlink = now + 2200 + Math.random() * 3800;
        }
      }
      const eyeScale = 1 - blink * 0.92;
      lids[0].setAttribute("transform", `translate(0 ${262 * (1 - eyeScale)}) scale(1 ${eyeScale})`);
      lids[1].setAttribute("transform", `translate(0 ${262 * (1 - eyeScale)}) scale(1 ${eyeScale})`);

      // 視線: ときどき少しだけ動かす
      if (now > nextGaze) {
        gazeTX = (Math.random() - 0.5) * 3.2;
        gazeTY = (Math.random() - 0.4) * 1.4;
        nextGaze = now + 1800 + Math.random() * 3200;
      }
      gazeX += (gazeTX - gazeX) * (1 - Math.exp(-dt * 6));
      gazeY += (gazeTY - gazeY) * (1 - Math.exp(-dt * 6));
      for (const iris of irises) iris.setAttribute("transform", `translate(${gazeX.toFixed(2)} ${gazeY.toFixed(2)})`);

      // 呼吸と、頭のわずかな揺れ(話しているあいだは少し大きく)
      if (!reduced) {
        const breath = Math.sin(t * 1.25) * 1.3;
        const energy = speakingRef.current ? 1.7 : 1;
        const tilt = (Math.sin(t * 0.55) * 0.9 + Math.sin(t * 1.9) * 0.35 * energy) * energy;
        const nod = Math.sin(t * 0.8) * 0.9 + (speakingRef.current ? Math.sin(t * 5.2) * 0.5 : 0);
        body.setAttribute("transform", `translate(0 ${breath.toFixed(2)})`);
        head.setAttribute("transform", `translate(0 ${(breath * 0.7 + nod).toFixed(2)}) rotate(${tilt.toFixed(2)} 200 395)`);
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mouthTarget]);

  const initial = lipPaths(0, REST.wide, 1);

  return (
    <svg ref={root} viewBox="0 0 400 500" role="img" aria-label="ニット姿の女性のアバター、紬" style={{ display: "block", width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="pt-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cfe0c8" />
          <stop offset="0.55" stopColor="#e9e6d2" />
          <stop offset="1" stopColor="#b9cdbf" />
        </linearGradient>
        <radialGradient id="pt-skin" cx="0.46" cy="0.4" r="0.75">
          <stop offset="0" stopColor="#fdebdc" />
          <stop offset="0.62" stopColor="#f6d8c4" />
          <stop offset="1" stopColor="#e6b9a2" />
        </radialGradient>
        <linearGradient id="pt-neck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dba88f" />
          <stop offset="0.5" stopColor="#f0cdb8" />
          <stop offset="1" stopColor="#f5d7c4" />
        </linearGradient>
        <linearGradient id="pt-hair" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a2f2c" />
          <stop offset="0.45" stopColor="#1d1716" />
          <stop offset="1" stopColor="#120e0e" />
        </linearGradient>
        <linearGradient id="pt-knit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6efe2" />
          <stop offset="0.55" stopColor="#ebe0cd" />
          <stop offset="1" stopColor="#d6c6ad" />
        </linearGradient>
        <radialGradient id="pt-iris" cx="0.5" cy="0.42" r="0.6">
          <stop offset="0" stopColor="#6a4a37" />
          <stop offset="0.7" stopColor="#3a2519" />
          <stop offset="1" stopColor="#1e120c" />
        </radialGradient>
        <radialGradient id="pt-light" cx="0.28" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#fff8e8" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#fff8e8" stopOpacity="0" />
        </radialGradient>
        <filter id="pt-blur-xl" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="pt-blur-l" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="pt-blur-m" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id="pt-blur-s" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <clipPath id="pt-face-clip">
          <path d="M132,238 C130,176 160,142 200,142 C240,142 270,176 268,238 C267,290 246,338 200,356 C154,338 133,290 132,238Z" />
        </clipPath>
        <clipPath id="pt-eye-clip-l">
          <path d="M150,262 C157,251 174,249 184,261 C175,268 160,269 150,262Z" />
        </clipPath>
        <clipPath id="pt-eye-clip-r">
          <path d="M216,261 C226,249 243,251 250,262 C240,269 225,268 216,261Z" />
        </clipPath>
      </defs>

      {/* 背景: ぼかした庭の緑と光 */}
      <rect width="400" height="500" fill="url(#pt-bg)" />
      <g filter="url(#pt-blur-xl)">
        <circle cx="60" cy="90" r="70" fill="#8fb58a" opacity="0.75" />
        <circle cx="350" cy="60" r="80" fill="#a9c79a" opacity="0.7" />
        <circle cx="330" cy="250" r="60" fill="#f4efd8" opacity="0.8" />
        <circle cx="40" cy="300" r="70" fill="#d9d3b6" opacity="0.8" />
        <circle cx="210" cy="40" r="50" fill="#f7f3df" opacity="0.7" />
        <rect x="0" y="380" width="400" height="120" fill="#9db7a6" opacity="0.6" />
      </g>
      <g filter="url(#pt-blur-l)" opacity="0.6">
        <circle cx="105" cy="55" r="16" fill="#ffffff" />
        <circle cx="312" cy="150" r="12" fill="#ffffff" />
        <circle cx="356" cy="330" r="14" fill="#fff9e6" />
        <circle cx="30" cy="190" r="10" fill="#ffffff" />
      </g>

      {/* 体 */}
      <g id="pt-body">
        {/* 首 */}
        <path d="M170,330 C172,372 166,398 150,420 L250,420 C234,398 228,372 230,330Z" fill="url(#pt-neck)" />
        <path d="M168,336 C184,372 216,372 232,336 C230,352 229,362 230,374 C212,388 188,388 170,374 C171,362 170,352 168,336Z" fill="#b98168" opacity="0.5" filter="url(#pt-blur-m)" />
        {/* 体にフィットしたリブニット */}
        <path d="M-10,500 C-2,456 30,430 84,414 C116,405 142,400 160,392 C176,400 224,400 240,392 C258,400 284,405 316,414 C370,430 402,456 410,500Z" fill="url(#pt-knit)" />
        {/* 肩と脇の陰影 */}
        <path d="M84,414 C50,428 22,450 8,500 L62,500 C62,462 70,436 84,414Z" fill="#a8907a" opacity="0.32" filter="url(#pt-blur-l)" />
        <path d="M316,414 C350,428 378,450 392,500 L338,500 C338,462 330,436 316,414Z" fill="#a8907a" opacity="0.22" filter="url(#pt-blur-l)" />
        <ellipse cx="200" cy="492" rx="70" ry="22" fill="#fffaf0" opacity="0.35" filter="url(#pt-blur-l)" />
        {/* リブ編みの縦すじ */}
        <g stroke="#bda88f" strokeWidth="1.1" fill="none" opacity="0.55" strokeLinecap="round">
          <path d="M104,412 C94,442 88.0,472 84,500" />
          <path d="M118,408 C110,438 105.2,468 102,500" />
          <path d="M132,404 C125.5,434 121.6,464 119.0,500" />
          <path d="M146,400 C141,430 138.0,460 136,500" />
          <path d="M160,398 C156.5,428 154.4,458 153.0,500" />
          <path d="M174,402 C172,432 170.8,462 170,500" />
          <path d="M188,405 C187,435 186.4,465 186,500" />
          <path d="M200,406 C200,436 200.0,466 200,500" />
          <path d="M212,405 C213,435 213.6,465 214,500" />
          <path d="M226,402 C228,432 229.2,462 230,500" />
          <path d="M240,398 C243.5,428 245.6,458 247.0,500" />
          <path d="M254,400 C259,430 262.0,460 264,500" />
          <path d="M268,404 C274.5,434 278.4,464 281.0,500" />
          <path d="M282,408 C290,438 294.8,468 298,500" />
          <path d="M296,412 C306,442 312.0,472 316,500" />
        </g>
        {/* ハイネックの衿 */}
        <path d="M160,372 C172,384 228,384 240,372 C243,384 244,396 244,408 C226,420 174,420 156,408 C156,396 157,384 160,372Z" fill="url(#pt-knit)" />
        <path d="M160,372 C172,384 228,384 240,372" stroke="#c9b59b" strokeWidth="1.4" fill="none" opacity="0.8" />
        <path d="M156,408 C174,420 226,420 244,408" stroke="#a8907a" strokeWidth="1.6" fill="none" opacity="0.55" filter="url(#pt-blur-s)" />
        <g stroke="#bda88f" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round">
          <path d="M166,373.0 L161.9,407.0" />
          <path d="M172,372.8 L168.6,408.5" />
          <path d="M178,372.7 L175.4,410.0" />
          <path d="M184,372.5 L182.1,411.5" />
          <path d="M190,372.3 L188.8,413.0" />
          <path d="M196,372.1 L195.5,414.5" />
          <path d="M202,372.1 L202.2,415.0" />
          <path d="M208,372.2 L209.0,413.5" />
          <path d="M214,372.4 L215.7,412.0" />
          <path d="M220,372.6 L222.4,410.5" />
          <path d="M226,372.8 L229.1,409.0" />
          <path d="M232,373.0 L235.8,407.5" />
        </g>
        <path d="M228,378 C238,388 240,400 238,412 L246,408 C246,396 245,384 240,372Z" fill="#a8907a" opacity="0.3" filter="url(#pt-blur-s)" />
      </g>

      {/* 頭 */}
      <g id="pt-head">
        {/* 後ろ髪とお団子 */}
        <path d="M124,232 C116,160 150,112 204,112 C262,112 288,164 276,236 C272,262 266,280 258,292 L142,292 C134,280 128,262 124,232Z" fill="url(#pt-hair)" />
        <path d="M222,84 C254,70 290,90 288,124 C286,148 262,160 238,150 C214,140 204,100 222,84Z" fill="url(#pt-hair)" />
        <path d="M232,96 C250,88 272,98 274,118" stroke="#57463f" strokeWidth="2.2" fill="none" opacity="0.7" strokeLinecap="round" />
        <path d="M228,110 C246,104 264,112 266,130" stroke="#4a3b36" strokeWidth="1.6" fill="none" opacity="0.6" strokeLinecap="round" />
        {/* 髪飾り */}
        <circle cx="246" cy="150" r="3.6" fill="#e3c26a" />
        <circle cx="245" cy="149" r="1.2" fill="#fff6d6" />
        <circle cx="254" cy="153" r="2.4" fill="#f3d9de" />

        {/* 耳 */}
        <path d="M133,262 C124,256 122,276 128,290 C131,297 137,298 138,292Z" fill="#f0cbb6" />
        <path d="M267,262 C276,256 278,276 272,290 C269,297 263,298 262,292Z" fill="#edc6b0" />

        {/* 顔 */}
        <path d="M132,238 C130,176 160,142 200,142 C240,142 270,176 268,238 C267,290 246,338 200,356 C154,338 133,290 132,238Z" fill="url(#pt-skin)" />
        <g clipPath="url(#pt-face-clip)">
          {/* 輪郭の陰影と頬の赤み */}
          <path d="M258,200 C272,250 262,318 214,352 L280,360 L290,190Z" fill="#d9a48b" opacity="0.4" filter="url(#pt-blur-l)" />
          <path d="M142,210 C132,262 146,318 184,350 L120,356 L116,200Z" fill="#e2b199" opacity="0.26" filter="url(#pt-blur-l)" />
          <ellipse cx="200" cy="358" rx="44" ry="11" fill="#cf9980" opacity="0.4" filter="url(#pt-blur-m)" />
          <ellipse cx="160" cy="296" rx="21" ry="13" fill="#f2a59a" opacity="0.42" filter="url(#pt-blur-l)" />
          <ellipse cx="240" cy="296" rx="21" ry="13" fill="#f2a59a" opacity="0.38" filter="url(#pt-blur-l)" />
          {/* 前髪が落とす影 */}
          <path d="M134,226 C156,244 244,244 266,226 L266,180 L134,180Z" fill="#b98a74" opacity="0.34" filter="url(#pt-blur-m)" />
          {/* 鼻 */}
          <path d="M197,262 C194,282 190,294 189,301 C192,306 197,308 200,308 C203,308 208,306 211,301" stroke="#c98f78" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5" filter="url(#pt-blur-s)" />
          <ellipse cx="193.5" cy="303" rx="2.6" ry="1.5" fill="#b47763" opacity="0.5" />
          <ellipse cx="206.5" cy="303" rx="2.6" ry="1.5" fill="#b47763" opacity="0.45" />
          <ellipse cx="199" cy="290" rx="3.5" ry="9" fill="#fff4ea" opacity="0.55" filter="url(#pt-blur-m)" />
        </g>

        {/* 眉 */}
        <path d="M148,243 C158,237.5 172,237 186,241" stroke="#3b2c27" strokeWidth="3.4" fill="none" strokeLinecap="round" opacity="0.62" filter="url(#pt-blur-s)" />
        <path d="M214,241 C228,237 242,237.5 252,243" stroke="#3b2c27" strokeWidth="3.4" fill="none" strokeLinecap="round" opacity="0.62" filter="url(#pt-blur-s)" />

        {/* 目 */}
        <g id="pt-eye-l">
          <path d="M150,262 C157,251 174,249 184,261 C175,268 160,269 150,262Z" fill="#fbf6f1" />
          <g clipPath="url(#pt-eye-clip-l)">
            <g id="pt-iris-l">
              <circle cx="167" cy="259.5" r="8.6" fill="url(#pt-iris)" />
              <circle cx="167" cy="259.5" r="3.6" fill="#0c0706" />
              <circle cx="170" cy="256.5" r="2.1" fill="#ffffff" opacity="0.95" />
              <circle cx="163.5" cy="262.5" r="1" fill="#ffffff" opacity="0.6" />
            </g>
            <path d="M148,250 L186,250 L186,256 C174,251 160,252 148,258Z" fill="#6b4a3d" opacity="0.28" />
          </g>
          <path d="M148.5,262.5 C156,250 174,247.5 185.5,261" stroke="#1f1614" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M148.5,262.5 C146.5,261.5 145,259.5 144,257.5" stroke="#1f1614" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M153,264.5 C162,269 174,268.5 182,263.5" stroke="#8a5f52" strokeWidth="0.9" fill="none" opacity="0.6" />
        </g>
        <path d="M152,252 C160,246 173,245.5 182,250" stroke="#c08a76" strokeWidth="1" fill="none" opacity="0.55" />
        <g id="pt-eye-r">
          <path d="M216,261 C226,249 243,251 250,262 C240,269 225,268 216,261Z" fill="#fbf6f1" />
          <g clipPath="url(#pt-eye-clip-r)">
            <g id="pt-iris-r">
              <circle cx="233" cy="259.5" r="8.6" fill="url(#pt-iris)" />
              <circle cx="233" cy="259.5" r="3.6" fill="#0c0706" />
              <circle cx="236" cy="256.5" r="2.1" fill="#ffffff" opacity="0.95" />
              <circle cx="229.5" cy="262.5" r="1" fill="#ffffff" opacity="0.6" />
            </g>
            <path d="M214,250 L252,250 L252,258 C240,252 226,251 214,256Z" fill="#6b4a3d" opacity="0.28" />
          </g>
          <path d="M214.5,261 C226,247.5 244,250 251.5,262.5" stroke="#1f1614" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M251.5,262.5 C253.5,261.5 255,259.5 256,257.5" stroke="#1f1614" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M218,263.5 C226,268.5 238,269 247,264.5" stroke="#8a5f52" strokeWidth="0.9" fill="none" opacity="0.6" />
        </g>
        <path d="M218,250 C227,245.5 240,246 248,252" stroke="#c08a76" strokeWidth="1" fill="none" opacity="0.55" />

        {/* 口 */}
        <path id="pt-mouth-inner" d={initial.inner} fill="#5a1f22" opacity="0" />
        <path id="pt-teeth" d={initial.teeth} fill="#fbf7f2" opacity="0" />
        <path id="pt-lip-upper" d={initial.upper} fill="#cf7f7b" />
        <path id="pt-lip-lower" d={initial.lower} fill="#dc8f89" />
        <path id="pt-lip-line" d={initial.line} stroke="#8f4747" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        <ellipse cx="200" cy="337" rx="6" ry="1.6" fill="#ffe1dc" opacity="0.5" />
        <ellipse cx="200" cy="346" rx="12" ry="3" fill="#c98f78" opacity="0.25" filter="url(#pt-blur-s)" />

        {/* 前髪(ぱっつん)ともみあげ */}
        <path d="M126,226 C120,168 152,124 204,124 C256,124 282,168 274,226 C270,212 262,200 250,196 C222,214 176,214 150,196 C138,202 130,212 126,226Z" fill="url(#pt-hair)" />
        <path d="M136,196 C134,210 135,222 138,232 C150,236 164,235 176,233 C192,236 208,236 224,233 C236,235 250,236 262,232 C265,222 266,210 264,196 C226,208 174,208 136,196Z" fill="#1d1716" />
        <path d="M138,232 C150,236 164,235 176,233 C192,236 208,236 224,233 C236,235 250,236 262,232" stroke="#1d1716" strokeWidth="3" fill="none" opacity="0.35" filter="url(#pt-blur-s)" />
        <path d="M128,222 C126,250 130,278 138,296 C140,278 140,258 142,236 C138,232 132,228 128,222Z" fill="#1d1716" />
        <path d="M272,222 C274,250 270,278 262,296 C260,278 260,258 258,236 C262,232 268,228 272,222Z" fill="#1d1716" />
        {/* 髪のつや */}
        <path d="M150,170 C170,150 220,144 252,164" stroke="#6b574f" strokeWidth="5" fill="none" opacity="0.4" strokeLinecap="round" filter="url(#pt-blur-m)" />
        <g stroke="#55443d" strokeWidth="0.9" opacity="0.55" strokeLinecap="round" fill="none">
          <path d="M152,200 C150,212 151,224 153,233" />
          <path d="M166,204 C165,214 166,226 168,234" />
          <path d="M182,206 C182,216 183,226 184,234" />
          <path d="M200,207 C200,217 200,227 200,235" />
          <path d="M218,206 C218,216 217,226 216,234" />
          <path d="M234,204 C235,214 234,226 232,234" />
          <path d="M248,200 C250,212 249,224 247,233" />
        </g>
      </g>

      {/* 全体にかかるやわらかい光 */}
      <rect width="400" height="500" fill="url(#pt-light)" pointerEvents="none" />
    </svg>
  );
}
