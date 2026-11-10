"use client";

import { useActionState } from "react";
import { addRef } from "@/app/actions";

export function AddRefForm() {
  const [error, action, pending] = useActionState(addRef, null);
  return (
    <form action={action}>
      <div className="inline-form">
        <label className="visually-hidden" htmlFor="ref-channel">
          チャンネルのURL、@ハンドル、または名前
        </label>
        <input id="ref-channel" className="field" name="channel" placeholder="URL・@ハンドル・チャンネル名" maxLength={200} required />
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "検索中…" : "追加"}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </form>
  );
}
