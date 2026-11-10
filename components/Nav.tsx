"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/",
    label: "ホーム",
    icon: <path d="M4 19V10l8-6 8 6v9h-5v-6H9v6z" />,
  },
  {
    href: "/videos",
    label: "動画",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m10 9 5 3-5 3z" />
      </>
    ),
  },
  {
    href: "/trends",
    label: "トレンド",
    icon: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  },
  {
    href: "/accounts",
    label: "アカウント",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-4 4.5-5 8-5s6.5 1 8 5" />
      </>
    ),
  },
];

export function Nav({ className }: { className: string }) {
  const pathname = usePathname();
  return (
    <nav className={className} aria-label="メインメニュー">
      {ITEMS.map((item) => {
        const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {item.icon}
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
