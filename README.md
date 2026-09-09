# !=テンパリスト

NOT EQUAL TEMPALIST — テンプレートから作る、1回ごとのチェックリスト。

v0.1.3は個人試用向けのフロント実装です。テンプレート管理、リストの作成・チェック・完了・再開、書き戻し、共有、バックアップ、保持期間と容量整理を使えます。ヘッダにアイコンと名称、フッターに版数とコピーライトを表示します。

通知、Service Workerによるオフライン起動、ホーム画面追加案内は後続P4です。配色はA1改の画像を再確認して補正（白い背景、青みのあるグレー、薄いピンク、コーラル系アクセント、白文字の完了ボタン）。候補からNoto Sans JPを仮採用し、取得失敗時は端末標準のゴシック系を使います。チェック領域と右端を除いたカード全体を約0.45秒長押しすると半透明カードで並べ替えできます。右端の↑↓で1段ずつ移動でき、⋯は編集・削除です。この操作方式は実画面で確認中です。公開・DNS・通知基盤の変更は行っていません。

GitHubリポジトリは [gerupon-lgtm/tempalist](https://github.com/gerupon-lgtm/tempalist)。ローカルのoriginとして登録済みで、push・公開は未実施です。

## 起動

Node.js 22.12以上を使用します。本番用のフレームワーク・バンドラはありません。npm依存は開発用だけです。

```powershell
npm.cmd install
npm.cmd start
```

[ローカル画面](http://127.0.0.1:4173) をChromeなどで開きます。ファイルを直接開く方法には対応していません。専用サーバーはアプリのファイルだけを配信し、docsや開発ファイルを公開しません。

データは開いたOriginのlocalStorageに保存します。`localhost`と`127.0.0.1`、異なるポート、公開ドメインは別の保存先です。移行するときは設定からJSONを書き出し、移行先で取り込んでください。

## 検証

```powershell
npm.cmd test
npm.cmd run test:utc
npm.cmd run check
```

`npm start`を別ターミナルで起動した状態で、インストール済みGoogle Chromeを使う画面検証を実行できます。

```powershell
npm.cmd run test:browser
```

画面検証は隔離したブラウザ環境を使います。利用者のChromeプロファイルや保存データには触れません。スクリーンショットは`artifacts/`に保存します。実機iOS/Androidのタッチ操作、数週間の個人試用は別途必要です。

## 配信物の準備

```powershell
npm.cmd run package:site
node scripts/check-artifacts.mjs
```

`_site/`にHTML/CSS/ESM/アイコン/manifestとCNAMEをコピーします。ここだけをGitHub Pagesに配信する想定です。目標ドメインは `tempalist.sikumilab.com`。このコマンドは公開しません。

`check-artifacts.mjs`は一時コピーで版数を意図的に不一致にし、検証が失敗することと、配信物の内容が現在のアプリと一致することを確かめます。確認用のサンプル画面は、サーバー起動中に `node scripts/capture-preview.mjs` で生成できます。

## 設計と引き継ぎ

- [実装状況と検証記録](docs/implementation-log.md)
- [要件定義書](docs/要件定義書_テンパリストではない.md)
- [実装タスク](docs/tasks.md)
- [データモデル](docs/data-model.md)
- [画面設計](docs/screens.md)
- [承認済みサンプル5種](docs/sample-templates.md)

業務データは`tempalist:data`に単一JSONで保存し、保存失敗時に元データを保持します。共有URLは`#t=`内に内容を入れ、HTTPでサーバーに送信しません。容量警告は概算であり、実際の保存結果が優先されます。

カードの⋯メニューは外側クリック・Escapeで閉じます。短いメモはカード内に表示し、3行を超えて収まらない場合は「続きを読む」から画面下部で全文を読めます。書体の実画面比較は `node scripts/capture-font-comparison.mjs` で生成できます。
