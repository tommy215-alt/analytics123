"use client";

import { usePathname } from "next/navigation";
import { switchChannel } from "@/app/actions";
import type { AccountInfo } from "@/lib/types";

export function Avatar({ title, src }: { title: string; src?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={src} alt="" referrerPolicy="no-referrer" />;
  }
  return (
    <span className="avatar" aria-hidden="true">
      {[...title][0] ?? "?"}
    </span>
  );
}

export function ChannelSwitcher({ accounts, activeId }: { accounts: AccountInfo[]; activeId?: string }) {
  const pathname = usePathname();
  const active = accounts.find((a) => a.channelId === activeId) ?? accounts[0];
  if (!active) return <span className="name">Channel Deck</span>;

  return (
    <form action={switchChannel} className="switcher">
      <Avatar title={active.title} src={active.thumbnail} />
      <input type="hidden" name="returnTo" value={pathname} />
      {accounts.length > 1 ? (
        <>
          <label className="visually-hidden" htmlFor="channel-select">
            表示するチャンネル
          </label>
          <select
            id="channel-select"
            name="channelId"
            defaultValue={active.channelId}
            key={active.channelId}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {accounts.map((a) => (
              <option key={a.channelId} value={a.channelId}>
                {a.title}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="name">{active.title}</span>
      )}
    </form>
  );
}
