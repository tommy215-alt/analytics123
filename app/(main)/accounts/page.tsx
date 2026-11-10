import { logout, removeAccount } from "@/app/actions";
import { Avatar } from "@/components/ChannelSwitcher";
import { loginRequired } from "@/lib/auth";
import { usesRedis } from "@/lib/config";
import { getContext } from "@/lib/data";
import { dateJa } from "@/lib/format";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ added?: string; removed?: string; error?: string }> }) {
  const ctx = await getContext();
  const params = await searchParams;

  return (
    <>
      <div className="page-title">
        <h1>アカウント</h1>
      </div>

      {params.error && (
        <p className="notice error" role="alert">
          {params.error.slice(0, 300)}
        </p>
      )}
      {params.added && <p className="notice ok">チャンネルを連携しました。</p>}
      {params.removed && <p className="notice ok">連携を解除しました。</p>}

      <section className="card">
        <div className="card-head">
          <h2>連携中のチャンネル</h2>
          <span className="sub">{ctx.accounts.length}件</span>
        </div>
        {ctx.accounts.length === 0 ? (
          <p className="empty">まだ連携されていません。</p>
        ) : (
          ctx.accounts.map((a) => (
            <div className="account-row" key={a.channelId}>
              <Avatar title={a.title} src={a.thumbnail} />
              <div className="info">
                <b>{a.title}</b>
                <span className="sub">
                  {a.handle ? `${a.handle}・` : ""}
                  {dateJa(a.addedAt)} に連携
                </span>
              </div>
              {!ctx.demo && (
                <form action={removeAccount}>
                  <input type="hidden" name="channelId" value={a.channelId} />
                  <button className="btn danger" type="submit">
                    解除
                  </button>
                </form>
              )}
            </div>
          ))
        )}
        {!ctx.demo && (
          <div style={{ marginTop: 14 }}>
            <a className="btn primary" href="/api/oauth/start">
              Google アカウントでチャンネルを追加
            </a>
            <p className="sub" style={{ marginTop: 10 }}>
              追加するチャンネルを持つ Google アカウントでログインし、表示される権限(閲覧のみ)をすべて許可してください。
              {usesRedis()
                ? "連携情報はサーバー側に暗号化して保存され、どの端末からも同じ内容が見られます。"
                : "連携情報は暗号化してこの端末のブラウザに保存されます。別の端末で使うときは、その端末でも連携してください。"}
            </p>
          </div>
        )}
      </section>

      {ctx.demo && (
        <section className="card">
          <h2>本物のデータを表示するには</h2>
          <ol className="steps">
            <li>Google Cloud でプロジェクトを作り、「YouTube Data API v3」と「YouTube Analytics API」を有効にする</li>
            <li>OAuth 同意画面を設定し、公開ステータスを「本番環境」にする(テストのままだと連携が7日で切れます)</li>
            <li>
              OAuth クライアント(ウェブアプリケーション)を作り、リダイレクト URI に <code>https://(このアプリのURL)/api/oauth/callback</code> を登録する
            </li>
            <li>
              デプロイ先の環境変数に <code>GOOGLE_CLIENT_ID</code>・<code>GOOGLE_CLIENT_SECRET</code>・<code>APP_PASSWORD</code> を設定して再デプロイする
            </li>
          </ol>
          <p className="sub" style={{ marginTop: 10 }}>
            くわしい手順はリポジトリの README にあります。
          </p>
        </section>
      )}

      {loginRequired() && (
        <form action={logout}>
          <button className="btn" type="submit">
            ログアウト
          </button>
        </form>
      )}
    </>
  );
}
