// src/screens/MenuScreen.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

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
  const navigate = useNavigate();
  const [showExitModal, setShowExitModal] = useState(false);

  // 本来はここもサーバーから取得したRoomIDになります
  const roomId = "8891"; 

  // タイトルへ戻る（ルーム解散）処理
  const handleExitConfirm = () => {
    // ここにFirebaseのルーム削除処理などが将来的には入ります
    navigate('/');
  };

  return (
    <div className="w-full min-h-[80vh] flex flex-col items-center relative">
      
      {/* ▼▼▼ 修正: 位置調整 (余白を広げて内側に寄せました) ▼▼▼ */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        // top-0 right-0 -> top-6 right-6 md:top-10 md:right-12 に変更し、端からの距離を確保
        className="absolute top-6 right-6 md:top-10 md:right-12 z-20"
      >
        <div className="flex flex-col items-end">
          <p className="text-[10px] font-bold text-cyan-400 tracking-widest opacity-70">ROOM ID</p>
          <p className="text-3xl font-black text-white font-mono tracking-widest drop-shadow-[0_0_10px_cyan]">
            {roomId}
          </p>
        </div>
      </motion.div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="w-full max-w-5xl flex flex-col gap-8 items-center mt-12"
      >
        {/* ヘッダーテキスト */}
        <motion.div variants={itemVariants} className="text-center mb-4">
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-widest uppercase drop-shadow-lg">
            Select Game Mode
          </h2>
          <div className="h-[2px] w-24 bg-cyan-500 mx-auto mt-4 shadow-[0_0_10px_cyan]"></div>
          <p className="text-xs text-gray-400 font-mono mt-4 tracking-widest">
            現在ルーム作成中… 遊ぶモードを選択してください
          </p>
        </motion.div>

        {/* モード選択カードリスト */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl px-4">

          {/* 1. みんなで遊ぶ (Game Mode) */}
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
            to="/free"
            title="FREE MODE"
            subtitle="単発お題ガチャ"
            description="スコアを気にせず、ランダムにお題を出して遊びたい時はこちら。"
            color="blue"
            delay={0.1}
            icon={(
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            )}
          />

        </div>

        {/* 戻るボタン（警告モーダルを出す） */}
        <motion.div variants={itemVariants} className="mt-8">
          <button 
            onClick={() => setShowExitModal(true)}
            className="btn btn-ghost text-white/50 hover:text-white transition-colors tracking-widest text-xs"
          >
            ← BACK TO ENTRANCE (DISBAND ROOM)
          </button>
        </motion.div>
      </motion.div>


      {/* 解散警告モーダル */}
      <AnimatePresence>
        {showExitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setShowExitModal(false)}
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1"
            >
              <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">
                  🔚
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest mb-2">DISBAND ROOM?</h2>
                  <p className="text-gray-400 text-sm font-mono">
                    ルームを解散してタイトル画面に戻りますか？<br/>
                    <span className="text-red-400">現在接続中のメンバーも切断されます。</span>
                  </p>
                </div>
                
                <div className="flex w-full gap-3 mt-2">
                  <button 
                    onClick={() => setShowExitModal(false)}
                    className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={handleExitConfirm}
                    className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]"
                  >
                    YES, DISBAND
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

// --- サブコンポーネント: MenuCard ---
const MenuCard = ({ to, title, subtitle, description, icon, color, delay = 0 }: any) => {
  const navigate = useNavigate();

  const colorClasses: Record<string, string> = {
    cyan: "group-hover:border-cyan-500/50 group-hover:shadow-[0_0_50px_rgba(6,182,212,0.2)]",
    blue: "group-hover:border-blue-500/50 group-hover:shadow-[0_0_50px_rgba(59,130,246,0.2)]",
  };
   
  const iconColors: Record<string, string> = {
    cyan: "text-cyan-400 group-hover:text-cyan-300",
    blue: "text-blue-400 group-hover:text-blue-300",
  };

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -5 }} className="h-full">
      <div 
        onClick={() => navigate(to)}
        className={`block h-full relative group perspective-1000 cursor-pointer`}
      >
        <div className={`
          relative h-full overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 
          transition-all duration-500 p-6 flex flex-col items-center text-center gap-4
          ${colorClasses[color]}
        `}>
          <div className={`absolute inset-0 bg-gradient-to-br from-${color}-500/0 via-${color}-500/0 to-${color}-500/0 group-hover:from-${color}-500/10 group-hover:to-${color}-500/5 transition-all duration-500`}></div>
           
          <div className={`p-4 rounded-full bg-black/30 border border-white/5 shadow-inner transition-colors duration-300 ${iconColors[color]}`}>
            {icon}
          </div>

          <div className="relative z-10">
            <h3 className="text-2xl font-black italic tracking-wider text-white mb-1">{title}</h3>
            <p className={`text-xs font-bold uppercase tracking-widest mb-3 opacity-70 ${iconColors[color]}`}>{subtitle}</p>
            <p className="text-sm text-gray-400 leading-relaxed group-hover:text-gray-200 transition-colors">
              {description}
            </p>
          </div>

          <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-${color}-500 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500`}></div>
        </div>
      </div>
    </motion.div>
  );
};