# 公開・通知基盤との接続

## GitHub Pages

- リポジトリ: https://github.com/gerupon-lgtm/tempalist
- 公開元: `feat/tempalist-foundation`
- ワークフロー: `.github/workflows/pages.yml`
- 配信対象: `npm run package:site` が作成する `_site/` のみ
- 公開URL: https://tempalist.sikumilab.com
- DNS: `tempalist.sikumilab.com` のCNAMEは `gerupon-lgtm.github.io`

2026-09-10: 初回Actions実行 `34382815100` が成功。カスタムドメインの証明書発行、HTTPS強制を設定し、公開URLでHTTP 200を確認済み。

公開元へのpushまたはActionsの手動実行で、UTCテスト・配信物検証後にデプロイする。公開ブランチを変える場合はワークフローのbranchesとGitHub側の環境保護設定を合わせて変更する。

ローカル画面と公開画面は保存先が異なる。設定のJSON書き出し・取り込みで移す。ブラウザ内の業務データはデプロイに含まれない。

## 通知基盤の登録依頼

**現在の状態（v0.2.0）:** 基盤側の登録は完了。公開Originの公開鍵GET 200と予約操作のCORS preflight 204を確認済み。下記のAPP_NOT_FOUNDは登録前の記録。ローカルOriginは現時点で未許可。端末での確認は [notification-verification.md](notification-verification.md) を参照する。

2026-09-10に次の公開鍵APIをOrigin付きで確認した結果、HTTP 404 `APP_NOT_FOUND`。基盤側にこのアプリの登録が必要。

| 項目 | 値 |
| --- | --- |
| API Origin | `https://api.atoqueue.sikumilab.com` |
| appId | `tempalist` |
| 許可Origin | `https://tempalist.sikumilab.com` |
| 開発用Origin（必要な場合） | `http://127.0.0.1:4173` |
| notificationKeys | `deadline_advance`, `deadline_imminent` |
| routeKeys | `list` |
| VAPID鍵 | tempalist専用。秘密鍵は基盤内のみで保持 |

確認先は `GET /v2/apps/tempalist/push/public-key`。成功応答と公開Originに対するCORS許可が必要。アプリ側から秘密鍵を指定しない。共通基盤のコード・DB・設定はこのリポジトリでは変更しない。

発案者の指定により、登録は通知基盤側のタスクで実施する。この表を渡し、既存atoqueue/v1の登録・鍵・通知を維持したままtempalistを追加する。完了報告には許可Origin・notificationKeys・routeKeysと公開鍵GETの確認結果だけを含め、秘密鍵・端末秘密情報は含めない。

基盤側の確認条件:

1. 公開Origin付き公開鍵GETが200になり、有効なVAPID公開鍵を返す。
2. `Access-Control-Allow-Origin` が公開Originを許可し、ブラウザから応答を読める。
3. v2の端末登録・予約操作のpreflightがPOST/PUT/DELETEとContent-Type・Authorization・Idempotency-Keyを許可する。
4. `deadline_advance` / `deadline_imminent` と `list` がRegistryの許可キーに含まれる。

v0.1.7の公開画面では、設定 → 通知の接続確認 → 「接続を確認する」で確認できる。未登録時にCORSヘッダが付かない場合、ブラウザにはAPP_NOT_FOUNDの本文が見えず「通知基盤に接続できません」と表示される。接続確認はGETのみで、自動再試行や通知許可要求を行わない。

登録後は公開画面で接続確認、利用者操作による通知許可・端末登録、予約・取消、実機での受信・タップを順に検証する。公開鍵APIの成功だけでは通知配送の検証完了とはしない。

## PWAの更新

v0.3.1では古いHTTPキャッシュの再利用を防いでアプリ一式を取得し、Worker・version.js・manifestの版を照合する。各リリースで必ず版数を上げる。更新でlocalStorageや通知資格情報を削除しない。通常Chromeが旧版のままの場合は [更新専用ページ](https://tempalist.sikumilab.com/update/) を利用する。原因・実装・利用者向け手順は [pwa-update.md](pwa-update.md)。
