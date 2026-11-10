import { NextResponse, type NextRequest } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { config, configProblems, isDemoMode } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import { exchangeCode, forgetAccount, googleGetWithToken } from "@/lib/google";
import { setActiveId, upsertAccount } from "@/lib/store";

export const dynamic = "force-dynamic";

type ChannelsResponse = {
  items?: {
    id: string;
    snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url: string } | undefined> };
  }[];
};

export async function GET(request: NextRequest) {
  const origin = config.appUrl ?? request.nextUrl.origin;
  const fail = (message: string) => {
    const response = NextResponse.redirect(`${origin}/accounts?error=${encodeURIComponent(message)}`);
    response.cookies.delete("ytm_oauth_state");
    return response;
  };

  if (!(await isLoggedIn())) return NextResponse.redirect(`${origin}/login`);
  if (isDemoMode() || configProblems().length > 0) return NextResponse.redirect(`${origin}/accounts`);

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    return fail(params.get("error") === "access_denied" ? "連携がキャンセルされました。" : `Google からエラーが返されました: ${params.get("error")}`);
  }

  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get("ytm_oauth_state")?.value;
  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return fail("連携の確認に失敗しました。もう一度お試しください。");
  }

  try {
    const token = await exchangeCode(code, `${origin}/api/oauth/callback`);
    if (!token.refresh_token) {
      return fail("Google から更新用トークンを受け取れませんでした。もう一度連携してください。");
    }
    const granted = token.scope ?? "";
    if (!granted.includes("youtube.readonly") || !granted.includes("yt-analytics.readonly")) {
      return fail("必要な権限が許可されませんでした。同意画面ですべての項目にチェックを入れてください。");
    }

    const channels = await googleGetWithToken<ChannelsResponse>(
      token.access_token,
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    );
    const channel = channels.items?.[0];
    if (!channel) return fail("この Google アカウントには YouTube チャンネルがありません。");

    const thumbs = channel.snippet?.thumbnails;
    forgetAccount(channel.id);
    await upsertAccount({
      channelId: channel.id,
      title: channel.snippet?.title ?? "(名前なし)",
      handle: channel.snippet?.customUrl,
      thumbnail: thumbs?.medium?.url ?? thumbs?.default?.url,
      refreshToken: token.refresh_token,
      addedAt: new Date().toISOString(),
    });
    await setActiveId(channel.id);

    const response = NextResponse.redirect(`${origin}/accounts?added=1`);
    response.cookies.delete("ytm_oauth_state");
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "連携に失敗しました。");
  }
}
