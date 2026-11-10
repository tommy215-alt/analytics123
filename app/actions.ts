"use server";

import { redirect } from "next/navigation";
import { checkPassword, endSession, isLoggedIn, startSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { forgetAccount } from "@/lib/google";
import { deleteAccount, listAccounts, listRefs, saveRefs, setActiveId } from "@/lib/store";
import { findChannel } from "@/lib/youtube";

const MAX_REFS = 12;

async function requireLogin(): Promise<void> {
  if (!(await isLoggedIn())) redirect("/login");
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get("password") ?? "");
  if (!checkPassword(password)) {
    // 総当たりを遅くするための待ち時間
    await new Promise((resolve) => setTimeout(resolve, 800));
    return "パスワードが違います。";
  }
  await startSession();
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function switchChannel(form: FormData): Promise<void> {
  await requireLogin();
  const channelId = String(form.get("channelId") ?? "");
  if (channelId) await setActiveId(channelId);
  // 外部サイトへ飛ばされないよう、アプリ内のパスだけを受け付ける
  const returnTo = String(form.get("returnTo") ?? "/");
  redirect(/^\/(?![\/\\])/.test(returnTo) ? returnTo : "/");
}

export async function removeAccount(form: FormData): Promise<void> {
  await requireLogin();
  if (isDemoMode()) redirect("/accounts");
  const channelId = String(form.get("channelId") ?? "");
  if (channelId) {
    await deleteAccount(channelId);
    forgetAccount(channelId);
  }
  redirect("/accounts?removed=1");
}

export async function addRef(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  if (isDemoMode()) return "デモモードでは追加できません。Google 連携の設定後に使えます。";
  const input = String(form.get("channel") ?? "").trim();
  if (!input) return "チャンネルのURL、@ハンドル、または名前を入力してください。";

  const account = (await listAccounts())[0];
  if (!account) return "先に自分のチャンネルを連携してください。";

  const refs = await listRefs();
  if (refs.length >= MAX_REFS) return `参考チャンネルは${MAX_REFS}件までです。`;

  let found;
  try {
    found = await findChannel(account, input);
  } catch (error) {
    return error instanceof Error ? error.message : "チャンネルの検索に失敗しました。";
  }
  if (!found) return "チャンネルが見つかりませんでした。";
  if (refs.some((r) => r.channelId === found.channelId)) return "すでに追加されています。";

  await saveRefs([...refs, found]);
  redirect(`/trends?mode=refs&fmt=long&ref=${found.channelId}`);
}

export async function removeRef(form: FormData): Promise<void> {
  await requireLogin();
  if (!isDemoMode()) {
    const channelId = String(form.get("channelId") ?? "");
    await saveRefs((await listRefs()).filter((r) => r.channelId !== channelId));
  }
  redirect("/trends?mode=refs");
}
