# Before University

大切なイベントの日までに達成したいこと、現在地、次の一歩、思い出を整理する、ログイン不要の個人用ロードマップです。複数のロードマップを切り替えられます。サイト本体はネットから配信されますが、入力したデータはブラウザの IndexedDB だけに保存します。

## 起動方法

Node.js 22.13.0 以上を使用します。

```bash
npm install
npm run dev
```

本番ビルドと検証:

```bash
npm run test:security
npm run lint
npm run build
```

## Vercelへの公開

GitHubリポジトリをVercelへImportし、Framework PresetをNext.js、Node.jsを22系にしてDeployします。データベース、環境変数、Vercel Functions、Vercel Analyticsは不要です。閲覧者向けのログインやDeployment Protectionは有効にしません。

## 技術構成

- Next.js、React、TypeScript
- Tailwind CSS、shadcn/ui ベースのUI、同梱した Lucide Icons
- IndexedDB（ロードマップ、設定、オンボーディング下書き）
- Service Worker（同一オリジンの静的アプリシェルのみ）
- システムフォント

ログイン、ユーザーアカウント、サーバーデータベース、Serverless API、外部AI API、アクセス解析、広告、クラウド同期は使用しません。Vercelにはアプリ本体だけを配信し、入力データは送信しません。

## データモデルと保存

IndexedDB `before-university-local` に、次のworkspaceを1レコードとしてトランザクション保存します。

```text
RoadmapWorkspace
├── activeRoadmapId
└── roadmaps[]
    ├── settings: roadmapId / eventName / startDate / targetDate / theme
    ├── categories[]
    ├── goals[]
    ├── tasks[]
    ├── months[]
    └── memories[]
```

ロードマップの作成・切り替え・編集・インポートはすべて端末内で完結します。同じURLでもブラウザプロフィールや端末が異なれば、保存領域は共有されません。localStorageは旧版 `before-university-roadmap-v1` と旧テーマ設定の移行元として読むだけで、現行データを重複保存しません。

### 旧データの移行

1. IndexedDBの旧単一ロードマップをworkspaceの1件目へ包む
2. 旧localStorage JSONをID・タスク・進捗を保ったイベント型へ変換
3. IndexedDBへ保存して読み戻す
4. 確認成功後だけ旧localStorageキーを削除

失敗時は旧キーを残し、空データで上書きせず保護画面を表示します。イベント情報のない旧データに限り、大学入学・2027年4月1日を移行値として補います。

## 新規利用とオンボーディング

IndexedDB、移行可能な旧データ、完了状態がない利用者だけに4ステップを表示します。

1. 端末内保存とアプリの目的を確認
2. イベント名・開始日・イベント日を設定
3. 最初の大目標を0〜3件登録
4. 内容を確認して保存

途中入力はIndexedDBの下書きへ保存します。AIと一緒に作る、バックアップから読み込む、空のロードマップで始める方法にも対応します。名前、学校名、住所、メールアドレスは要求しません。

## JSONバックアップ Schema v2

1ファイルにつき1ロードマップをUTF-8 JSONとして扱います。

```json
{
  "format": "before-roadmap",
  "schemaVersion": 2,
  "exportedAt": "2026-09-09T00:00:00.000Z",
  "appVersion": "4.0.0",
  "roadmap": {
    "title": "作品公開まで",
    "event": {
      "name": "作品公開",
      "description": "短い作品を完成させる",
      "date": "2026-12-01"
    },
    "startDate": "2026-09-09",
    "weeklyCapacityMinutes": 120,
    "themeColor": "blue",
    "categories": [],
    "goals": [],
    "tasks": [],
    "memories": []
  }
}
```

正式なJSON Schemaは `app/event-backup.ts` の `CURRENT_IMPORT_SCHEMA` からAI用プロンプトへ自動挿入します。設定から選択中または全ロードマップを個別JSONとして書き出せます。

### 安全なインポート

- `.json`、ドラッグ＆ドロップ、JSONテキスト貼り付けに対応
- 外側が正確なMarkdownコードブロックの場合だけ除去
- 2MB、深さ8、ノード3万、文字列長、配列件数の上限
- format/schema/必須型/許可キー/日付/参照先/ID重複を検証
- `__proto__`、`proto`、`prototype`、`constructor`、外部画像URLを拒否
- AIが作ったIDを新しい内部IDへ変換し、既存IDを上書きしない
- イベント日より後のタスクを保存前プレビューで警告
- 新規追加・現在へ統合・現在を置換・キャンセルを選択
- 置換前は現在のロードマップを書き出すまで実行不可
- 検証成功前はIndexedDBへ書かず、保存失敗時も既存データを維持

JSONには目標やメモが読み取り可能な形で含まれます。Cookie、認証情報、APIキー、端末識別子、閲覧履歴、分析IDは含みません。

## AI機能

### AIで次の一歩

`buildNextStepPrompt` が選択したタスク・イベント・期限・進捗・サブタスクなどから、端末内で相談用プロンプトを作ります。プレビューと編集後、明示的に押した場合だけClipboard APIへコピーします。外部AIへの自動送信、AI API、プロンプト入りURLは使いません。

### AIとロードマップを作る

`buildRoadmapAIPrompt` は、AIが1問ずつ計画を整理し、現在のSchema v2に合うJSONを出力するための専用プロンプトです。利用者がコピーして任意のAIへ貼り付けます。現在のロードマップを自動送信しません。

## 主な機能

- イベント名・開始日・イベント日を自由設定
- 大学入学テンプレートを含む複数ロードマップ管理
- 残り日数、期間・全体・今月の進捗を動的に分離表示
- 日付から生成する月別タイムライン、カテゴリ別進捗
- Goal、Task、Subtask、Monthly Review、Memory
- タスク作成・編集・完了・削除とUndo
- Goal完了時だけの短い達成演出とMemory作成
- `Cmd / Ctrl + K`検索、Focus Mode、Light / Dark / System
- Desktop Sidebar、Tablet Compact Sidebar、Mobile Bottom Navigation
- モバイルのPortal型ボトムシートとデスクトップダイアログ
- 空状態から次の操作へ進むCTA

## セキュリティ

- ユーザー入力はReactのテキストとして描画し、`innerHTML` / `dangerouslySetInnerHTML`を使用しない
- 編集・進捗・プロンプト・コピー・インポート・エクスポート時にネットワーク送信しない
- production CSPは `default-src 'self'`、`connect-src 'self'`、`object-src 'none'`、`base-uri 'none'`、`form-action 'none'`、`frame-ancestors 'none'`。`connect-src`はService Workerが静的アプリ本体をキャッシュするための同一オリジンだけを許可
- Referrer-Policy、nosniff、DENY frame、COOP/CORP、HSTS、最小権限Permissions-Policy
- 外部フォント、外部JavaScript/CDN、外部画像、SDK、分析、エラー監視なし
- Service Workerは静的ファイルだけをキャッシュし、IndexedDBデータやバックアップをキャッシュしない
- 削除はアプリ専用IndexedDB storeと既知のlocalStorageキーだけを対象とし、`localStorage.clear()`を使わない

Next.js/Reactがhydration/style用インラインコードを生成するため、production CSPの `script-src` と `style-src` には現在 `unsafe-inline` が必要です。`unsafe-eval` は許可しません。

## アプリ構造

```text
app/
├── page.tsx             全画面と操作の統合
├── roadmap-data.ts      型、空状態、月生成、旧データ移行
├── local-data.ts        IndexedDB workspace、原子保存、旧Schema互換
├── event-backup.ts      Schema v2、検証、ID再生成、AI計画プロンプト
├── backup-ui.tsx        AI・ファイル・貼り付け・プレビュー・確認
├── roadmap-manager.tsx  作成、切り替え、編集、削除
├── onboarding.tsx       初回セットアップ、操作ガイド、ヘルプ
├── next-step-prompt.ts  ローカルの次の一歩生成とコピー代替
└── globals.css          デザイントークン、レスポンシブ、Motion
public/sw.js              静的アプリシェルのオフラインキャッシュ
tests/security.test.ts    移行、インポート攻撃、Schema、コピー試験
```

## 進捗率

削除済み・アーカイブ済みタスクを除外し、全画面で同じ計算を使用します。

1. サブタスクがある: 完了サブタスク数 ÷ 全サブタスク数
2. 数値進捗がある: 0〜100へ補正した値
3. それ以外: 完了100%、未完了0%

全体、月、カテゴリは対象タスク進捗の単純平均です。期間進捗は各ロードマップの開始日とイベント日から毎回計算します。

## 将来の拡張

- Web Cryptoを使った任意の暗号化バックアップ
- Memory画像をIndexedDBへ保存する添付機能
- インポートSchemaのバージョン別移行テスト
- 個人データを同期しない範囲でのインストール可能なPWA改善
