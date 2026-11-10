"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action}>
      <h1>Channel Deck</h1>
      <label htmlFor="password">パスワード</label>
      <input id="password" className="field" type="password" name="password" autoComplete="current-password" required autoFocus />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "確認中…" : "ログイン"}
      </button>
    </form>
  );
}
