// src/screens/MenuScreen.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// アニメーション設定
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0, scale: 0.95 },
  show: { y: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 100 } }
};

export const MenuScreen = () => {
  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-5xl flex flex-col gap-8 items-center"
    >
      {/* ヘッダーテキスト */}
      <motion.div variants={itemVariants} className="text-center mb-4">
        <h2 className="text-3xl md:text-4xl font-black text-white tracking-widest uppercase drop-shadow-lg">
          Select Mode
        </h2>
        <div className="h-[2px] w-24 bg-cyan-500 mx-auto mt-4 shadow-[0_0_10px_cyan]"></div>
      </motion.div>

      {/* モード選択カードリスト */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full px-4">

        {/* 1. みんなで遊ぶ (Game Mode) - 一番目立たせる */}
        <MenuCard 
          to="/game-setup"
          title="GAME MODE"
          subtitle="みんなで縛りカラオケ"
          description="参加者を登録して、順番にお題をクリアしていくメインモードです。"
          color="cyan"
          icon={(
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          )}
        />

        {/* 2. 一人で/単発で遊ぶ (Free Mode) */}
        <MenuCard 
          to="/free-mode"
          title="FREE MODE"
          subtitle="単発お題ガチャ"
          description="スコアを気にせず、ランダムにお題を出して遊びたい時はこちら。"
          color="blue"
          delay={0.1}
          icon={(
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
          )}
        />

        {/* 3. お題を作る (Topic Manage) */}
        <MenuCard 
          to="/topic-manage"
          title="EDIT TOPICS"
          subtitle="お題の管理"
          description="新しい縛り内容を追加したり、編集・削除ができます。"
          color="purple"
          delay={0.2}
          icon={(
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          )}
        />

      </div>

      {/* 戻るボタン */}
      <motion.div variants={itemVariants} className="mt-8">
        <Link to="/" className="btn btn-ghost text-white/50 hover:text-white transition-colors tracking-widest text-xs">
          ← BACK TO ENTRANCE
        </Link>
      </motion.div>
    </motion.div>
  );
};

// --- サブコンポーネント: ガラスのカードボタン ---
const MenuCard = ({ to, title, subtitle, description, icon, color, delay = 0 }: any) => {
  // 色の定義
  const colorClasses: Record<string, string> = {
    cyan: "group-hover:border-cyan-500/50 group-hover:shadow-[0_0_50px_rgba(6,182,212,0.2)]",
    blue: "group-hover:border-blue-500/50 group-hover:shadow-[0_0_50px_rgba(59,130,246,0.2)]",
    purple: "group-hover:border-purple-500/50 group-hover:shadow-[0_0_50px_rgba(168,85,247,0.2)]",
  };
  
  const iconColors: Record<string, string> = {
    cyan: "text-cyan-400 group-hover:text-cyan-300",
    blue: "text-blue-400 group-hover:text-blue-300",
    purple: "text-purple-400 group-hover:text-purple-300",
  };

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -5 }} className="h-full">
      <Link to={to} className={`block h-full relative group perspective-1000`}>
        {/* カード本体 */}
        <div className={`
          relative h-full overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 
          transition-all duration-500 p-6 flex flex-col items-center text-center gap-4
          ${colorClasses[color]}
        `}>
          {/* 背景の光（ホバー時） */}
          <div className={`absolute inset-0 bg-gradient-to-br from-${color}-500/0 via-${color}-500/0 to-${color}-500/0 group-hover:from-${color}-500/10 group-hover:to-${color}-500/5 transition-all duration-500`}></div>
          
          {/* アイコン */}
          <div className={`p-4 rounded-full bg-black/30 border border-white/5 shadow-inner transition-colors duration-300 ${iconColors[color]}`}>
            {icon}
          </div>

          {/* テキスト */}
          <div className="relative z-10">
            <h3 className="text-2xl font-black italic tracking-wider text-white mb-1">{title}</h3>
            <p className={`text-xs font-bold uppercase tracking-widest mb-3 opacity-70 ${iconColors[color]}`}>{subtitle}</p>
            <p className="text-sm text-gray-400 leading-relaxed group-hover:text-gray-200 transition-colors">
              {description}
            </p>
          </div>

          {/* 下部の装飾バー */}
          <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-${color}-500 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500`}></div>
        </div>
      </Link>
    </motion.div>
  );
};