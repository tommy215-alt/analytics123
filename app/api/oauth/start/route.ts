import { NextResponse, type NextRequest } from "next/server";
import { cookieBase, isLoggedIn } from "@/lib/auth";
import { config, configProblems, isDemoMode } from "@/lib/config";
import { randomToken } from "@/lib/crypto";
import { buildAuthUrl } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = config.appUrl ?? request.nextUrl.origin;
  if (!(await isLoggedIn())) return NextResponse.redirect(`${origin}/login`);
  if (isDemoMode() || configProblems().length > 0) return NextResponse.redirect(`${origin}/accounts`);

  const state = randomToken();
  const response = NextResponse.redirect(buildAuthUrl(`${origin}/api/oauth/callback`, state));
  response.cookies.set("ytm_oauth_state", state, { ...cookieBase, maxAge: 600 });
  return response;
}
