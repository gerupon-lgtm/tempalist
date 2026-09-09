# API・処理設計

通知API通信は**通知共通基盤 v2 のみ**。業務データの読み書きはすべて端末内で完結する。UIでは別途Google Fontsを読み込み、失敗時は標準フォントへフォールバックする。

- Base URL: 共通基盤管理者から受け取るAPI Origin
- `appId`: `tempalist`
- Origin: `https://tempalist.sikumilab.com`（開発時は localhost も登録が必要）
- 正典: `notification-platform-v2.md`。本書と食い違う場合は仕様書が優先
- 正式名称: `!=テンパリスト` / 英語表記: NOT EQUAL TEMPALIST
- 共通基盤v2は別途実装中。以下は連携予定の契約であり、稼働確認・連携検証は後回し。`tempalist` と新Originの外部登録完了は未確認

## 1. Registry申請内容（共通基盤管理者へ依頼する）

| 項目 | 値 |
| --- | --- |
| `appId` | `tempalist` |
| origins | `https://tempalist.sikumilab.com`（＋開発用 localhost） |
| notificationKeys | `deadline_advance`, `deadline_imminent` |
| routeKeys | `list` |
| VAPID鍵 | アプリ専用を基盤側で生成・保管（アプリ側は公開鍵をAPIから取得するのみ） |

**共通基盤のコード・DB・設定はこのプロジェクトの変更対象外。**

## 2. 使用するエンドポイント

| 用途 | Method / Path | 認証 | 冪等キー |
| --- | --- | --- | --- |
| VAPID公開鍵取得 | `GET /v2/apps/tempalist/push/public-key` | 不要 | 不要 |
| 端末登録 | `POST /v2/apps/tempalist/devices` | 不要 | 不要 |
| 購読更新 | `PUT /v2/apps/tempalist/devices/{deviceId}/subscription` | Bearer | 必須 |
| 端末無効化 | `DELETE /v2/apps/tempalist/devices/{deviceId}` | Bearer | 必須 |
| 予約の作成・置換 | `PUT /v2/apps/tempalist/reminders/{reminderId}` | Bearer | 必須 |
| 予約の取消 | `DELETE /v2/apps/tempalist/reminders/{reminderId}?deviceId={deviceId}` | Bearer | 不要 |

`repeatCadence` は**使わない**（繰り返しは要件の対象外）。

### 予約リクエスト

```json
{
  "deviceId": "…",
  "scheduledAt": "2026-09-19T00:00:00.000Z",
  "notificationKey": "deadline_advance",
  "routeKey": "list"
}
```

`title` / `body` / `url` / `checklistId` などを足すと400になる。**足さない。**

## 3. 予約時刻とキーの決定

```
期限(dueAt, UTC) + オフセット = scheduledAt
残り時間 = 期限 - scheduledAt
残り時間 <= 2時間  → notificationKey = "deadline_imminent"   【想定】
それ以外           → notificationKey = "deadline_advance"
```

- 期限に時刻がない場合は、**ローカル日付の09:00**として解釈してからUTC化する
- 算出した `scheduledAt` が現在時刻より過去なら、その枠は**登録しない**（既に過ぎた通知を作らない）
- 既定オフセットは `-24h` と `-1h`

## 4. 通知同期のトリガー

| 契機 | 処理 |
| --- | --- |
| 通知トグルON | 端末未登録なら §5 の登録フロー → 各オフセットの `reminderId` を発行し upsert |
| 通知トグルOFF | 当該リストの全 `reminderId` を cancel し、対応表から削除 |
| 期限変更 | ON中のリストのみ、**同じ `reminderId`** で再計算して upsert |
| オフセット追加 | 新しい `reminderId` を発行して upsert |
| オフセット削除 | 当該 `reminderId` を cancel |
| **確定（F-027）** | 当該リストの全 `reminderId` を cancel |
| リスト削除 | 同上 |
| 期限切れリスト | トグルを無効化。新規登録しない |
| インポート | **何もしない**（`notificationEnabled: false` で入る） |

## 5. 端末登録フロー（利用者操作を起点にのみ実行）

1. Web Push対応を機能検出（iOSはホーム画面追加済みか併せて判定）
2. 通知許可を要求。拒否ならトグルをOFFに戻して終了
3. Service Worker の ready を待つ
4. VAPID公開鍵を取得
5. `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
6. 端末登録APIへ購読を送信
7. `appId` / `deviceId` / `deviceSecret` / `protocolVersion` / `registeredAt` を端末内へ保存

どこかで失敗したら**通知有効として扱わない**。業務データは変更しない。

## 6. Outboxと再試行

- API送信の前にOutboxへ永続化し、成功レスポンスを検証してから削除する
- 通信断 / 500 / 503 → 同じ `Idempotency-Key` で再送（指数バックオフ）
- 429 → `Retry-After` 以上待って同じ操作を再送
- 400 / 403 / 409 / 413 → **自動再送しない**。記録して修復フローへ
- 401 / 404（`DEVICE_*`）→ 資格情報を破棄し、利用者へ再設定を案内
- 同じ予約に新しい変更が来たら、未送信の古い upsert は差し替えてよい。**送信中の操作のキーを別内容に流用しない**
- 取消が必要な予約は、業務データから消えても**取消成功まで対応表を保持する**

## 7. 起動時・オンライン復帰時の修復

1. 通知が有効かを確認
2. Notification permission と Push購読の有無を確認
3. 資格情報と購読が揃っていれば、**既存予約を作り直さない**
4. 対応表が欠けている枠だけを補完する
5. 保存済みOutboxを再送
6. 401 / 404 なら資格情報を破棄して再設定を案内

**起動のたびに新しい `reminderId` を発行しない。**

## 8. Service Worker

```js
const APP_ID = "tempalist";
const notificationMap = {
  deadline_advance:  { title: "!=テンパリスト", body: "期限が近いチェックリストがあります",     tagPrefix: "tempalist-advance"  },
  deadline_imminent: { title: "!=テンパリスト", body: "まもなく期限のチェックリストがあります", tagPrefix: "tempalist-imminent" },
};
const routeMap = { list: "/list" };
```

受信時の検証順（1つでも外れたら業務内容を表示せず、既定画面を開く）:

1. JSONオブジェクトで、許可フィールドのみ
2. `version === 2`
3. `appId === APP_ID`
4. `type === "reminder_due"`
5. `reminderId` がUUID
6. `notificationKey` が `notificationMap` に存在
7. `routeKey` が `routeMap` に存在
8. `groupId` が16文字の小文字16進数

tag は `${tagPrefix}-${groupId}`。通知dataには `reminderId` と `routeKey` だけを持たせる。タップ時は同一Originの同じpathがあれば focus、なければ `clients.openWindow()`。**payload由来の文字列をURLとして開かない。**

## 9. エラーコードと利用者向け文言

| サーバーコード | 画面文言 | 回復 |
| --- | --- | --- |
| `INVALID_SCHEDULE` | 「期限が過去のため通知を設定できません」 | 期限の更新を促す |
| `DEVICE_UNAUTHORIZED` / `DEVICE_NOT_FOUND` | 「通知の設定が無効になりました。再設定してください」 | 資格情報を破棄しS-07へ |
| `APP_ORIGIN_FORBIDDEN` / `APP_NOT_FOUND` | 「通知機能を利用できません」 | 自動再送しない。開発者向けにログ |
| `RATE_LIMITED` | （画面には出さない） | `Retry-After` 後に再送 |
| `INTERNAL_ERROR` / `PUSH_UNAVAILABLE` | 「通知の登録が保留中です」 | バックオフ再送 |
| 通信断 | 「通知の登録が保留中です」 | オンライン復帰時に再送 |

いずれの場合も**チェックリストの編集・保存は継続できる**。
