# あとキュー → テンパリスト 起動URL連携仕様 v1

作成日: 2026-09-11。受信側実装版: テンパリストv0.4.0。あとキュー側の送信機能を接続するための仕様。Androidを優先し、iOSは起動先・保存領域の実機検証で対応を判断する。iOSで動かない、または操作が煩雑になる場合は、この連携をAndroid限定にする。テンパリスト単体のiOS対応は維持する。

## 1. 合意した範囲

- あとキューで選んだ複数の予定を、1つのチェックリストにまとめる。買い物など、別々に登録した予定をまとめてチェックする用途。
- あとキューから項目そのものを渡す。既存テンプレートを指定したり、新しいテンプレートを作成したりする方式ではない。
- 項目名・コメント・配列の並び順を引き継ぎ、全項目を未チェックで作成する。
- 起動後に内容とリスト名を確認し、「作成する」を押して保存する。リスト名は作成前に変更できる。
- 今回は一方向連携。テンパリストでのチェック・完了・削除によって、あとキューの予定を変更しない。戻りURL、完了通知、双方向同期は含めない。
- 将来の対応に備え、元の予定IDを項目ごとに保持する。

以下は受信側が実装したパラメータ名・初期値・重複処理である。初稿からURL形式・基本パラメータの変更はない。

## 2. 起動URL

```text
https://tempalist.sikumilab.com/#create=<payload>
```

payloadはJSONをUTF-8にした後、Base64urlで符号化する。`+`を`-`、`/`を`_`に置換し、末尾の`=`を除く。日本語を含むJSON文字列を直接btoaへ渡さない。

既存のテンプレート共有 `#t=` と区別する。タイトルや項目はクエリ文字列には入れず、HTTPリクエストに送られないフラグメントに格納する。符号化は暗号化ではなく、URLを入手した人は内容を読める。受信内容を通知共通基盤へ送信しない。

## 3. パラメータ

```json
{
  "schemaVersion": 1,
  "kind": "checklist-create",
  "source": "atoqueue",
  "requestId": "11111111-1111-4111-8111-111111111111",
  "title": "今日の買い物",
  "items": [
    {
      "sourceTaskId": "task-milk",
      "label": "牛乳を買う",
      "note": "1リットルを2本"
    },
    {
      "sourceTaskId": "task-battery",
      "label": "電池を買う",
      "note": "単3を4本"
    }
  ]
}
```

| フィールド | 必須 | 形式・意味 |
| --- | --- | --- |
| schemaVersion | 必須 | 数値1。起動連携の形式バージョン |
| kind | 必須 | 固定値 `checklist-create` |
| source | 必須 | 固定値 `atoqueue`。送信元の自己申告であり認証ではない |
| requestId | 必須 | 送信操作ごとのUUID。あとキューで発行する |
| title | 必須 | 空白のみではない文字列。あとキューで用意し、受信後に利用者が変更可能 |
| items | 必須 | 1項目以上の配列。配列順をチェックリストの順番にする |
| items[].sourceTaskId | 必須 | あとキューの予定ID。空白のみではない文字列。同じ送信内で重複不可 |
| items[].label | 必須 | 空白のみではない文字列。チェック項目名 |
| items[].note | 任意 | 文字列。省略時は空文字。元の予定のメモ |

元の予定IDはテンパリストの項目IDには流用せず、参照用として保持する。チェックリストID・項目IDはテンパリストで新規発行する。項目名が同じでも元の予定IDが違えば別項目として扱う。

初版は日時パラメータを設けず、期限は未設定、通知はOFF、全体備考は空欄、並び順ロックはOFFで作成する。複数の予定の期限から1つを自動選択しない。作成後は既存の画面から変更できる。checkedはfalse、checkedAtはnull、statusはactive、sourceTemplateIdはnullとし、作成日時は保存した端末の現在時刻をUTCで記録する。

## 4. 送信と重複作成

1. あとキューで対象の予定を選び、項目順・リスト名を決める。
2. 送信内容を確定した時点でrequestIdを発行し、同じ操作の再試行では同じIDと内容を使う。
3. 内容を変更した場合、または別のリストを作りたい場合は、新しいrequestIdで送信する。
4. テンパリストでは、保存済みの直接受信リストをsourceとrequestIdで照合する。
5. 同じ連携IDのリストがあれば「作成済みです」と案内し、既存リストを開く。進行中・完了済みにかかわらず、新規作成も上書きもしない。

未保存のプレビューを開いただけでは作成済みと扱わない。「作成する」の多重押下・同時タブ作成も、保存直前の照合とWeb Locksによる排他で1件にする。リスト本体と連携情報は同じlocalStorageスナップショットで保存する。

重複防止の範囲は同じ保存領域内に対象リストが残っている間。リスト削除・保持期間による整理・サイトデータ消去の後は、同じURLでも再び確認画面から作成できる。削除したリストの履歴を永久保存する仕組みは追加しない。別端末・別ブラウザとの重複照合はしない。

バックアップ・証跡JSONには元の予定IDを保持する。バックアップ取り込みは既存仕様どおり別リストとして追加し、そのコピーを起動URLの直接受信済み判定に使わない。テンプレートへの書き戻しと次のリストへの生成では、元の連携ID・予定IDを引き継がない。

## 5. 受信画面とエラー

- 受信直後に形式を検証し、リスト名・項目名・コメント・件数を確認できる画面を表示する。勝手に保存しない。
- 「作成する」で保存し、そのチェックリストを開く。キャンセル時は保存しない。
- 保存処理中はタイトル変更・キャンセル・Escape・別リンクへの切替を停止する。保存に失敗した場合は入力を保持し、再試行・キャンセルできる状態に戻す。
- 作成完了・キャンセル時は、通常の画面URLに置き換える。再読み込みだけで再作成しない。
- 既存画面に未保存の入力がある場合は、受信を中断して元の画面URLへ戻し、入力の保存・画面を閉じた後にリンクを再度開くよう案内する。受信内容で上書きしない。
- 項目名・コメント等は文字列として描画する。HTMLやスクリプトとして解釈しない。
- 未知のschemaVersion、異なるkind/source、不明なフィールド、必須値欠落、型違い、空の項目配列、ID重複、壊れた符号化は、理由を示して作成を中止する。通知許可は要求しない。
- 保存容量不足時は既存データを残し、作成成功を表示しない。容量整理後に再操作できるようにする。

## 6. URLの長さ

既存共有と同じ運用上限として、完成したURL全体を8000文字以内とする。ブラウザ・OS共通の保証値ではない。あとキューの送信側とテンパリストの受信側の両方で検査する。

超過時は項目やコメントを自動で切り捨てず、「項目を分けて送ってください」と案内する。初版はURL連携のみとし、このkindのJSONファイル取り込みは含めない。既存のバックアップ取り込みは、この起動連携の代替手段としては利用できない。

## 7. iOS・Androidでの起動先確認

URLの受信・作成処理を実装できることと、インストール済みのPWA内に直接開けることは別に検証する。同じ端末でも、普段のPWAと別のブラウザ保存領域で開くと、普段のリスト・通知登録を参照できない。

特にiOSのホーム画面WebアプリとSafariの保存領域分離に注意する。通常URLで必ず既存PWAを開けるとは仕様上約束しない。まず最小の受信画面で、あとキューからの遷移先と、いつものテンパリストへ戻った時に同じ作成リストが見えるかを確認する。異なる保存領域で開く場合は、利用可能な受け渡し方法を別途検討してから本利用へ進む。

参考: [WebKitの保存領域分離に関する記録](https://bugs.webkit.org/show_bug.cgi?id=181849)、[ChromeのPWAナビゲーション管理](https://developer.chrome.com/docs/capabilities/pwa-navigation-management)。端末とブラウザの実機確認を優先する。

## 8. 担当範囲と確認項目

- あとキュー側: 予定の複数選択、順番とタイトルの決定、元ID・メモの取得、連携IDの管理、UTF-8/Base64url変換、URL長検査、リンク起動。送信で元の予定を完了・削除しない。
- テンパリスト側: URL解析、検証、プレビュー、保存、重複防止、元IDの保持、既存の記録・バックアップとの整合。
- 通知基盤: 今回の連携のためのAPI追加・変更は不要。
- 検証: 日本語・絵文字・改行、項目順、同名項目、未チェック初期化、元ID維持、二重起動・二重押下、削除後の再作成、破損・未知版・URL超過、容量不足、既存テンプレート共有との共存、あとキュー側に変更がないこと。
- 実機: AndroidとiOSそれぞれで、両PWA起動時・テンパリスト終了時のリンク起動先、普段の保存領域との一致、保存後にホーム画面から再度開いた時のリスト表示を確認する。

## 9. あとキュー側のURL生成例

次はブラウザ上で動くJavaScript。あとキュー側では、選択した予定を3章の形式に整え、入力を検証したうえで使う。実際の予定IDの形式は変更せず文字列として渡す。

```js
function makeTempalistUrl(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary)
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = 'https://tempalist.sikumilab.com/#create=' + encoded;
  if (url.length > 8000) throw new Error('項目を分けて送ってください。');
  return url;
}

// 選択内容を確定する時に作成して保持する。同じ操作の再試行では再発行しない。
const payload = {
  schemaVersion: 1,
  kind: 'checklist-create',
  source: 'atoqueue',
  requestId: crypto.randomUUID(),
  title: '今日の買い物',
  items: [
    { sourceTaskId: 'task-milk', label: '牛乳を買う', note: '1リットルを2本' },
    { sourceTaskId: 'task-battery', label: '電池を買う', note: '単3を4本' }
  ]
};

const link = document.createElement('a');
link.href = makeTempalistUrl(payload);
link.textContent = 'テンパリストでチェックリストを作る';
// あとキューの送信確認画面へ配置し、利用者のタップで開く。
// targetの指定で既存PWAへの起動を保証することはできない。
```

テンパリスト側の検証用生成関数はsrc/checklist-link.jsのbuildChecklistLink。`node scripts/print-checklist-link.mjs`で2項目の試験用URLを表示できる。同じ試験用URLを繰り返し開いた場合は作成済みのリストに移動する。リンクをCodexやメールから開く試験だけでは、あとキューPWAからの起動先確認にはならない。

## 10. 保存と実装箇所

- 受信・符号化・検証・作成: src/checklist-link.js。URLで通知共通基盤を呼ばない。
- 入口と確認画面: src/app.js。チェックリスト名は変更可能。項目とコメントは読み取り用プレビューとし、作成後は既存の編集機能を使える。
- Checklist.receivedFrom: `{source: "atoqueue", requestId: UUID, direct: boolean}`。直接受信したリストはdirect=true。バックアップ・証跡JSONから取り込んだコピーはfalse。
- ChecklistItem.sourceTaskId: 元の予定ID。いずれの保存項目も任意とし、旧データに追加必須とはしない。既存項目の編集・チェック・並べ替えで維持し、新しく手入力した項目には元IDを付けない。
- requestIdは保存・比較時に小文字に正規化する。同じIDで異なる内容が届いても既存リストを上書きしない。送信内容の変更時は送信側が新しいIDを使う。
- 従来のテンプレート共有 `#t=`、通知からのリスト起動、通常のリスト作成・編集の入口は維持する。

単体・ブラウザ検証の結果はdocs/implementation-log.mdのv0.4.0節に記録する。Android/iOSのOSによるPWA起動先と、実際のあとキュー画面からの送信操作は、受信側の自動テストとは別に確認する。

## 11. 受信確認用リンク

[2項目の買い物リストを確認する](https://tempalist.sikumilab.com/#create=eyJzY2hlbWFWZXJzaW9uIjoxLCJraW5kIjoiY2hlY2tsaXN0LWNyZWF0ZSIsInNvdXJjZSI6ImF0b3F1ZXVlIiwicmVxdWVzdElkIjoiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIiwidGl0bGUiOiLpgKPmkLrjg4bjgrnjg4jjg7vosrfjgYTniakiLCJpdGVtcyI6W3sic291cmNlVGFza0lkIjoidGVzdC1taWxrIiwibGFiZWwiOiLniZvkubPjgpLosrfjgYYiLCJub3RlIjoiMeODquODg-ODiOODq-OCkjLmnKwifSx7InNvdXJjZVRhc2tJZCI6InRlc3QtYmF0dGVyeSIsImxhYmVsIjoi6Zu75rGg44KS6LK344GGIiwibm90ZSI6IuWNmDPjgpI05pysIn1dfQ)

開いた時点では保存しない。「作成する」を押すと試験用リストを作成する。同じリンクの再操作では既存の試験用リストを開く。送信元は試験用であり、実際のあとキューの予定には接続していない。OSの起動先確認には、あとキューの画面からこのURLを開いて試す。
