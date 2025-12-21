import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- Firebase ---
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

// --- Components & Hooks ---
import { Toast, useToast } from '../components/Toast';
import { usePresence } from '../hooks/usePresence';
import { useWakeLock } from '../hooks/useWakeLock';

// --- Definitions ---

// イベントの種類定義
const EVENT_TYPES = {
  DOUBLE: 'DOUBLE_STRIKE',   // 得点2倍
  PENALTY: 'ABYSS_TRAP',     // 失敗時 -1000
  CHALLENGE: 'DEAD_OR_ALIVE',// +3000 or -3000
  REVOLUTION: 'KING_SLAYER', // 1位から-1000
  TARGET: 'BOUNTY_HUNT',     // 指定した人から1000奪う
  BLESSING: 'ANGEL_WHISPER', // 成功したら他全員に+500
};

// イベントデータ（表示用・設定用）
const GAME_EVENTS = {
  [EVENT_TYPES.DOUBLE]: {
    name: "DOUBLE STRIKE",
    desc: "SUCCESS SCORE x2",
    color: "#fbbf24", // Amber
    shadow: "rgba(251, 191, 36, 0.5)",
    bgGradient: "from-yellow-600/20 to-amber-500/20"
  },
  [EVENT_TYPES.PENALTY]: {
    name: "ABYSS TRAP",
    desc: "FAILURE PENALTY -1000",
    color: "#a855f7", // Purple
    shadow: "rgba(168, 85, 247, 0.5)",
    bgGradient: "from-purple-900/40 to-black/60"
  },
  [EVENT_TYPES.CHALLENGE]: {
    name: "DEAD OR ALIVE",
    desc: "SUCCESS +3000 / FAIL -3000",
    color: "#ef4444", // Red
    shadow: "rgba(239, 68, 68, 0.6)",
    bgGradient: "from-red-900/40 to-orange-900/40"
  },
  [EVENT_TYPES.REVOLUTION]: {
    name: "KING SLAYER",
    desc: "SUCCESS: TOP PLAYER -1000",
    color: "#3b82f6", // Blue
    shadow: "rgba(59, 130, 246, 0.5)",
    bgGradient: "from-blue-900/40 to-cyan-900/40"
  },
  [EVENT_TYPES.TARGET]: {
    name: "BOUNTY HUNT",
    desc: "SUCCESS: STEAL 1000 PTS",
    color: "#10b981", // Emerald
    shadow: "rgba(16, 185, 129, 0.5)",
    bgGradient: "from-emerald-900/40 to-green-900/40"
  },
  [EVENT_TYPES.BLESSING]: {
    name: "ANGEL WHISPER",
    desc: "SUCCESS: OTHERS +500",
    color: "#f472b6", // Pink
    shadow: "rgba(244, 114, 182, 0.5)",
    bgGradient: "from-pink-500/20 to-rose-500/20"
  }
};

// シャッフル関数
const shuffleArray = (array: any[]) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// ランダムイベント抽選関数 (30%の確率で発生)
const rollEvent = () => {
  if (Math.random() > 0.3) return null; 
  const keys = Object.keys(GAME_EVENTS);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return randomKey;
};

export const GamePlayScreen = () => {
  const navigate = useNavigate();
  const { messages, addToast, removeToast } = useToast();
  useWakeLock();

  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [isHost, setIsHost] = useState(false);
   
  const [members, setMembers] = useState<any[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [turnCount, setTurnCount] = useState(1);
  const [showFinishModal, setShowFinishModal] = useState(false);
  
  // ターゲットイベント用の選択モーダル表示
  const [showTargetSelector, setShowTargetSelector] = useState(false);
   
  // 部屋情報全体を保持
  const [roomData, setRoomData] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('shibari_user_info');
    if (!storedUser) {
      navigate('/');
      return;
    }
    const userInfo = JSON.parse(storedUser);
    setRoomId(userInfo.roomId);
    setUserId(userInfo.userId);
    setIsHost(userInfo.isHost);

    const roomRef = doc(db, "rooms", userInfo.roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData(data);
        setMembers(data.members || []);
        
        if (data.currentTurnIndex !== undefined) {
             const maxIndex = (data.members?.length || 1) - 1;
             setCurrentTurnIndex(Math.min(data.currentTurnIndex, maxIndex));
        }
        
        if (data.turnCount !== undefined) setTurnCount(data.turnCount);

        if (data.status === 'finished') {
          navigate('/result');
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const { offlineUsers, isHostMissing } = usePresence(roomId, userId, roomData, addToast);

  // --- ターン進行 & スコア計算ロジック ---

  // ターゲットイベントのトリガー（UIボタンから呼ばれる）
  const triggerNextTurn = (result: 'CLEAR' | 'FAILED') => {
    // 現在のプレイヤー取得
    const safeIndex = Math.min(currentTurnIndex, members.length - 1);
    const currentPlayer = members[safeIndex];
    
    // ターゲットイベントかつ成功時は、まずターゲット選択モーダルを開く
    if (result === 'CLEAR' && currentPlayer?.event === EVENT_TYPES.TARGET) {
      setShowTargetSelector(true);
      return;
    }

    // それ以外は通常処理
    handleNextTurn(result);
  };

  // ターゲット選択後の処理
  const handleTargetSelected = (targetUserId: string) => {
    setShowTargetSelector(false);
    handleNextTurn('CLEAR', targetUserId);
  };

  const handleNextTurn = async (result: 'CLEAR' | 'FAILED', targetId?: string) => {
    if (members.length === 0) return;
    
    const newMembers = [...members];
    const safeIndex = Math.min(currentTurnIndex, newMembers.length - 1);
    const currentPlayer = newMembers[safeIndex];

    if (!currentPlayer) return;

    const currentScore = currentPlayer.score || 0;
    const eventType = currentPlayer.event; // 現在設定されているイベント

    // --- 1. スコア計算処理 (イベント分岐) ---
    if (result === 'CLEAR') {
      let addScore = 1000; // 基本点

      if (eventType === EVENT_TYPES.DOUBLE) {
        addScore = 2000;
      } else if (eventType === EVENT_TYPES.CHALLENGE) {
        addScore = 3000;
      } else if (eventType === EVENT_TYPES.REVOLUTION) {
        addScore = 1000; // 自分は通常通り
        // 下剋上: 自分以外の最高得点者を探して-1000
        let topScore = -99999;
        let topMemberIndex = -1;
        newMembers.forEach((m, idx) => {
          if (m.id !== currentPlayer.id && (m.score || 0) > topScore) {
            topScore = m.score || 0;
            topMemberIndex = idx;
          }
        });
        if (topMemberIndex !== -1) {
          newMembers[topMemberIndex].score = (newMembers[topMemberIndex].score || 0) - 1000;
        }
      } else if (eventType === EVENT_TYPES.TARGET && targetId) {
        // ターゲットから奪う
        addScore = 1000;
        const targetIndex = newMembers.findIndex(m => m.id === targetId);
        if (targetIndex !== -1) {
          newMembers[targetIndex].score = (newMembers[targetIndex].score || 0) - 1000;
        }
      } else if (eventType === EVENT_TYPES.BLESSING) {
        addScore = 1000; // 自分は通常
        // 自分以外全員+500
        newMembers.forEach(m => {
          if (m.id !== currentPlayer.id) {
            m.score = (m.score || 0) + 500;
          }
        });
      }

      currentPlayer.score = currentScore + addScore;

    } else {
      // FAILEDの場合
      if (eventType === EVENT_TYPES.PENALTY) {
        currentPlayer.score = currentScore - 1000;
      } else if (eventType === EVENT_TYPES.CHALLENGE) {
        currentPlayer.score = currentScore - 3000;
      }
      // 他のイベントは失敗時ペナルティなし
    }

    // イベント使用終了：現在のプレイヤーのイベント情報をクリア
    delete currentPlayer.event;


    // --- 2. 次のお題とイベント抽選 ---
    let currentDeck = roomData.deck ? [...roomData.deck] : [];
    const currentPool = roomData.themePool || [];

    if (currentPool.length === 0) {
      addToast("エラー：お題データがありません");
      return;
    }
    if (currentDeck.length === 0) {
      currentDeck = shuffleArray(currentPool);
    }
    const nextChallenge = currentDeck.pop();
    currentPlayer.challenge = nextChallenge;

    // --- 3. 次のプレイヤーへ移動 & 次の人のイベント抽選 ---
    let nextIndex = (safeIndex + 1) % newMembers.length;
    
    // 次のプレイヤーにランダムイベントを付与するか判定
    const nextEvent = rollEvent();
    if (nextEvent) {
      newMembers[nextIndex].event = nextEvent;
    } else {
      delete newMembers[nextIndex].event; // イベントなしなら消す
    }

    try {
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, {
        members: newMembers,
        currentTurnIndex: nextIndex,
        turnCount: turnCount + 1,
        deck: currentDeck,          
      });
    } catch (error) {
      console.error("Error updating turn:", error);
      addToast("通信エラーが発生しました");
    }
  };

  const confirmFinish = async () => {
    try {
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, { status: 'finished' });
    } catch (error) {
      console.error("Error finishing game:", error);
    }
  };

  const handleForceLeave = async () => {
    try {
      const roomRef = doc(db, "rooms", roomId);
      if (isHost) {
        await deleteDoc(roomRef);
      } else {
        const newMembers = members.filter(m => m.id !== userId);
        await updateDoc(roomRef, { members: newMembers });
      }
      localStorage.removeItem('shibari_user_info');
      navigate('/');
    } catch (error) {
      console.error("Leave error:", error);
      navigate('/');
    }
  };

  if (members.length === 0) return <div className="h-screen w-full flex items-center justify-center text-white">LOADING...</div>;

  const safeCurrentIndex = Math.min(currentTurnIndex, members.length - 1);
  const currentPlayer = members[safeCurrentIndex] || members[0];
  const currentChallenge = currentPlayer.challenge || { title: "お題準備中...", criteria: "..." };
  const currentEventKey = currentPlayer.event; // 現在のイベントキー
  const currentEventData = currentEventKey ? GAME_EVENTS[currentEventKey] : null; // イベント詳細データ
   
  const isMyTurn = currentPlayer.id === userId;
  const canControl = isHost || isMyTurn;

  return (
    <div className="w-full h-[100dvh] text-white overflow-hidden flex flex-col md:flex-row relative">
      <Toast messages={messages} onRemove={removeToast} />

      {/* LEFT AREA */}
      <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
        {/* Header */}
        <div className="flex-none h-20 flex justify-between items-center px-6 md:px-8 border-b border-white/10 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex-none w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-2xl shadow-[0_0_15px_cyan] border border-white/20">🎤</div>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span><p className="text-[10px] text-cyan-400 font-mono tracking-widest font-bold">NOW SINGING</p></div>
              <motion.p key={currentPlayer.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-white font-black leading-none truncate drop-shadow-md text-[clamp(1.5rem,3vw,3rem)]">{currentPlayer.name}</motion.p>
            </div>
          </div>
          <div className="text-right flex-none pl-4">
              <div className="mb-1">
                 <p className="text-[8px] text-gray-400 font-mono tracking-widest leading-none text-right">CURRENT SCORE</p>
                 <motion.p key={currentPlayer.score || 0} initial={{ scale: 1.2, color: '#22d3ee' }} animate={{ scale: 1, color: '#ffffff' }} className="text-xl font-black font-mono leading-none text-right">{(currentPlayer.score || 0).toLocaleString()}</motion.p>
              </div>
            <div className="bg-white/5 px-3 py-1 rounded-lg border border-white/10 inline-block">
              <p className="text-[8px] text-gray-400 font-mono tracking-widest leading-none mb-0.5 text-center">TURN</p>
              <p className="text-lg font-bold text-white/90 font-mono leading-none">#{String(turnCount).padStart(2, '0')}</p>
            </div>
          </div>
        </div>

        {/* Main Stage */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 relative w-full">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-[80%] h-[80%] border border-cyan-500/20 rounded-full animate-[spin_20s_linear_infinite] max-h-[500px] max-w-[500px]"></div>
          </div>
          
          <AnimatePresence mode="wait">
            <motion.div key={currentChallenge.title + turnCount} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", duration: 0.5 }} className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-2 md:gap-6 text-center">
              
              {/* --- EVENT DISPLAY ANIMATION --- */}
              {currentEventData && (
                <motion.div 
                    initial={{ y: -50, opacity: 0, scale: 1.5 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className={`w-full mb-2 flex flex-col items-center justify-center relative`}
                >
                    <div className={`absolute inset-0 blur-xl opacity-40 bg-gradient-to-r ${currentEventData.bgGradient} rounded-full`}></div>
                    <motion.div 
                        animate={{ scale: [1, 1.05, 1] }} 
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="relative z-10 px-8 py-2 border-y-2 border-white/20 bg-black/60 backdrop-blur-md"
                        style={{ boxShadow: `0 0 30px ${currentEventData.shadow}, inset 0 0 20px ${currentEventData.shadow}` }}
                    >
                        <p className="text-[10px] md:text-xs font-mono tracking-[0.5em] text-white font-bold mb-1">WARNING: SPECIAL EVENT</p>
                        <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter" style={{ color: currentEventData.color, textShadow: `0 0 20px ${currentEventData.shadow}` }}>
                            {currentEventData.name}
                        </h2>
                        <p className="text-xs md:text-sm font-bold text-white mt-1 tracking-widest bg-white/10 inline-block px-3 py-0.5 rounded uppercase">
                            {currentEventData.desc}
                        </p>
                    </motion.div>
                </motion.div>
              )}
              {/* ------------------------------- */}

              <div className="w-full flex flex-col items-center mt-4">
                <div className="inline-block px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono tracking-[0.3em] text-[10px] md:text-xs mb-2 md:mb-4 font-bold">CURRENT MISSION</div>
                <h1 className="font-black text-white drop-shadow-[0_0_30px_rgba(0,255,255,0.4)] leading-tight w-full whitespace-nowrap text-[clamp(20px,4vw,5rem)]">{currentChallenge.title}</h1>
              </div>
              <div className="w-full flex justify-center mt-2 md:mt-4">
                <div className="w-auto max-w-full bg-gradient-to-br from-red-900/40 to-black/40 border-2 border-red-500/50 px-6 py-4 md:px-10 md:py-6 rounded-2xl backdrop-blur-md shadow-[0_0_40px_rgba(220,38,38,0.2)] flex flex-col items-center gap-1">
                  <p className="text-red-300 font-mono tracking-[0.3em] text-[10px] md:text-xs uppercase opacity-90 font-bold whitespace-nowrap">Clear Condition</p>
                  <p className="font-black text-white tracking-widest whitespace-nowrap text-[clamp(1.2rem,3vw,3rem)]">{currentChallenge.criteria}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="flex-none px-4 pt-4 pb-8 md:px-6 md:pt-6 md:pb-12 bg-gradient-to-t from-black/80 to-transparent z-20 w-full">
          <div className="flex gap-3 md:gap-6 w-full max-w-5xl mx-auto h-20 md:h-24">
            {canControl ? (
              <>
                <button onClick={() => triggerNextTurn('FAILED')} className="flex-1 rounded-xl md:rounded-2xl bg-[#1e293b]/80 backdrop-blur-sm border-2 border-[#334155] text-gray-400 hover:bg-[#334155] hover:text-white font-black text-xl md:text-2xl tracking-widest active:scale-95 transition-all flex flex-col items-center justify-center gap-1 group">FAILED<span className="text-[10px] font-normal opacity-50 group-hover:opacity-100">失敗...</span></button>
                <button onClick={() => triggerNextTurn('CLEAR')} className="flex-[2] rounded-xl md:rounded-2xl bg-gradient-to-r from-cyan-600/90 to-blue-600/90 backdrop-blur-sm border-0 text-white font-black text-2xl md:text-4xl italic tracking-widest shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_50px_rgba(6,182,212,0.6)] hover:scale-[1.02] active:scale-95 transition-all relative overflow-hidden group flex flex-col items-center justify-center gap-1"><span className="relative z-10">CLEAR!!</span><span className="relative z-10 text-[10px] md:text-sm font-bold text-cyan-100 tracking-normal opacity-80">成功</span><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 ease-in-out"></div></button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/40 border border-white/10 rounded-xl md:rounded-2xl backdrop-blur-md">
                <p className="text-gray-400 font-mono tracking-widest animate-pulse">WAITING FOR {currentPlayer.name.toUpperCase()}'S RESULT...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT AREA (Queue Sidebar) */}
      <div className="hidden md:flex w-[300px] lg:w-[360px] flex-none bg-black/60 backdrop-blur-xl border-l border-white/10 flex-col relative z-20 shadow-2xl">
        <div className="p-4 md:p-6 border-b border-white/10 bg-white/5 flex-none">
          <h3 className="text-xs md:text-sm font-bold text-white tracking-widest flex items-center gap-2"><span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>RESERVATION LIST</h3>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">TOTAL: {members.length} MEMBERS</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
          {(() => {
            // 現在のプレイヤーを先頭にするように配列を並び替え
            const reorderedMembers = [
              ...members.slice(safeCurrentIndex),
              ...members.slice(0, safeCurrentIndex)
            ];

            return reorderedMembers.map((member, displayIndex) => {
              // 0番目が必ず現在の人
              const isCurrent = displayIndex === 0;
              const challenge = member.challenge || { title: "...", criteria: "..." };
              const isOffline = offlineUsers.has(member.id);
              const evt = member.event ? GAME_EVENTS[member.event] : null;
              
              return (
                <motion.div 
                    layout 
                    key={member.id} 
                    initial={{ x: 20, opacity: 0 }} 
                    animate={{ x: 0, opacity: isOffline ? 0.5 : 1 }} 
                    transition={{ duration: 0.3 }}
                    className={`p-3 rounded-xl relative overflow-hidden group transition-all shrink-0 border ${isCurrent ? 'bg-cyan-900/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-black/40 border-white/10 hover:border-white/30'} ${isOffline ? 'grayscale' : ''}`}
                >
                    <div className="absolute top-0 right-0 bg-white/10 px-2 py-0.5 rounded-bl-lg text-[9px] font-mono text-gray-400">{isCurrent ? "NOW" : "NEXT"}</div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center text-lg relative">
                          {member.avatar}
                          {evt && !isCurrent && <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-500 border border-black animate-pulse shadow-[0_0_10px_yellow]"></div>}
                      </div>
                      <span className={`font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-gray-400'}`}>{member.name}</span>
                      {isOffline && <span className="ml-auto text-[9px] bg-red-900 text-red-300 px-1 rounded">OFFLINE</span>}
                    </div>
                    <div className="bg-black/40 rounded-lg p-2 border-l-2 border-cyan-500/50">
                        <p className={`text-[10px] font-bold leading-tight mb-1 ${isCurrent ? 'text-cyan-200' : 'text-gray-300'}`}>{challenge.title}</p>
                        <div className="flex items-center gap-1 opacity-70"><span className="w-1 h-1 rounded-full bg-red-400"></span><p className="text-[9px] text-gray-400 font-mono leading-tight">{challenge.criteria}</p></div>
                    </div>
                </motion.div>
              );
            });
          })()}
          <div className="h-4"></div>
        </div>
        {isHost && (
          <div className="p-4 pb-8 md:pb-10 border-t border-white/10 bg-black/40 flex-none">
            <button onClick={() => setShowFinishModal(true)} className="w-full py-3 md:py-4 rounded-xl border-2 border-red-500/30 text-red-400 font-bold tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2 group text-sm">GAME FINISH</button>
          </div>
        )}
      </div>

      {/* モバイル用リスト */}
      <div className="md:hidden w-full bg-black/60 backdrop-blur-md border-t border-white/10 p-4 pb-8 overflow-x-auto whitespace-nowrap flex gap-3 flex-none h-32 items-center">
         {isHost && <div className="inline-block align-top h-full"><button onClick={() => setShowFinishModal(true)} className="h-full px-4 rounded-lg border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-900/50 flex items-center">FINISH</button></div>}
         {members.map((member, index) => {
           const safeNextIndex = (safeCurrentIndex + 1) % members.length;
           const isNext = index === safeNextIndex;
           
           if (!isNext && index !== safeCurrentIndex) return null; 
           if (index === safeCurrentIndex) return null;
           const isOffline = offlineUsers.has(member.id);
           const evt = member.event ? GAME_EVENTS[member.event] : null;

           return (
             <div key={member.id} className={`inline-block w-48 bg-black/40 border ${evt ? 'border-yellow-500/50' : 'border-white/10'} rounded-lg p-3 flex-none h-full overflow-hidden ${isOffline ? 'opacity-50' : ''}`}>
               <div className="text-[9px] text-gray-500 mb-1 flex justify-between">
                   <span>NEXT PLAYER</span>
                   {evt && <span className="text-yellow-400 animate-pulse font-bold">★EVENT!</span>}
                   {isOffline && <span className="text-red-400">OFFLINE</span>}
               </div>
               <div className="font-bold text-xs text-white mb-2 truncate">{member.name}</div>
               <div className="text-[10px] text-cyan-400 whitespace-normal line-clamp-1 leading-tight font-bold mb-1">{member.challenge?.title || "..."}</div>
               <div className="text-[9px] text-gray-400 whitespace-normal line-clamp-1 leading-tight font-mono">{member.challenge?.criteria || "..."}</div>
             </div>
           );
         })}
      </div>

      <AnimatePresence>
        {showFinishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowFinishModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1">
              <div className="bg-black/40 rounded-xl p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">🏁</div>
                <div><h2 className="text-2xl font-black text-white tracking-widest mb-2">FINISH GAME?</h2><p className="text-gray-400 text-sm font-mono">ゲームを終了して結果発表へ移動しますか？</p></div>
                <div className="flex w-full gap-3 mt-2">
                  <button onClick={() => setShowFinishModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors">CANCEL</button>
                  <button onClick={confirmFinish} className="flex-1 py-4 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]">YES, FINISH</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- TARGET SELECTION MODAL (BOUNTY HUNT) --- */}
      <AnimatePresence>
        {showTargetSelector && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-emerald-900/80 backdrop-blur-md" />
                 <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-lg bg-black border border-emerald-500 rounded-2xl p-6 shadow-[0_0_50px_rgba(16,185,129,0.4)] flex flex-col gap-4">
                     <h2 className="text-2xl font-black text-emerald-400 text-center tracking-widest italic">SELECT TARGET</h2>
                     <p className="text-center text-gray-300 text-xs font-mono">誰から1000ポイント奪いますか？</p>
                     <div className="grid grid-cols-2 gap-3 mt-2 max-h-[60vh] overflow-y-auto">
                         {members.filter(m => m.id !== currentPlayer.id).map(m => (
                             <button key={m.id} onClick={() => handleTargetSelected(m.id)} className="p-4 rounded-xl bg-gray-900 border border-white/10 hover:bg-emerald-900/50 hover:border-emerald-500 transition-all flex flex-col items-center gap-2">
                                 <div className="text-2xl">{m.avatar}</div>
                                 <div className="font-bold text-white text-sm">{m.name}</div>
                                 <div className="text-emerald-300 font-mono text-xs">{(m.score||0).toLocaleString()} pt</div>
                             </button>
                         ))}
                     </div>
                 </motion.div>
            </div>
        )}
      </AnimatePresence>
      {/* ------------------------------------------- */}

      {/* ホスト不在時のポップアップ */}
      <AnimatePresence>
        {!isHost && isHostMissing && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/95 backdrop-blur-xl" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-[#0f172a] border border-orange-500/50 rounded-2xl shadow-[0_0_50px_rgba(249,115,22,0.3)] p-1 z-50">
               <div className="bg-gradient-to-b from-orange-900/40 to-black p-8 flex flex-col items-center text-center gap-6">
                  <div className="text-4xl animate-bounce">📡</div>
                  <div><h2 className="text-xl font-black text-orange-400 tracking-widest">WAITING FOR HOST</h2><p className="text-gray-400 text-sm font-mono mt-2 leading-relaxed">ホストとの接続が確認できません。<br/>再接続を待機しています...</p></div>
                  <div className="w-full mt-2"><button onClick={handleForceLeave} className="w-full py-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold tracking-widest text-xs">LEAVE ROOM</button></div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};