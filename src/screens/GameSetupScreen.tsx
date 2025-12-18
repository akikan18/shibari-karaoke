// src/screens/GameSetupScreen.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';

// --- モックデータ ---
const MOCK_MEMBERS = [
  { id: '1', name: 'YAMADA', avatar: '🎤', isReady: true },
  { id: '2', name: 'SUZUKI', avatar: '🎸', isReady: true },
  { id: '3', name: 'TANAKA', avatar: '🎹', isReady: false },
  { id: '4', name: 'SATO', avatar: '🥁', isReady: true },
];

export const GameSetupScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const gameMode = location.state?.mode || 'standard';
  const [members, setMembers] = useState(MOCK_MEMBERS);
  const [isHost, setIsHost] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('shibari_user_info');
    if (stored) {
      const parsed = JSON.parse(stored);
      setIsHost(parsed.isHost);
    }
  }, []);

  const handleStart = () => {
    console.log("Start button clicked, mode:", gameMode);
    if (gameMode === 'free') {
      navigate('/free');
    } else {
      navigate('/game-play');
    }
  };

  const handleLeaveConfirm = () => {
    navigate('/');
  };

  const handleChangeMode = () => {
    navigate('/menu');
  };

  return (
    // Layoutの背景が見えるようにtransparent指定
    <div className="w-full h-screen flex flex-col items-center relative overflow-hidden">
      
      {/* 背景エフェクト: 少し薄くしてLayoutと馴染ませる */}
      <div className="absolute inset-0 pointer-events-none transition-colors duration-1000">
        <div className={`absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] blur-[120px] rounded-full mix-blend-screen opacity-40 animate-pulse ${gameMode === 'free' ? 'bg-blue-900' : 'bg-cyan-900'}`}></div>
      </div>

      <div className="w-full max-w-6xl flex flex-col h-full px-4 py-8 md:py-12 relative z-10">
        
        {/* ヘッダーエリア */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
          <div className="flex-1">
            <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-cyan-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              LOBBY
            </h1>
            
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span className="px-3 py-1 rounded bg-white/10 border border-white/20 text-xs font-mono tracking-widest text-cyan-300">
                ID: 8891
              </span>

              {/* モード表示 */}
              <div className={`
                px-4 py-1.5 rounded border text-xs font-bold tracking-widest flex items-center gap-3 transition-colors
                ${gameMode === 'free' 
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                  : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]'}
              `}>
                {gameMode === 'free' ? '🧪 FREE MODE' : '👥 GAME MODE'}
                
                {isHost && (
                  <button 
                    onClick={handleChangeMode}
                    className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] text-white transition-all hover:scale-105"
                  >
                    CHANGE MODE 🔄
                  </button>
                )}
              </div>
            </div>
            
            {!isHost && (
              <p className="text-[10px] text-gray-500 font-mono mt-2 tracking-widest animate-pulse">
                HOST IS SELECTING SETTINGS...
              </p>
            )}

          </div>
          
          <button 
            onClick={() => setShowLeaveModal(true)}
            className="px-4 py-2 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold tracking-widest transition-colors"
          >
            LEAVE ROOM
          </button>
        </div>

        {/* メンバーリスト */}
        <div className="flex-1 overflow-y-auto mb-8 pr-2 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {members.map((member, index) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-white/20 flex items-center justify-center text-2xl shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                    {member.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-white tracking-wider">{member.name}</span>
                      {index === 0 && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-500/30">HOST</span>}
                    </div>
                    <p className="text-xs text-white/30 font-mono tracking-widest">READY</p>
                  </div>
                </motion.div>
              ))}
              
              {[...Array(2)].map((_, i) => (
                <div key={`empty-${i}`} className="border border-white/5 rounded-xl p-4 flex items-center gap-4 opacity-30 border-dashed">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-xl animate-pulse">?</div>
                  <p className="text-sm font-mono tracking-widest text-white/50">WAITING...</p>
                </div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* フッターアクション */}
        {/* Z-indexを上げて確実にクリックできるようにする */}
        <div className="h-24 flex items-center justify-center relative z-50">
          {isHost ? (
            <button 
              type="button" // 明示的にtypeを指定
              onClick={handleStart}
              className={`
                group relative px-12 py-4 rounded-full font-black text-xl tracking-[0.2em] transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(6,182,212,0.3)]
                ${gameMode === 'free' 
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50' 
                  : 'bg-white text-black hover:bg-cyan-50 hover:text-cyan-900 shadow-cyan-500/50'}
              `}
            >
              <span className="relative z-10 flex items-center gap-3">
                {gameMode === 'free' ? 'START FREE MODE' : 'START GAME'}
                <span className="text-sm opacity-50">▶</span>
              </span>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2 opacity-50 animate-pulse">
              <p className="text-sm font-bold tracking-widest text-cyan-200">
                WAITING FOR HOST TO START...
              </p>
              <p className={`text-xs ${gameMode === 'free' ? 'text-blue-300' : 'text-cyan-300'}`}>
                CURRENT MODE: {gameMode === 'free' ? 'FREE PLAY' : 'STANDARD'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 離脱確認モーダル */}
      <AnimatePresence>
        {showLeaveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowLeaveModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1">
              <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">👋</div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest mb-2">LEAVE ROOM?</h2>
                  <p className="text-gray-400 text-sm font-mono">
                    ルームから退出してタイトル画面に戻りますか？<br/>
                    {isHost && <span className="text-red-400 block mt-2">※あなたはホストです。退出するとルームは解散されます。</span>}
                  </p>
                </div>
                <div className="flex w-full gap-3 mt-2">
                  <button onClick={() => setShowLeaveModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors">CANCEL</button>
                  <button onClick={handleLeaveConfirm} className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]">{isHost ? 'DISBAND' : 'LEAVE'}</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};