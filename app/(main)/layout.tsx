import Link from "next/link";
import { redirect } from "next/navigation";
import { ChannelSwitcher } from "@/components/ChannelSwitcher";
import { Nav } from "@/components/Nav";
import { isLoggedIn } from "@/lib/auth";
import { configProblems } from "@/lib/config";
import { getContext } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const problems = configProblems();
  if (problems.length > 0) {
    return (
      <main className="login">
        <div className="card" style={{ maxWidth: 480 }}>
          <h2>設定が足りません</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            Google 連携を有効にするには、次の環境変数を設定して再デプロイしてください。
          </p>
          <ul className="steps">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </main>
    );
  }

  if (!(await isLoggedIn())) redirect("/login");
  const ctx = await getContext();

  return (
    <div className="shell">
      <header className="topbar">
        <ChannelSwitcher accounts={ctx.accounts} activeId={ctx.active?.channelId} />
        <Nav className="sidenav" />
      </header>
      <main className="content">
        {ctx.demo && (
          <p className="notice">
            デモ表示中です。数字や動画はすべてサンプルで、実在のチャンネルとは関係ありません。Google 連携の設定方法は
            <Link href="/accounts">アカウント</Link>画面にあります。
          </p>
        )}
        {children}
      </main>
      <Nav className="tabbar" />
    </div>
  );
}
