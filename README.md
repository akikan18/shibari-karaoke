# Shibari Karaoke

マルチプレイヤー対応のパーティーゲームアプリケーション。ランダムに出題される「お題」をクリアしてスコアを競います。

## 概要

**Shibari Karaoke**は、リアルタイム通信機能を活用したWebベースのパーティーゲームです。複数のプレイヤーがルームに参加し、様々なゲームモードで楽しむことができます。

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
├── components/               # 再利用可能なUIコンポーネント
│   ├── team-battle/          # チームバトルモード用コンポーネント
│   │   ├── overlays/         # オーバーレイ表示コンポーネント
│   │   │   ├── ActionOverlay.tsx       # ターン結果表示
│   │   │   └── AbilityFxOverlay.tsx    # スキル/ULTエフェクト
│   │   ├── modals/           # モーダルダイアログコンポーネント
│   │   │   ├── ConfirmModal.tsx        # 汎用確認ダイアログ
│   │   │   ├── JoinTeamRoleModal.tsx   # チーム・ロール選択
│   │   │   ├── TargetModal.tsx         # ターゲット選択
│   │   │   ├── GuideModal.tsx          # ロールガイド
│   │   │   └── OracleUltPickModal.tsx  # Oracle ULTお題選択
│   │   ├── MissionDisplay.tsx          # お題表示
│   │   └── ThemeSelectionGrid.tsx      # お題選択グリッド
│   └── Toast.tsx             # トースト通知
├── firebase/                 # Firebase関連
│   ├── index.ts              # Firebase設定
│   └── transactionHelper.ts  # トランザクションヘルパー
├── game/                     # ゲームロジック層
│   └── team-battle/          # チームバトルモード用ロジック
│       ├── abilities/        # ロール能力ハンドラー (1ファイル1ロール)
│       │   ├── types.ts      # ハンドラー型定義
│       │   ├── helpers.ts    # 共通ヘルパー関数
│       │   ├── index.ts      # ハンドラーレジストリ
│       │   ├── maestro.ts    # Maestro SKILL/ULT/PASSIVE
│       │   ├── showman.ts    # Showman SKILL/ULT/PASSIVE
│       │   ├── ironwall.ts   # Ironwall SKILL/ULT
│       │   ├── coach.ts      # Coach SKILL/ULT
│       │   ├── oracle.ts     # Oracle SKILL/ULT
│       │   ├── mimic.ts      # Mimic SKILL/ULT/PASSIVE
│       │   ├── hype.ts       # Hype SKILL/ULT
│       │   ├── saboteur.ts   # Saboteur SKILL/ULT/PASSIVE
│       │   ├── underdog.ts   # Underdog SKILL/ULT
│       │   └── gambler.ts    # Gambler SKILL/ULT/PASSIVE
│       ├── roles/            # ロール定義 (1ファイル1ロール)
│       │   ├── types.ts      # ロール関連の型定義
│       │   ├── index.ts      # ロール統合エクスポート
│       │   ├── maestro.ts    # Maestroロール定義
│       │   ├── showman.ts    # Showmanロール定義
│       │   ├── ironwall.ts   # Ironwallロール定義
│       │   ├── coach.ts      # Coachロール定義
│       │   ├── oracle.ts     # Oracleロール定義
│       │   ├── mimic.ts      # Mimicロール定義
│       │   ├── hype.ts       # Hypeロール定義
│       │   ├── saboteur.ts   # Saboteurロール定義
│       │   ├── underdog.ts   # Underdogロール定義
│       │   └── gambler.ts    # Gamblerロール定義
│       ├── armedBuffHandlers.ts  # Armed buffハンドラー
│       ├── memberUtils.ts        # メンバー正規化
│       ├── resultProcessor.ts    # 結果処理ユーティリティ
│       ├── scoring.ts            # スコア計算・ターン順制御
│       ├── theme.ts              # お題カード管理
│       ├── transactionUtils.ts   # トランザクションユーティリティ
│       ├── types.ts              # ゲーム内型定義
│       └── utils.ts              # 共通ユーティリティ関数
├── screens/                  # 各画面のコンポーネント
├── hooks/                    # カスタムReact Hooks
│   ├── usePresence.ts        # プレゼンス管理
│   └── useWakeLock.ts        # Wake Lock管理
├── App.tsx                   # メインアプリケーション
└── main.tsx                  # エントリーポイント
```

### モジュール設計

**ゲームロジックとUI層の分離**: `src/game/` ディレクトリにビジネスロジックを集約し、`src/components/` にUI層を配置することで、保守性と拡張性を向上させています。

**1ファイル1ロールパターン**: 各ロールは2つの独立したファイルとして管理されています:
- `roles/` - ロールの基本定義（名前、説明、初期値等）
- `abilities/` - ロールの能力実装（SKILL/ULT/PASSIVE）

新しいロールの追加は以下の手順で行います:
1. `roles/newrole.ts` でロール定義を作成
2. `abilities/newrole.ts` でハンドラー関数を実装
3. 各ファイルの `index.ts` でエクスポート

**能力ハンドラーパターン**: 全てのロール能力は統一されたインターフェース（`AbilityHandler`, `PassiveHandler`）を実装し、レジストリから取得して実行されます。これにより、メインロジックを変更せずに新しいロールを追加できます。

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
