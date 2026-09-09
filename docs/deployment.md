# 公開・通知基盤との接続

## GitHub Pages

- リポジトリ: https://github.com/gerupon-lgtm/tempalist
- 公開元: `feat/tempalist-foundation`
- ワークフロー: `.github/workflows/pages.yml`
- 配信対象: `npm run package:site` が作成する `_site/` のみ
- 公開URL: https://tempalist.sikumilab.com
- DNS: `tempalist.sikumilab.com` のCNAMEは `gerupon-lgtm.github.io`

公開元へのpushまたはActionsの手動実行で、UTCテスト・配信物検証後にデプロイする。公開ブランチを変える場合はワークフローのbranchesとGitHub側の環境保護設定を合わせて変更する。

ローカル画面と公開画面は保存先が異なる。設定のJSON書き出し・取り込みで移す。ブラウザ内の業務データはデプロイに含まれない。

## 通知基盤の登録依頼

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

登録後は公開画面で接続確認、利用者操作による通知許可・端末登録、予約・取消、実機での受信・タップを順に検証する。公開鍵APIの成功だけでは通知配送の検証完了とはしない。
