// src/screens/ResultScreen.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

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
  
  // モーダル管理
  const [showGuestDisbandModal, setShowGuestDisbandModal] = useState(false); // ゲスト用: 解散された通知
  const [showHostDisbandModal, setShowHostDisbandModal] = useState(false);   // ホスト用: 解散確認

  useEffect(() => {
    setResults(generateResults());
    setTimeout(() => setShowContent(true), 500);

    // ユーザー情報からホストかどうか判定
    const stored = localStorage.getItem('shibari_user_info');
    if (stored) {
      const parsed = JSON.parse(stored);
      setIsHost(parsed.isHost);
    }
    
    // イベント初期化
    localStorage.removeItem('room_event');
  }, []);

  // --- 疑似通信機能 (ゲスト用) ---
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


  // --- ホストのアクション ---
  const handleHostAction = (action: 'NEXT' | 'DISBAND') => {
    if (action === 'NEXT') {
      localStorage.setItem('room_event', 'NEXT_GAME');
      navigate('/menu');
    } else {
      // 解散確認モーダルを開く (window.confirm廃止)
      setShowHostDisbandModal(true);
    }
  };

  // ホストが本当に解散を実行する
  const confirmHostDisband = () => {
    localStorage.setItem('room_event', 'DISBAND');
    navigate('/');
  };

  // ゲストが解散通知を受け取ってトップへ戻る
  const handleGuestDisbandConfirm = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center relative overflow-hidden">
      
      {/* 背景装飾 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] bg-purple-900/20 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[20%] w-[60%] h-[60%] bg-blue-900/20 blur-[120px] rounded-full mix-blend-screen"></div>
      </div>

      {showContent && <Confetti />}

      <div className="w-full max-w-5xl px-4 py-8 md:py-12 relative z-10 flex flex-col items-center">
        
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-yellow-200 via-yellow-400 to-orange-500 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)] pr-4 pb-2">
            FINAL RESULTS
          </h1>
          <p className="text-yellow-200/50 font-mono tracking-[0.5em] mt-2 text-sm md:text-base">
            TOTAL SCORE RANKING
          </p>
        </motion.div>

        <div className="w-full flex flex-col gap-4">
          <AnimatePresence>
            {showContent && results.map((result, index) => (
              <motion.div
                key={result.name}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.15, type: "spring", stiffness: 100 }}
                className="relative"
              >
                <div className={`
                  relative overflow-hidden rounded-2xl border p-4 md:p-6 flex items-center gap-4 md:gap-8
                  ${result.rank === 1 ? 'bg-yellow-900/20 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.2)]' : 
                    result.rank === 2 ? 'bg-slate-800/40 border-slate-400/50' :
                    result.rank === 3 ? 'bg-orange-900/20 border-orange-700/50' :
                    'bg-white/5 border-white/10'}
                `}>
                  
                  {result.rank === 1 && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/10 to-transparent animate-[shimmer_2s_infinite]"></div>
                  )}

                  <div className={`
                    flex-none w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center text-2xl md:text-3xl font-black
                    ${result.rank === 1 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-black shadow-lg shadow-yellow-500/50' : 
                      result.rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-black shadow-lg' :
                      result.rank === 3 ? 'bg-gradient-to-br from-orange-300 to-orange-600 text-black shadow-lg' :
                      'bg-white/10 text-white/50 font-mono'}
                  `}>
                    {result.rank === 1 ? '👑' : `#${result.rank}`}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h2 className={`font-black truncate ${result.rank === 1 ? 'text-3xl md:text-5xl text-yellow-100' : 'text-xl md:text-3xl text-white'}`}>
                      {result.name}
                    </h2>
                    <div className="flex gap-4 mt-1 text-xs md:text-sm font-mono opacity-70">
                      <span className="text-cyan-300">CLEARED: {result.cleared}</span>
                      <span className="text-red-300">FAILED: {result.failed}</span>
                    </div>
                  </div>

                  <div className="text-right flex-none">
                    <p className="text-[10px] md:text-xs text-gray-400 font-mono tracking-widest mb-1">TOTAL SCORE</p>
                    <div className={`font-black font-mono tracking-tighter ${result.rank === 1 ? 'text-4xl md:text-6xl text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.8)]' : 'text-2xl md:text-4xl text-white'}`}>
                      <Counter from={0} to={result.score} />
                      <span className="text-sm md:text-lg ml-1 opacity-50">pts</span>
                    </div>
                  </div>

                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* フッターアクション */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="mt-16 w-full flex justify-center px-4"
        >
          {isHost ? (
            // --- HOST VIEW ---
            <div className="flex w-full max-w-3xl gap-4 flex-col md:flex-row">
              <button 
                onClick={() => handleHostAction('DISBAND')}
                className="flex-1 py-4 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-900/20 font-bold tracking-widest transition-all hover:border-red-500/60"
              >
                DISBAND ROOM
                <span className="block text-[10px] font-normal opacity-60 mt-1">ルームを解散する</span>
              </button>

              <button 
                onClick={() => handleHostAction('NEXT')}
                className="flex-[2] py-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black tracking-widest shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.02] border border-white/10"
              >
                NEXT GAME
                <span className="block text-[10px] font-normal opacity-70 mt-1">モード選択へ</span>
              </button>
            </div>
          ) : (
            // --- GUEST VIEW ---
            <div className="flex flex-col items-center gap-2 opacity-60">
               <span className="loading loading-spinner loading-md text-cyan-500"></span>
               <p className="text-sm font-mono tracking-widest text-cyan-300">WAITING FOR HOST...</p>
            </div>
          )}
        </motion.div>

      </div>

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
            {/* 背景 (クリックでキャンセル) */}
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