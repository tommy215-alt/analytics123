import type { Metadata } from "next";

export const metadata: Metadata = { title: "プライバシーポリシー | Channel Deck" };

export default function PrivacyPage() {
  return (
    <main className="content" style={{ maxWidth: 720 }}>
      <div className="page-title">
        <h1>プライバシーポリシー</h1>
      </div>
      <section className="card prose">
        <p>Channel Deck は、運営者本人が自分の YouTube チャンネルの分析を見るための個人用ツールです。</p>
        <div>
          <h2>取得する情報</h2>
          <p>
            運営者が Google アカウントで連携したチャンネルについて、YouTube Data API と YouTube Analytics API
            から、チャンネル情報、動画の一覧と統計、視聴回数や視聴者層などの分析データ、推定収益を読み取ります。権限は読み取り専用で、チャンネルや動画を変更することはありません。
          </p>
        </div>
        <div>
          <h2>利用目的</h2>
          <p>取得した情報は、このツールの画面に表示するためだけに使います。第三者への提供、販売、広告への利用は行いません。</p>
        </div>
        <div>
          <h2>保存</h2>
          <p>
            分析データはサーバーに保存せず、表示のたびに取得します(短時間の一時的なキャッシュを除く)。Google
            との連携に必要な更新トークンは暗号化して保存し、「アカウント」画面で連携を解除すると削除されます。
          </p>
        </div>
        <div>
          <h2>連携の取り消し</h2>
          <p>
            Google アカウントの「サードパーティ製のアプリとサービス」の設定から、このツールへのアクセス権をいつでも取り消せます。
          </p>
        </div>
        <p className="sub">
          このツールは YouTube API サービスを利用しています。YouTube の利用規約と Google のプライバシーポリシーもあわせて適用されます。
        </p>
      </section>
    </main>
  );
}
