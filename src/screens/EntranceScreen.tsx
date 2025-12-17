// src/screens/EntranceScreen.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// アイコンの選択肢
const AVATARS = ['🎤', '🎸', '🎹', '🥁', '🎷', '🎧', '👑', '🎩', '🐶', '🐱', '🦁', '🐼', '🐯', '👽', '👻', '🤖'];

// アニメーション設定
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.3, delayChildren: 0.5 } },
};
const titleItemVariants = {
  hidden: { y: 50, opacity: 0, filter: 'blur(10px)' },
  show: { y: 0, opacity: 1, filter: 'blur(0px)', transition: { type: "spring", stiffness: 100 } },
};
const lineVariants = {
  hidden: { scaleX: 0, opacity: 0 },
  show: { scaleX: 1, opacity: 0.6, transition: { duration: 0.8, ease: "circOut" } },
};
const cardVariants = {
  hidden: { y: 100, opacity: 0, rotateX: 20 },
  show: { y: 0, opacity: 1, rotateX: 0, transition: { type: "spring", bounce: 0.3, duration: 1, delay: 0.8 } },
};

export const EntranceScreen = () => {
  const navigate = useNavigate();
  
  // モーダル管理
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [targetPath, setTargetPath] = useState<string>(''); 
  const [isHostMode, setIsHostMode] = useState(false); 

  // プロフィール入力管理
  const [userName, setUserName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);

  // ボタンを押した時の処理
  const handleStartClick = (e: React.MouseEvent, path: string, isHost: boolean) => {
    e.preventDefault(); //念のためデフォルト動作をブロック
    setTargetPath(path);
    setIsHostMode(isHost);
    setShowProfileModal(true);
  };

  // プロフィール決定して進む処理
  const handleConfirmProfile = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;

    const userInfo = {
      name: userName,
      avatar: selectedAvatar,
      isHost: isHostMode
    };
    localStorage.setItem('shibari_user_info', JSON.stringify(userInfo));

    navigate(targetPath);
  };

  return (
    // ★重要: Fragment (<>...</>) で囲み、モーダルをアニメーションの外に出す
    <>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col items-center justify-center w-full max-w-4xl relative gap-12 min-h-screen py-10 mx-auto"
      >
        
        {/* 1. タイトルエリア */}
        <div className="text-center relative z-20 flex flex-col items-center">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white drop-shadow-2xl overflow-hidden leading-none">
            <motion.span variants={titleItemVariants} className="block bg-gradient-to-br from-white via-cyan-100 to-cyan-300 bg-clip-text text-transparent py-2">
              SHIBARI
            </motion.span>
            <motion.span variants={titleItemVariants} className="block text-white/90">
              KARAOKE
            </motion.span>
          </h1>
          <div className="flex items-center justify-center gap-4 mt-8 w-full max-w-lg">
            <motion.div variants={lineVariants} className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-cyan-400 origin-right"></motion.div>
            <motion.p variants={titleItemVariants} className="text-sm font-bold tracking-[0.4em] text-cyan-200 uppercase whitespace-nowrap">
              System initializing...
            </motion.p>
            <motion.div variants={lineVariants} className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-cyan-400 origin-left"></motion.div>
          </div>
        </div>

        {/* 2. 操作パネル */}
        <motion.div variants={cardVariants} className="w-full max-w-md relative group perspective-1000 z-10">
          <div className="relative overflow-hidden rounded-3xl bg-white/5 backdrop-blur-3xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-cyan-500/30">
            
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>

            <div className="p-8 flex flex-col gap-6 relative z-10">
              {/* 部屋番号入力 */}
              <div className="form-control group/input">
                <label className="label pl-1">
                  <span className="label-text font-bold text-cyan-200/80 text-xs tracking-widest uppercase">Room ID</span>
                </label>
                <input 
                  type="text" 
                  placeholder="0000" 
                  className="input w-full bg-black/20 border-0 border-b-2 border-white/10 text-3xl font-bold text-center text-white placeholder:text-white/5 focus:outline-none focus:border-cyan-400 focus:bg-black/30 transition-all h-16 rounded-lg font-mono tracking-widest"
                />
              </div>

              {/* GUEST: 参加ボタン */}
              <button 
                type="button" // ★重要: これがないとリロードされる場合がある
                onClick={(e) => handleStartClick(e, '/game-setup', false)}
                className="btn btn-lg h-16 border-0 bg-gradient-to-r from-cyan-700 to-blue-700 text-white text-xl font-bold tracking-widest hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-900/20 hover:-translate-y-1 transition-all rounded-xl relative overflow-hidden group/btn"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  CONNECT <span className="text-cyan-300 group-hover/btn:translate-x-1 transition-transform">→</span>
                </span>
              </button>
              
              {/* HOST: 作成ボタン */}
              <motion.div variants={titleItemVariants} className="text-center pt-2">
                <button 
                  type="button" // ★重要
                  onClick={(e) => handleStartClick(e, '/menu', true)}
                  className="text-sm text-gray-500 hover:text-cyan-300 transition-colors duration-200 tracking-wider uppercase font-bold px-4 py-2 hover:bg-white/5 rounded"
                >
                  // Create New Room (Host)
                </button>
              </motion.div>

            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* --- 3. プロフィール設定モーダル (アニメーションの外に配置) --- */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* 背景 */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setShowProfileModal(false)}
            />

            {/* モーダル本体 */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0f172a] border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-1 z-50"
            >
              <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/50 p-6 md:p-8 rounded-xl flex flex-col gap-6">
                
                <div className="text-center">
                  <h3 className="text-xl font-black text-white tracking-widest uppercase">
                    Who are you?
                  </h3>
                  <p className="text-xs text-gray-400 font-mono mt-1">プロフィールを設定してください</p>
                </div>

                {/* アイコン選択 */}
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-5xl shadow-[0_0_20px_cyan] border-4 border-white/20 relative">
                    {selectedAvatar}
                    <div className="absolute bottom-0 right-0 bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full">EDIT</div>
                  </div>
                  
                  {/* アイコンリスト */}
                  <div className="w-full overflow-x-auto pb-2 flex gap-2 no-scrollbar">
                    {AVATARS.map((avatar) => (
                      <button
                        type="button" // ★重要
                        key={avatar}
                        onClick={() => setSelectedAvatar(avatar)}
                        className={`flex-none w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all border ${selectedAvatar === avatar ? 'bg-white text-black border-cyan-500 scale-110' : 'bg-white/5 text-white border-white/10 hover:bg-white/20'}`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 名前入力 */}
                <div className="form-control w-full">
                  <label className="label">
                    <span className="label-text text-cyan-400 font-bold text-xs tracking-widest">NICKNAME</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="ENTER YOUR NAME" 
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    maxLength={10}
                    autoFocus
                    className="input w-full bg-black/40 border border-white/20 focus:border-cyan-400 text-white font-bold text-center tracking-wider text-lg h-14"
                  />
                </div>

                {/* 決定ボタン */}
                <button 
                  type="button" // ★重要
                  onClick={handleConfirmProfile}
                  disabled={!userName.trim()}
                  className="btn btn-lg w-full bg-gradient-to-r from-cyan-600 to-blue-600 border-0 text-white font-black tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg shadow-cyan-500/20"
                >
                  GO !
                </button>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};