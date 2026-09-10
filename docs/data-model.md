# データモデル

保存先は localStorage のみ。サーバー（通知共通基盤）には業務データを一切置かない。

## 1. ストレージキー

| キー | 内容 |
| --- | --- |
| `tempalist:data` | `{schemaVersion:1, revision, templates, checklists, settings}` の単一JSONスナップショット |
| `tempalist:notification` | `{schemaVersion:1, device, subscription, maps, outbox, disable, subscriptionChange?}`（**エクスポート対象外**） |

業務データは1回のsetItemで保存し、容量不足で部分更新しない。`revision` は保存のたびに増加する。対応ブラウザではWeb Locksで同じOriginの書き込みを直列化し、未対応時もrevisionで直前の変更を検出する。編集中の対象が別タブで変わった場合は保存を拒否して入力を残す。v0.2.0では通知用の単一キーへ1回のsetItemで対応表とOutboxを保存する。旧設計の3キーは未使用だったため移行対象なし。

## 2. エンティティ

### 2.1 Template

```ts
interface Template {
  id: string;                 // crypto.randomUUID()
  name: string;
  status: "draft" | "active" | "archived";
  defaultOrderLocked: boolean; // 作成するリストの並び順ロック初期値。既定false
  items: TemplateItem[];      // 配列の順序が並び順（意味を持つ）
  createdAt: string;          // ISO 8601 UTC
  updatedAt: string;
}

interface TemplateItem {
  id: string;
  label: string;
  note?: string;              // 任意のメモ・補足
}
```

- `status` の既定は `active`。共有URLから取り込んだものは `draft`
- テンプレート1件の共有JSONからの取り込みも `draft`。下書きへの書き戻しは下書きを維持し、有効化は利用者が行う
- **自動削除しない**

### 2.2 Checklist

```ts
interface Checklist {
  id: string;
  title: string;
  sourceTemplateId: string | null;   // 空から作成時はnull。生まれ元が削除済みなら参照先なしとして扱う
  orderLocked: boolean;             // 作成時にテンプレート初期値をコピー。独立して変更可
  items: ChecklistItem[];            // 配列の順序が並び順
  dueAt: string | null;              // ISO 8601 UTC
  dueHasTime: boolean;               // false なら時刻はローカル09:00として補完済み
  notificationEnabled: boolean;
  offsets: string[];                 // 例 ["-24h", "-1h"]。期限からの相対値
  status: "active" | "settled";
  settledAt: string | null;          // 確定日時。保持期間の起算点
  createdAt: string;
  updatedAt: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  note?: string;
  checked: boolean;
  checkedAt: string | null;           // チェックしたUTC日時。未チェック・旧データの日時不明はnull
}
```

- `status = "settled"` の間は**編集ロック**。項目・期限・並び順・チェック状態を変更しない
- 再オープンで `status = "active"` に戻す。再確定時は `settledAt` を**上書き**する（世代を持たない）
- `sourceTemplateId` が現存しない場合、書き戻しは新規登録のみを提示する

### 2.3 Settings

```ts
interface Settings {
  completedRetention: "30d" | "90d" | "365d" | "keep";  // 既定 "90d"（確定済み）
}
```

### 2.4 通知の端末内モデル（エクスポート対象外）

```ts
interface NotificationDeviceState {
  appId: "tempalist";
  deviceId: string;
  deviceSecret: string;
  protocolVersion: 2;
  createdAt: string;
}

interface ReminderMapping {
  reminderId: string;        // 論理通知枠に1つ。使い回す
  checklistId: string;       // ローカル所有者。APIへ送らない
  slotKey: string;           // オフセット文字列。checklistId との組で一意
  notificationKey: "deadline_advance" | "deadline_imminent";
  routeKey: "list";
  scheduledAt: string;       // 最後にキューへ反映した予約時刻（UTC）。送信済みとは限らない
}

interface OutboxItem {
  id: string;                // Idempotency-Key
  operation: "upsert" | "cancel";
  reminderId: string;
  scheduledAt?: string;
  notificationKey?: string;
  routeKey?: string;
  attemptCount: number;
  nextAttemptAt: string;
}
```

**論理通知枠 = チェックリスト × オフセット**。`(checklistId, slotKey)` に対して `reminderId` を1つ割り当て、期限が変わっても同じIDで置換する。オフセットを追加したら新しいIDを発行し、削除したら取消する。

## 3. ライフサイクル

| リソース | 生成 | 更新 | 削除 | 上限 |
| --- | --- | --- | --- | --- |
| Template | 作成／複製／共有URL・共有JSON取り込み／バックアップ取り込み／書き戻し | 編集、書き戻し（`draft` は維持、`archived` は `active` へ戻す） | 手動のみ | 固定の件数・項目数上限なし |
| Checklist | テンプレートから生成／空から作成／バックアップ取り込み | 編集・チェック・並べ替え・期限変更（`settled` 中は不可） | 手動／保持期間経過／容量不足時の確認付き削除（下記） | 固定の件数・項目数上限なし |
| ReminderMapping | 通知ON時、オフセット追加時 | 期限変更で `scheduledAt` を再計算 | 通知OFF、確定、リスト削除、オフセット削除 | 1リストにつき複数 |
| OutboxItem | API送信の直前 | 再試行で `attemptCount` / `nextAttemptAt` を更新 | 成功レスポンス検証後 | — |

- `completedRetention = "keep"` では容量不足でも自動削除しない。エクスポート・手動削除を案内する
- 他の保持期間では `settledAt` からの期間経過を基準に `settled` のみ自動削除する。期間内の完了リストを容量整理で削除する場合は、古い順に候補を選び、件数を表示して利用者の確認を得る
- 容量不足で新規保存できない場合は、次のリスト作成に空き容量の確保が必要と画面表示する。削除をキャンセルした場合はデータを消さず、未保存の入力を画面に残す
- 固定の件数上限は設けないが、保存できる量は端末の容量に依存する。50項目でも快適に操作できることを検証する

## 4. エクスポート形式

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-09T00:00:00.000Z",
  "templates": [],
  "checklists": [],
  "settings": { "completedRetention": "90d" }
}
```

- **通知状態のキーは含めない**（端末資格情報、購読、対応表、Outbox、停止・購読更新の操作）
- 取り込んだチェックリストは `notificationEnabled: false` に強制する
- `schemaVersion` が未知なら取り込みを中止し、理由を表示する
- リスト・テンプレートの取り込みは**追加**とし、既存データを上書き・削除しない。ID衝突時は取り込み側を新IDに振り直す。同じファイルの再取り込みも別データとして追加する
- テンプレートIDを振り直した場合、同じ取り込み内のチェックリストの `sourceTemplateId` も対応する新IDに置換する。項目順・メモを維持する
- v0.1.0は取り込み側の全エンティティ・項目に新IDを付ける。取り込み内に元テンプレートが存在しない参照はnullにし、移行先の無関係なテンプレートとの誤接続を防ぐ
- `settings` は書き出しには含めるが、取り込み時は適用せず、移行先の設定を維持する（Q-11確定済み）。取り込んだデータにも移行先の保持期間・容量整理方針を適用する。移行先が初期設定なら、その初期設定に従う

## 5. 共有URL形式（テンプレート1件）

`https://tempalist.sikumilab.com/#t=<Base64URL(JSON)>`

内容をHTTPリクエストに含めないためフラグメントを使用する。UTF-8のJSONをBase64URL化する。共有データは暗号化されておらず、リンクを知る相手は読み取れる。

```json
{ "schemaVersion": 1, "kind": "template", "name": "...", "items": [] }
```

- `status` は含めず、取り込み側で必ず `draft` にする
- 個人情報を含めないよう、共有前に注意喚起を表示する
- 完成したURL全体が8000文字を超える場合はリンク生成を中止し、理由とテンプレート1件のJSON書き出しを提示する。8000文字は運用上の初期値であり、すべての共有先で使える保証値ではない

## 6. テンプレート1件の共有JSON

5章と同じ `{ schemaVersion: 1, kind: "template", name, items }` 形式をUTF-8のJSONファイルとして書き出す。テンプレート名・項目名・メモ・並び順を保持し、通知資格情報やチェックリストを含めない。

- 取り込み時は `kind` と `schemaVersion`、内容の形式を検証し、S-08で内容確認後に新しいテンプレートとして `draft` で追加する
- `status` は書き出しに含めず、受け取り側で決める。未知版・破損データは取り込まない
- 全体バックアップのJSONとは形式を区別し、設定画面のファイル選択からも共有JSONの確認画面へ進める

## v0.1.6の互換性・並び順ロック

- schemaVersion 1の互換的な任意項目追加。旧レコード・旧バックアップ・旧共有にロック項目がない場合だけfalseで補完し、元の並び順は変えない。存在する値はbooleanを必須とし、null・文字列・数値は拒否する。保存時に正規化した項目を含める。
- テンプレートのdefaultOrderLockedを新規Checklist.orderLockedへコピーする。空から作成したリストはfalse。テンプレートの後日の変更は既存リストへ伝播しない。リスト側の変更もテンプレートへ伝播しない。
- ONのチェックリストではreorderItemsを拒否し、updateChecklistのitems経由でも既存項目の相対順序変更を拒否する。ラベル・メモ編集、チェック、項目追加・削除は可能。完了確定中は従来どおりすべての編集とロック切替を禁止し、再開時にorderLockedを維持する。
- テンプレート複製・共有JSON／URL・バックアップ取り込みで設定を保持する。既存テンプレートへの書き戻しはそのdefaultOrderLockedを維持し、新規テンプレートへの書き戻しはリストのorderLockedを初期値として設定する。
- sessionStorageの `tempalist:last-checklist` はそのブラウザタブで最後に開いたChecklist.idを保持する一時的な画面状態。チェックリスト本体は従来どおりlocalStorageのみ。エクスポート対象外。明示的に一覧へ戻るか、対象が削除された場合は記録を消す。sessionStorageが使えない場合はメモリ内で継続する。

## v0.2.0 通知状態の保存

通知状態の実際の構造は `src/notification/queue.js` と `runtime.js` が管理する。ReminderMappingはreminderId/checklistId/slotKey/scheduledAt、OutboxItemはid/operation/reminderId/body?/attemptCount/nextAttemptAt/blocked/error?。notificationKey/routeKeyはupsertのbodyにだけ含む。nextAttemptAtはUTCのISO文字列。

- `subscription` はブラウザ購読のJSON。`subscriptionChange` は変更後購読と保存済み操作キーを持つ。`disable` は端末停止の操作キー・試行回数・次回時刻・停止状態を持つ。
- 通知送信前にOutboxを保存し、検証済み成功応答を受けた後だけ操作を除去する。取消の対応表は成功まで保持。送信済みの過去枠はタップ解決用に残し、起動時に再作成しない。
- 通知処理用Web Lockは `tempalist:notification`。業務保存用ロックとは別で、通信待ちがチェック操作を妨げない。通知の有効化はWeb Locks対応ブラウザに限定する。
- 期限または全オフセットの削除時はnotificationEnabledをfalseにする。完了・再開・インポートも従来どおりfalse。端末全体の通知停止は全リストをfalseにする。

## v0.3.0 全体備考・チェックリスト記録

Checklistにremarks（文字列、旧データは空文字）、remarksUpdatedAt（UTC ISO日時またはnull、旧データはnull）を追加する。schemaVersionは1のまま。保存層は文字列とUTC日時を検証し、バックアップでも保持する。

確定後の編集禁止の例外としてupdateChecklistRemarksだけを許可する。remarks変更時はremarksUpdatedAtとupdatedAtを更新し、settledAt・status・items・通知設定を維持する。同一内容の保存では日時を変えない。画面の未保存入力はタブ内のメモリで保持し、別タブでremarksまたはremarksUpdatedAtが変わっていれば保存を中断して入力を保持する。

1件の記録はkind: checklist-recordとして出力し、全体バックアップとは区別する。設定から取り込む際は既存の追加インポートへ渡し、ID再発行・通知OFF・移行先設定維持の規則を適用する。形式と時刻の意味はchecklist-records.mdを参照。

## v0.3.8 項目のチェック日時

schemaVersion 1への互換的な任意項目追加。ChecklistItem.checkedAtが未定義またはnullならnullに正規化し、文字列があればUTC日時として検証する。checked=falseかつ日時ありの不整合データは取り込みを拒否する。旧チェック済み項目には日時を生成しない。

toggleItemでON時にチェック日時とリストupdatedAtに同じ操作時刻を記録し、OFF時にcheckedAtをnullに戻す。updateChecklist経由でチェック状態を変更しても同じ規則とする。チェック済みのまま項目を編集する場合は保存済みのcheckedAtを維持し、編集入力からの日時差し替えは受け付けない。新しい項目は現在の操作でチェックした場合だけ日時を持つ。

チェック日時は再描画・再起動・完了確定・再開・並べ替え・備考編集で保持する。バックアップと1件の記録の再取り込みでも保持する。テンプレートへの書き戻し・テンプレートから作成した次のリストには引き継がない。
