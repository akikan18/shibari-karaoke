# しばりカラオケ (Shibari Karaoke)

マルチプレイヤー対応のパーティーゲームアプリケーション。ランダムに出題される「お題」をクリアしてスコアを競います。

## 概要

しばりカラオケは、リアルタイム通信機能を活用したWebベースのパーティーゲームです。複数のプレイヤーがルームに参加し、様々なゲームモードで楽しむことができます。

## 主な機能

### ゲームモード

- **STANDARD (スタンダード)**: 個人戦バトル。全員がライバルとしてお題をクリアし、スコアを競います
- **TEAM BATTLE (チーム対抗戦)**: 2チームに分かれて対決。固有ロールとスキルを駆使して勝利を目指します
- **FREE MODE (フリーモード)**: スコアや勝敗を気にせず、ランダムにお題を出して遊べるカジュアルモード

### その他の機能

- ルームベースのマルチプレイヤー対応
- リアルタイム同期 (Firebase Realtime Database)
- プレイヤープロフィール編集
- ゲスト参加機能
- スマートフォン・タブレット対応
- Wake Lock対応 (画面スリープ防止)
- アニメーション豊富なUI (Framer Motion)

## 技術スタック

- **フロントエンド**: React 18 + TypeScript
- **ビルドツール**: Vite
- **ルーティング**: React Router v6
- **UI/スタイリング**: Tailwind CSS + DaisyUI
- **アニメーション**: Framer Motion
- **バックエンド/データベース**: Firebase (Firestore)
- **デプロイ**: GitHub Pages

## 開発環境のセットアップ

### 必要要件

- Node.js (v18以降推奨)
- npm または yarn

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd shibari-karaoke

# 依存関係をインストール
npm install
```

### Firebase設定

1. Firebaseプロジェクトを作成
2. プロジェクトルートに `.env` ファイルを作成
3. Firebase設定情報を記載:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 開発サーバーの起動

```bash
npm run dev
```

アプリケーションは `http://localhost:5173` で起動します。

## ビルドとデプロイ

```bash
# プロダクションビルド
npm run build

# ビルドしたファイルのプレビュー
npm run preview

# GitHub Pagesにデプロイ
npm run deploy
```

## プロジェクト構成

```
src/
├── components/     # 再利用可能なUIコンポーネント
├── screens/        # 各画面のコンポーネント
├── hooks/          # カスタムReact Hooks
├── firebase.ts     # Firebase設定
├── App.tsx         # メインアプリケーション
└── main.tsx        # エントリーポイント
```

## 主要な画面

- `EntranceScreen`: エントランス画面 (ルーム作成・参加)
- `MenuScreen`: ゲームモード選択画面
- `GameSetupScreen`: ロビー画面 (プレイヤー準備)
- `GamePlayScreen`: ゲームプレイ画面 (スタンダードモード)
- `GamePlayTeamScreen`: ゲームプレイ画面 (チームバトルモード)
- `FreeModeScreen`: フリーモード画面
- `ResultScreen`: 結果発表画面
- `CustomThemeScreen`: お題カスタマイズ画面

## ライセンス

このプロジェクトはプライベートプロジェクトです。
