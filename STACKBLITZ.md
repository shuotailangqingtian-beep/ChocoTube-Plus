# StackBlitz 実行ガイド

このプロジェクトは StackBlitz で直接実行できるように構成されています。

## 実行手順

1. StackBlitz でリポジトリを開くと、自動的に `npm install` が実行されます。
2. `postinstall` スクリプトにより、Python の依存関係 (`requirements.txt`) と Node.js の依存関係 (`youtubei.js`, `express`) がインストールされます。
3. インストール完了後、`npm start` を実行してください。
4. 以下の2つのサーバーが起動します：
   - **Main Server (Node.js/Express)**: ポート 3000（メインのフロントエンド。PythonのFastAPIから移植されました）
   - **Innertube API (Node.js)**: ポート 5000（内部データ取得用）

## 修正内容

- `package.json`: StackBlitz 用の起動スクリプトと依存関係を追加。
- `server.mjs`: PythonのFastAPIサーバーをNode.js (Express) に移植し、StackBlitz環境でのライブラリ不足問題を解消しました。
- `innertube_index.mjs`: ポート番号を環境変数から取得できるようにし、Fetch問題を回避するための修正を行いました。
- `innertube_index.js`: ポート番号を環境変数から取得できるように柔軟性を持たせました。
- `.stackblitzrc`: StackBlitz の動作設定を追加。
- `setup.sh`: 環境構築用のヘルパースクリプト。

## 注意事項

- StackBlitz の環境によっては Python の起動に時間がかかる場合があります。
- ポート 3000 がプレビューとして表示されます。
