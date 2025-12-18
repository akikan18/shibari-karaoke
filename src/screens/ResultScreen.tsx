// src/screens/ResultScreen.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- アニメーション設定 ---
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 80 } }
};

// --- モックデータ ---
const MEMBERS = ["YAMADA", "SUZUKI", "TANAKA", "SATO", "ITO", "NAKAMURA"];

type ResultData = {
  rank: number;
  name: string;
  cleared: number;
  failed: number;
  score: number;
};

const generateResults = (): ResultData[] => {
  const data = MEMBERS.map(name => {
    const cleared = Math.floor(Math.random() * 5) + 1; 
    const failed = Math.floor(Math.random() * 3);      
    const score = (cleared * 10000) + Math.floor(Math.random() * 5000); 
    return { name, cleared, failed, score, rank: 0 };
  });

  data.sort((a, b) => b.score - a.score);
  return data.map((item, index) => ({ ...item, rank: index + 1 }));
};

const Counter = ({ from, to }: { from: number; to: number }) => {
  const [count, setCount] = useState(from);
  useEffect(() => {
    const duration = 2000;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(from + (to - from) * easeOut));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [from, to]);
  return <>{count.toLocaleString()}</>;
};

const Confetti = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {[...Array(30)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: -20, x: Math.random() * window.innerWidth, rotate: 0 }}
          animate={{ y: window.innerHeight + 100, rotate: 360 }}
          transition={{ 
            duration: Math.random() * 3 + 2, 
            repeat: Infinity, 
            delay: Math.random() * 2,
            ease: "linear"
          }}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            backgroundColor: ['#FFD700', '#FF69B4', '#00FFFF', '#ADFF2F'][i % 4],
            left: 0
          }}
        />
      ))}
    </div>
  );
};

export const ResultScreen = () => {
  const navigate = useNavigate();
  const [results, setResults] = useState<ResultData[]>([]);
  const [showContent, setShowContent] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [showGuestDisbandModal, setShowGuestDisbandModal] = useState(false);
  const [showHostDisbandModal, setShowHostDisbandModal] = useState(false);

  useEffect(() => {
    setResults(generateResults());
    setTimeout(() => setShowContent(true), 500);

    const stored = localStorage.getItem('shibari_user_info');
    if (stored) {
      const parsed = JSON.parse(stored);
      setIsHost(parsed.isHost);
    }
    
    localStorage.removeItem('room_event');
  }, []);

  // --- 通信機能 ---
  useEffect(() => {
    if (isHost) return; 

    const interval = setInterval(() => {
      const event = localStorage.getItem('room_event');
      if (event === 'NEXT_GAME') {
        localStorage.removeItem('room_event'); 
        navigate('/game-setup');
      } else if (event === 'DISBAND') {
        localStorage.removeItem('room_event'); 
        setShowGuestDisbandModal(true); 
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isHost, navigate]);

  const handleHostAction = (action: 'NEXT' | 'DISBAND') => {
    if (action === 'NEXT') {
      localStorage.setItem('room_event', 'NEXT_GAME');
      navigate('/menu');
    } else {
      setShowHostDisbandModal(true);
    }
  };

  const confirmHostDisband = () => {
    localStorage.setItem('room_event', 'DISBAND');
    navigate('/');
  };

  const handleGuestDisbandConfirm = () => {
    navigate('/');
  };

  return (
    // ★修正: bg-[#020617] を削除し、背景を透明にして共通背景を表示
    <div className="min-h-screen w-full text-white flex flex-col items-center relative overflow-hidden">
      
      {showContent && <Confetti />}

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="w-full max-w-7xl px-4 py-8 md:py-16 relative z-10 flex flex-col items-center"
      >
        
        {/* タイトルエリア */}
        <motion.div 
          variants={itemVariants}
          className="text-center mb-16"
        >
          <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-yellow-200 to-yellow-600 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)] pr-4 pb-4">
            RESULTS
          </h1>
          <div className="flex items-center justify-center gap-4">
             <div className="h-[1px] w-12 bg-white/30"></div>
             <p className="text-white/50 font-mono tracking-[0.5em] text-sm">TOTAL SCORE RANKING</p>
             <div className="h-[1px] w-12 bg-white/30"></div>
          </div>
        </motion.div>

        {/* ランキングリスト */}
        <div className="w-full flex flex-col gap-2 mb-20">
          <AnimatePresence>
            {showContent && results.map((result, index) => (
              <motion.div
                key={result.name}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
                className="relative group"
              >
                {/* 背景: シンプルなグラデーションのみ */}
                <div className={`
                  relative flex items-center gap-6 md:gap-12 px-4 py-4 md:px-8 md:py-6 rounded-xl transition-all
                  ${result.rank === 1 
                    ? 'bg-gradient-to-r from-yellow-500/20 via-yellow-500/5 to-transparent' 
                    : 'bg-gradient-to-r from-white/10 via-white/5 to-transparent hover:from-white/20'}
                `}>
                  
                  {/* 1位だけのキラキラエフェクト */}
                  {result.rank === 1 && (
                    <div className="absolute inset-0 bg-yellow-400/10 blur-xl opacity-20 animate-pulse"></div>
                  )}

                  {/* ランク番号 */}
                  <div className={`
                    flex-none w-16 text-center text-4xl md:text-6xl font-black italic
                    ${result.rank === 1 ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(234,179,8,0.8)]' : 
                      result.rank === 2 ? 'text-slate-300' :
                      result.rank === 3 ? 'text-orange-400' :
                      'text-white/20'}
                  `}>
                    {result.rank}
                  </div>

                  {/* プレイヤー情報 */}
                  <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-end gap-2 md:gap-8">
                    <h2 className={`font-black tracking-tighter truncate leading-none ${result.rank === 1 ? 'text-4xl md:text-6xl text-white' : 'text-2xl md:text-4xl text-white/90'}`}>
                      {result.name}
                    </h2>
                    
                    {/* 詳細スタッツ */}
                    <div className="flex gap-4 text-[10px] md:text-xs font-mono opacity-50 pb-1">
                       <span className="bg-cyan-500/10 px-2 py-0.5 rounded text-cyan-300">CLEAR: {result.cleared}</span>
                       <span className="bg-red-500/10 px-2 py-0.5 rounded text-red-300">FAIL: {result.failed}</span>
                    </div>
                  </div>

                  {/* スコア */}
                  <div className="text-right flex-none z-10">
                    <div className={`font-black font-mono tracking-tighter leading-none ${result.rank === 1 ? 'text-3xl md:text-5xl text-yellow-200' : 'text-xl md:text-3xl text-white/80'}`}>
                      <Counter from={0} to={result.score} />
                      <span className="text-sm ml-1 opacity-40">pts</span>
                    </div>
                  </div>

                  {/* 下線 */}
                  <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-white/10 via-white/5 to-transparent"></div>

                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* フッターアクション */}
        <motion.div 
          variants={itemVariants} 
          className="w-full flex justify-center px-4"
        >
          {isHost ? (
            <div className="flex w-full max-w-4xl gap-6 flex-col md:flex-row items-center">
              <button 
                onClick={() => handleHostAction('DISBAND')}
                className="w-full md:w-auto px-8 py-4 text-red-400 hover:text-red-300 font-bold tracking-widest text-sm transition-colors opacity-70 hover:opacity-100"
              >
                DISBAND ROOM
              </button>

              <button 
                onClick={() => handleHostAction('NEXT')}
                className="flex-1 w-full py-5 rounded-full bg-white text-black font-black text-xl tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_rgba(255,255,255,0.5)] hover:scale-105 transition-all"
              >
                NEXT GAME <span className="text-sm font-normal opacity-50 ml-2">→</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 opacity-50">
               <span className="loading loading-dots loading-lg text-white"></span>
               <p className="text-sm font-mono tracking-widest">WAITING FOR HOST...</p>
            </div>
          )}
        </motion.div>

      </motion.div>

      {/* --- GUEST: 解散通知モーダル --- */}
      <AnimatePresence>
        {showGuestDisbandModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1"
            >
              <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl animate-pulse">
                  ⚠️
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest mb-2">ROOM DISBANDED</h2>
                  <p className="text-red-200/70 text-sm font-mono">
                    ホストがルームを解散しました。<br/>
                    タイトル画面に戻ります。
                  </p>
                </div>
                <button 
                  onClick={handleGuestDisbandConfirm}
                  className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest shadow-lg shadow-red-900/50 transition-all"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- HOST: 解散確認モーダル --- */}
      <AnimatePresence>
        {showHostDisbandModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setShowHostDisbandModal(false)}
            ></motion.div>
            
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
                    ルームを解散してトップ画面に戻りますか？<br/>
                    <span className="text-red-400">全員の接続が切断されます。</span>
                  </p>
                </div>
                
                <div className="flex w-full gap-3 mt-2">
                  <button 
                    onClick={() => setShowHostDisbandModal(false)}
                    className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={confirmHostDisband}
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