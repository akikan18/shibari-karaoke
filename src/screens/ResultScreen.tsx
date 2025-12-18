import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- Firebase Imports ---
import { doc, getDoc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore'; // getDocを追加
import { db } from '../firebase';

// --- アニメーション設定 ---
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};
const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 80 } }
};

type MemberData = {
  id: string;
  name: string;
  score: number;
  rank?: number;
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
          transition={{ duration: Math.random() * 3 + 2, repeat: Infinity, delay: Math.random() * 2, ease: "linear" }}
          className="absolute w-3 h-3 rounded-sm"
          style={{ backgroundColor: ['#FFD700', '#FF69B4', '#00FFFF', '#ADFF2F'][i % 4], left: 0 }}
        />
      ))}
    </div>
  );
};

export const ResultScreen = () => {
  const navigate = useNavigate();
  const [results, setResults] = useState<MemberData[]>([]);
  const [showContent, setShowContent] = useState(false);
  
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  
  const [showGuestDisbandModal, setShowGuestDisbandModal] = useState(false);
  const [showHostDisbandModal, setShowHostDisbandModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('shibari_user_info');
    if (!stored) {
      navigate('/');
      return;
    }
    const userInfo = JSON.parse(stored);
    setRoomId(userInfo.roomId);
    setIsHost(userInfo.isHost);

    const roomRef = doc(db, "rooms", userInfo.roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        const members: MemberData[] = (data.members || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          score: m.score || 0
        }));

        members.sort((a, b) => b.score - a.score);
        const rankedMembers = members.map((m, i) => ({ ...m, rank: i + 1 }));
        setResults(rankedMembers);
        setTimeout(() => setShowContent(true), 500);

        // --- 遷移先分岐 ---
        if (data.status === 'waiting') {
           if (userInfo.isHost) {
             navigate('/menu');       // ホストはモード選択へ
           } else {
             navigate('/game-setup'); // ゲストは待機画面へ
           }
        }

      } else {
        setShowGuestDisbandModal(true);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // --- ★修正: スコアとREADY状態をリセット ---
  const handleNextGame = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const roomRef = doc(db, "rooms", roomId);
      
      // 現在のデータを取得してリセット用データを作成
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const currentData = roomSnap.data();
        const resetMembers = (currentData.members || []).map((m: any) => ({
          ...m,
          score: 0, // スコアリセット
          isReady: m.isHost ? true : false, // ホスト以外はREADY解除
          challenge: null // お題もリセット（次回GamePlayで再抽選）
        }));

        await updateDoc(roomRef, {
          status: 'waiting',
          currentTurnIndex: 0,
          turnCount: 1,
          currentChallenge: null,
          members: resetMembers // リセットしたメンバー情報を保存
        });
      }
    } catch (error) {
      console.error("Error resetting game:", error);
      setIsProcessing(false);
    }
  };

  const handleDisband = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const roomRef = doc(db, "rooms", roomId);
      await deleteDoc(roomRef);
      localStorage.removeItem('shibari_user_info');
      navigate('/');
    } catch (error) {
      console.error("Error disbanding:", error);
      navigate('/');
    }
  };

  const handleGuestDisbandConfirm = () => {
    localStorage.removeItem('shibari_user_info');
    navigate('/');
  };

  return (
    <div className="min-h-screen w-full text-white flex flex-col items-center relative overflow-hidden">
      
      {showContent && <Confetti />}

      <motion.div variants={containerVariants} initial="hidden" animate="show" className="w-full max-w-7xl px-4 py-8 md:py-16 relative z-10 flex flex-col items-center">
        
        <motion.div variants={itemVariants} className="text-center mb-10 md:mb-16">
          <h1 className="text-5xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-yellow-200 to-yellow-600 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)] pr-4 pb-4">RESULTS</h1>
          <div className="flex items-center justify-center gap-4">
             <div className="h-[1px] w-8 md:w-12 bg-white/30"></div>
             <p className="text-white/50 font-mono tracking-[0.2em] md:tracking-[0.5em] text-xs md:text-sm">TOTAL SCORE RANKING</p>
             <div className="h-[1px] w-8 md:w-12 bg-white/30"></div>
          </div>
        </motion.div>

        <div className="w-full flex flex-col gap-3 md:gap-4 mb-20 md:mb-32 px-2 md:px-0">
          <AnimatePresence>
            {showContent && results.map((result, index) => (
              <motion.div key={result.id} initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }} className="relative group">
                <div className={`relative flex items-center px-4 py-3 md:px-8 md:py-6 rounded-xl transition-all overflow-hidden ${result.rank === 1 ? 'bg-gradient-to-r from-yellow-500/30 via-yellow-500/10 to-transparent border border-yellow-500/30' : 'bg-gradient-to-r from-white/10 via-white/5 to-transparent border border-white/5 hover:from-white/20'}`}>
                  {result.rank === 1 && <div className="absolute inset-0 bg-yellow-400/10 blur-xl opacity-20 animate-pulse pointer-events-none"></div>}
                  <div className={`flex-none w-10 md:w-16 text-center text-3xl md:text-6xl font-black italic mr-3 md:mr-6 ${result.rank === 1 ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(234,179,8,0.8)]' : result.rank === 2 ? 'text-slate-300' : result.rank === 3 ? 'text-orange-400' : 'text-white/20'}`}>{result.rank}</div>
                  <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-end gap-0.5 md:gap-4 justify-center">
                    <h2 className={`font-black tracking-tighter truncate leading-tight ${result.rank === 1 ? 'text-2xl md:text-5xl text-white' : 'text-xl md:text-3xl text-white/90'}`}>{result.name}</h2>
                  </div>
                  <div className="text-right flex-none pl-2 md:pl-4 z-10">
                    <div className={`font-black font-mono tracking-tighter leading-none flex flex-col md:flex-row md:items-baseline md:justify-end ${result.rank === 1 ? 'text-2xl md:text-5xl text-yellow-200' : 'text-lg md:text-3xl text-white/80'}`}>
                      <span><Counter from={0} to={result.score} /></span>
                      <span className="text-[10px] md:text-sm ml-1 opacity-40 font-normal tracking-widest">PTS</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {isHost ? (
          <motion.div variants={itemVariants} className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black via-black/90 to-transparent z-50 flex justify-center">
            <div className="flex w-full max-w-4xl gap-3 md:gap-6 flex-col-reverse md:flex-row items-center">
              <button onClick={() => setShowHostDisbandModal(true)} className="w-full md:w-auto px-6 py-4 text-red-400 hover:text-red-300 font-bold tracking-widest text-xs md:text-sm transition-colors border border-red-500/20 rounded-xl hover:bg-red-500/10">DISBAND</button>
              <button onClick={handleNextGame} className="flex-1 w-full py-4 md:py-5 rounded-xl bg-white text-black font-black text-lg md:text-xl tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_rgba(255,255,255,0.5)] hover:scale-[1.02] active:scale-95 transition-all">PLAY AGAIN <span className="text-sm font-normal opacity-50 ml-2">→</span></button>
            </div>
          </motion.div>
        ) : (
          <motion.div variants={itemVariants} className="fixed bottom-10 w-full flex justify-center pointer-events-none">
             <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 flex items-center gap-3">
               <span className="loading loading-dots loading-md text-cyan-400"></span>
               <p className="text-xs font-mono tracking-widest text-white/70">WAITING FOR HOST...</p>
             </div>
          </motion.div>
        )}

      </motion.div>

      <AnimatePresence>
        {showGuestDisbandModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-md"></motion.div>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1 z-50">
              <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl animate-pulse">⚠️</div>
                <div><h2 className="text-2xl font-black text-white tracking-widest mb-2">ROOM DISBANDED</h2><p className="text-red-200/70 text-sm font-mono">ホストがルームを解散しました。<br/>タイトル画面に戻ります。</p></div>
                <button onClick={handleGuestDisbandConfirm} className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest shadow-lg shadow-red-900/50 transition-all">OK</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHostDisbandModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowHostDisbandModal(false)}></motion.div>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1 z-50">
              <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">🔚</div>
                <div><h2 className="text-2xl font-black text-white tracking-widest mb-2">DISBAND ROOM?</h2><p className="text-gray-400 text-sm font-mono">ルームを解散してトップ画面に戻りますか？<br/><span className="text-red-400">全員の接続が切断されます。</span></p></div>
                <div className="flex w-full gap-3 mt-2">
                  <button onClick={() => setShowHostDisbandModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors">CANCEL</button>
                  <button onClick={handleDisband} className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]">YES, DISBAND</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};