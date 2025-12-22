import React, { useState, useEffect, useRef } from 'react';
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
const EVENT_TYPES = {
  DOUBLE: 'DOUBLE_STRIKE',
  PENALTY: 'ABYSS_TRAP',
  CHALLENGE: 'DEAD_OR_ALIVE',
  REVOLUTION: 'KING_SLAYER',
  TARGET: 'BOUNTY_HUNT',
  BOMB: 'BOMB_PASS',
  PHOENIX: 'PHOENIX_RISE',
  DUET: 'DUET_CHANCE',
  JACKPOT: 'JACKPOT_777',
  SELECTION: 'DESTINY_CHOICE',
};

const GAME_EVENTS = {
  [EVENT_TYPES.DOUBLE]: {
    name: "DOUBLE STRIKE",
    desc: "SUCCESS SCORE x2",
    color: "#fbbf24", 
    shadow: "rgba(251, 191, 36, 0.5)",
    bgGradient: "from-yellow-600/20 to-amber-500/20"
  },
  [EVENT_TYPES.PENALTY]: {
    name: "ABYSS TRAP",
    desc: "FAILURE PENALTY -1000",
    color: "#a855f7", 
    shadow: "rgba(168, 85, 247, 0.5)",
    bgGradient: "from-purple-900/40 to-black/60"
  },
  [EVENT_TYPES.CHALLENGE]: {
    name: "DEAD OR ALIVE",
    desc: "SUCCESS +3000 / FAIL -3000",
    color: "#ef4444", 
    shadow: "rgba(239, 68, 68, 0.6)",
    bgGradient: "from-red-900/40 to-orange-900/40"
  },
  [EVENT_TYPES.REVOLUTION]: {
    name: "KING SLAYER",
    desc: "SUCCESS: TOP PLAYER -1000",
    color: "#3b82f6", 
    shadow: "rgba(59, 130, 246, 0.5)",
    bgGradient: "from-blue-900/40 to-cyan-900/40"
  },
  [EVENT_TYPES.TARGET]: {
    name: "BOUNTY HUNT",
    desc: "SUCCESS: STEAL 1000 PTS",
    color: "#10b981", 
    shadow: "rgba(16, 185, 129, 0.5)",
    bgGradient: "from-emerald-900/40 to-green-900/40"
  },
  [EVENT_TYPES.BOMB]: {
    name: "BOMB PASS",
    desc: "NEXT PLAYER -1000",
    color: "#f97316", 
    shadow: "rgba(249, 115, 22, 0.6)",
    bgGradient: "from-orange-700/40 to-red-900/40"
  },
  [EVENT_TYPES.PHOENIX]: {
    name: "PHOENIX RISE",
    desc: "COMEBACK CHANCE x3",
    color: "#e11d48", 
    shadow: "rgba(225, 29, 72, 0.6)",
    bgGradient: "from-rose-900/40 to-pink-900/40"
  },
  [EVENT_TYPES.DUET]: {
    name: "DUET CHANCE",
    desc: "FAIL: YOU -1000", // ★変更: 失敗時のリスクを明記
    color: "#06b6d4", 
    shadow: "rgba(6, 182, 212, 0.6)",
    bgGradient: "from-cyan-500/20 to-teal-500/20"
  },
  [EVENT_TYPES.JACKPOT]: {
    name: "JACKPOT 777",
    desc: "RANGE: -5000 ~ 5000 PTS", // ★変更: 範囲を明記
    color: "#facc15", 
    shadow: "rgba(250, 204, 21, 0.8)",
    bgGradient: "from-yellow-500/40 to-purple-900/40"
  },
  [EVENT_TYPES.SELECTION]: {
    name: "DESTINY CHOICE",
    desc: "CHOOSE YOUR MISSION",
    color: "#f59e0b",
    shadow: "rgba(245, 158, 11, 0.6)",
    bgGradient: "from-orange-500/20 to-yellow-500/20"
  }
};

const shuffleArray = (array: any[]) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const rollEvent = () => {
  if (Math.random() > 0.3) return null; 
  const keys = Object.keys(GAME_EVENTS);
  return keys[Math.floor(Math.random() * keys.length)];
};

// --- Sub Component: Jackpot Slot Overlay (修正版) ---
const JackpotOverlay = ({ targetValue, onComplete }: { targetValue: number, onComplete: () => void }) => {
    const [displayValue, setDisplayValue] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    
    // 親の再レンダリングに影響されないようにRefで管理
    const onCompleteRef = useRef(onComplete);
    const frameRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);
    
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        startTimeRef.current = Date.now();
        const duration = 3000; 

        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTimeRef.current;

            if (elapsed < duration) {
                // --- 回転中 ---
                // ★範囲変更: -5000 ~ 5000 (500刻み)
                // Math.random() * 21 -> 0~20.99...
                // floor -> 0~20
                // * 500 -> 0 ~ 10000
                // - 5000 -> -5000 ~ 5000
                const randomVal = Math.floor(Math.random() * 21) * 500 - 5000;
                setDisplayValue(randomVal);
                frameRef.current = requestAnimationFrame(animate);
            } else {
                // --- 終了 ---
                setDisplayValue(targetValue);
                setIsFinished(true);
                
                setTimeout(() => {
                    if (onCompleteRef.current) {
                        onCompleteRef.current();
                    }
                }, 2000); 
            }
        };

        frameRef.current = requestAnimationFrame(animate);

        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [targetValue]);

    // 値がマイナスの場合は赤色にするスタイル判定
    const isNegative = displayValue < 0;
    const valueColor = isNegative ? 'text-red-500' : 'text-yellow-200';
    const finishedColor = isNegative ? 'text-red-500 drop-shadow-[0_0_30px_red]' : 'text-white drop-shadow-[0_0_30px_white]';

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl">
             <div className="flex flex-col items-center gap-8 animate-bounce-short">
                 <h2 className="text-4xl md:text-6xl font-black text-yellow-400 tracking-widest italic drop-shadow-[0_0_25px_rgba(250,204,21,0.8)] border-y-4 border-yellow-500 py-2">
                    🎰 JACKPOT CHANCE 🎰
                 </h2>
                 <div className={`bg-gradient-to-b from-gray-800 to-black border-8 ${isNegative ? 'border-red-600 shadow-[0_0_80px_rgba(220,38,38,0.6)]' : 'border-yellow-500 shadow-[0_0_80px_rgba(250,204,21,0.6)]'} rounded-3xl p-10 md:p-16 relative overflow-hidden transition-colors duration-100`}>
                     {/* 光の反射エフェクト */}
                     <div className="absolute top-0 left-0 w-full h-1/2 bg-white/10 skew-y-12 transform origin-top-left pointer-events-none"></div>
                     
                     <p className={`font-mono font-black text-6xl md:text-9xl tracking-widest flex items-center justify-center min-w-[320px] md:min-w-[550px] transition-all duration-100 ${isFinished ? `${finishedColor} scale-125` : `${valueColor} blur-[2px]`}`}>
                        {displayValue.toLocaleString()}
                     </p>
                 </div>
                 {isFinished && (
                     <motion.div 
                        initial={{ scale: 0, opacity: 0 }} 
                        animate={{ scale: 1, opacity: 1 }} 
                        className={`font-bold text-2xl tracking-[0.5em] px-8 py-2 rounded-full border ${isNegative ? 'text-red-200 bg-red-900/50 border-red-500' : 'text-yellow-200 bg-yellow-900/50 border-yellow-500'}`}
                     >
                        {isNegative ? "BAD LUCK..." : "CONGRATULATIONS!!"}
                     </motion.div>
                 )}
             </div>
        </div>
    );
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
  const [roomData, setRoomData] = useState<any>(null);

  // JACKPOT演出用state
  const [showJackpot, setShowJackpot] = useState(false);
  const [jackpotValue, setJackpotValue] = useState(0);

  const mobileListRef = useRef<HTMLDivElement>(null);

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
        if (data.status === 'finished') navigate('/result');

        // JACKPOT演出の検知
        if (data.jackpotState && data.jackpotState.active) {
            setJackpotValue(data.jackpotState.value);
            setShowJackpot(true);
        } else {
            setShowJackpot(false);
        }

      } else {
        navigate('/');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (mobileListRef.current) {
      mobileListRef.current.scrollTo({ left: 0, behavior: 'auto' });
    }
  }, [currentTurnIndex, members]);

  const { offlineUsers, isHostMissing } = usePresence(roomId, userId, roomData, addToast);

  // --- Logic ---
  const triggerNextTurn = async (result: 'CLEAR' | 'FAILED') => {
    const safeIndex = Math.min(currentTurnIndex, members.length - 1);
    const currentPlayer = members[safeIndex];
    const eventType = currentPlayer?.event;

    if (result === 'CLEAR') {
        if (eventType === EVENT_TYPES.TARGET) {
            const newMembers = [...members];
            newMembers[safeIndex].selectingTarget = true;
            try { await updateDoc(doc(db, "rooms", roomId), { members: newMembers }); } catch (e) { console.error(e); }
            return;
        }
        // JACKPOTの場合
        if (eventType === EVENT_TYPES.JACKPOT) {
            // ★範囲変更: -5000 ~ 5000 (500刻み)
            // Math.random() * 21 -> 0~20
            // * 500 -> 0 ~ 10000
            // - 5000 -> -5000 ~ 5000
            const winValue = (Math.floor(Math.random() * 21) * 500) - 5000;
            try {
                await updateDoc(doc(db, "rooms", roomId), {
                    jackpotState: { active: true, value: winValue }
                });
            } catch(e) { console.error(e); }
            return;
        }
    }
    handleNextTurn(result);
  };

  const finishJackpotTurn = async () => {
    if (!isHost) return; 
    await handleNextTurn('CLEAR', undefined, jackpotValue);
    await updateDoc(doc(db, "rooms", roomId), { jackpotState: null });
  };

  const handlePlayerSelected = async (selectedUserId: string, mode: 'TARGET' | 'DUET') => {
    if (mode === 'TARGET') {
        handleNextTurn('CLEAR', selectedUserId);
    } else if (mode === 'DUET') {
        const newMembers = [...members];
        const safeIndex = Math.min(currentTurnIndex, newMembers.length - 1);
        newMembers[safeIndex].duetPartnerId = selectedUserId;
        try { 
            await updateDoc(doc(db, "rooms", roomId), { members: newMembers }); 
        } catch (e) { console.error(e); }
    }
  };

  const handleMissionSelected = async (selectedChallenge: any) => {
    if (members.length === 0) return;
    const newMembers = [...members];
    const safeIndex = Math.min(currentTurnIndex, newMembers.length - 1);
    newMembers[safeIndex].challenge = selectedChallenge;
    delete newMembers[safeIndex].candidates;

    try {
      await updateDoc(doc(db, "rooms", roomId), { members: newMembers });
    } catch (error) {
      console.error(error);
      addToast("選択エラー");
    }
  };

  const handleNextTurn = async (result: 'CLEAR' | 'FAILED', targetPlayerId?: string, jackpotAmount?: number) => {
    if (members.length === 0) return;
    const newMembers = [...members];
    const safeIndex = Math.min(currentTurnIndex, newMembers.length - 1);
    const currentPlayer = newMembers[safeIndex];
    if (!currentPlayer) return;

    const currentScore = currentPlayer.score || 0;
    const eventType = currentPlayer.event;

    // スコア計算
    if (result === 'CLEAR') {
      let addScore = 1000;
      
      if (eventType === EVENT_TYPES.DOUBLE) {
        addScore = 2000;
      } else if (eventType === EVENT_TYPES.CHALLENGE) {
        addScore = 3000;
      } else if (eventType === EVENT_TYPES.REVOLUTION) {
        addScore = 1000; 
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
      } else if (eventType === EVENT_TYPES.TARGET && targetPlayerId) {
        addScore = 1000;
        const targetIndex = newMembers.findIndex(m => m.id === targetPlayerId);
        if (targetIndex !== -1) {
          newMembers[targetIndex].score = (newMembers[targetIndex].score || 0) - 1000;
        }
      } else if (eventType === EVENT_TYPES.BOMB) {
        addScore = 1000;
        const victimIndex = (safeIndex + 1) % newMembers.length;
        if (newMembers[victimIndex].id !== currentPlayer.id) { 
            newMembers[victimIndex].score = (newMembers[victimIndex].score || 0) - 1000;
        }
      } else if (eventType === EVENT_TYPES.PHOENIX) {
        const sortedScores = [...newMembers].sort((a, b) => (b.score || 0) - (a.score || 0));
        const myRank = sortedScores.findIndex(m => m.id === currentPlayer.id);
        const isLowerHalf = myRank >= Math.floor(newMembers.length / 2);
        if (isLowerHalf) addScore = 3000;
        else addScore = 1000;
      } else if (eventType === EVENT_TYPES.DUET) {
        const partnerId = currentPlayer.duetPartnerId;
        addScore = 1500;
        if (partnerId) {
            const partnerIndex = newMembers.findIndex(m => m.id === partnerId);
            if (partnerIndex !== -1) {
                newMembers[partnerIndex].score = (newMembers[partnerIndex].score || 0) + 1500;
            }
        }
      } else if (eventType === EVENT_TYPES.JACKPOT) {
        addScore = jackpotAmount || 1000; 
      } else if (eventType === EVENT_TYPES.SELECTION) {
        addScore = 1000;
      }
      
      currentPlayer.score = currentScore + addScore;

    } else { // FAILED
      if (eventType === EVENT_TYPES.PENALTY) currentPlayer.score = currentScore - 1000;
      else if (eventType === EVENT_TYPES.CHALLENGE) currentPlayer.score = currentScore - 3000;
      else if (eventType === EVENT_TYPES.BOMB) currentPlayer.score = currentScore - 2000; 
      
      // ★変更: DUET失敗時のペナルティを-1000に変更
      else if (eventType === EVENT_TYPES.DUET) currentPlayer.score = currentScore - 1000;
    }

    // イベント終了処理 (フラグ削除)
    delete currentPlayer.event;
    delete currentPlayer.candidates;
    delete currentPlayer.selectingTarget;
    delete currentPlayer.duetPartnerId;

    // --- 次のプレイヤーへ ---
    let currentDeck = roomData.deck ? [...roomData.deck] : [];
    const currentPool = roomData.themePool || [];
    
    if (currentPool.length === 0) { addToast("エラー：お題データなし"); return; }
    
    const refillDeck = (deck: any[]) => {
      if (deck.length === 0) return shuffleArray(currentPool);
      return deck;
    };
    currentDeck = refillDeck(currentDeck);

    let nextIndex = (safeIndex + 1) % newMembers.length;
    const nextPlayer = newMembers[nextIndex];

    const nextEvent = rollEvent();
    if (nextEvent) nextPlayer.event = nextEvent;
    else delete nextPlayer.event;

    // お題補充
    if (nextEvent === EVENT_TYPES.SELECTION) {
      const mainChallenge = currentDeck.pop();
      currentDeck = refillDeck(currentDeck);
      
      const remainingDeckTitles = new Set(currentDeck.map((c: any) => c.title));
      let availablePool = currentPool.filter((c:any) => 
        c.title !== mainChallenge.title && !remainingDeckTitles.has(c.title)
      );
      if (availablePool.length < 2) {
          availablePool = currentPool.filter((c:any) => c.title !== mainChallenge.title);
      }
      const tempDeck = shuffleArray(availablePool);
      const subChallenge1 = tempDeck.pop();
      const subChallenge2 = tempDeck.pop();
      
      const candidates = shuffleArray([mainChallenge, subChallenge1, subChallenge2]);
      
      nextPlayer.challenge = mainChallenge; 
      nextPlayer.candidates = candidates;
    } else {
      const nextChallenge = currentDeck.pop();
      nextPlayer.challenge = nextChallenge;
      delete nextPlayer.candidates;
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
      console.error("Error:", error);
      addToast("通信エラー");
    }
  };

  const confirmFinish = async () => {
    try {
      await updateDoc(doc(db, "rooms", roomId), { status: 'finished' });
    } catch (error) { console.error(error); }
  };

  const handleForceLeave = async () => {
    try {
      const roomRef = doc(db, "rooms", roomId);
      if (isHost) await deleteDoc(roomRef);
      else {
        const newMembers = members.filter(m => m.id !== userId);
        await updateDoc(roomRef, { members: newMembers });
      }
      localStorage.removeItem('shibari_user_info');
      navigate('/');
    } catch (error) { navigate('/'); }
  };

  if (members.length === 0) return <div className="h-screen w-full flex items-center justify-center text-white">LOADING...</div>;

  const safeCurrentIndex = Math.min(currentTurnIndex, members.length - 1);
  const currentPlayer = members[safeCurrentIndex] || members[0];
  const currentChallenge = currentPlayer.challenge || { title: "お題準備中...", criteria: "..." };
  const currentEventKey = currentPlayer.event;
  const currentEventData = currentEventKey ? GAME_EVENTS[currentEventKey] : null;
  const isMyTurn = currentPlayer.id === userId;
  const canControl = isHost || isMyTurn;
  const canSelect = isHost || isMyTurn;

  // --- UI State Checks ---
  const isSelectingMission = canSelect && currentPlayer.candidates && currentPlayer.candidates.length > 0;
  const isAnyoneSelectingMission = currentPlayer.candidates && currentPlayer.candidates.length > 0;

  const isSelectingTarget = canSelect && currentPlayer.selectingTarget;
  const isAnyoneSelectingTarget = currentPlayer.selectingTarget;

  const isPendingPartnerSelection = currentEventKey === EVENT_TYPES.DUET && !currentPlayer.duetPartnerId;
  const isSelectingPartner = canSelect && isPendingPartnerSelection;
  const isAnyoneSelectingPartner = isPendingPartnerSelection;

  // ボタン無効化条件
  const isInteractionLocked = isAnyoneSelectingMission || isAnyoneSelectingTarget || isAnyoneSelectingPartner || showJackpot;

  const reorderedMembers = [
    ...members.slice(safeCurrentIndex),
    ...members.slice(0, safeCurrentIndex)
  ];

  return (
    <div className="w-full h-[100dvh] text-white overflow-hidden flex flex-col md:flex-row relative">
      <Toast messages={messages} onRemove={removeToast} />
      
      {/* JACKPOT OVERLAY */}
      <AnimatePresence>
          {showJackpot && (
              <JackpotOverlay 
                  targetValue={jackpotValue} 
                  onComplete={() => {
                      if (isHost) finishJackpotTurn(); 
                  }}
              />
          )}
      </AnimatePresence>

      {/* LEFT AREA (Main Game) */}
      <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
        
        {/* Header */}
        <div className="flex-none h-16 md:h-20 flex justify-between items-center px-4 md:px-8 border-b border-white/10 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-none w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-xl md:text-2xl shadow-[0_0_15px_cyan] border border-white/20">🎤</div>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span><p className="text-[9px] md:text-[10px] text-cyan-400 font-mono tracking-widest font-bold">NOW SINGING</p></div>
              <motion.p key={currentPlayer.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-white font-black leading-none truncate drop-shadow-md text-xl md:text-[clamp(1.5rem,3vw,3rem)]">{currentPlayer.name}</motion.p>
            </div>
          </div>
          <div className="text-right flex-none pl-2">
              <div className="mb-1">
                 <p className="text-[7px] md:text-[8px] text-gray-400 font-mono tracking-widest leading-none text-right">CURRENT SCORE</p>
                 <motion.p key={currentPlayer.score || 0} initial={{ scale: 1.2, color: '#22d3ee' }} animate={{ scale: 1, color: '#ffffff' }} className="text-lg md:text-xl font-black font-mono leading-none text-right">{(currentPlayer.score || 0).toLocaleString()}</motion.p>
              </div>
            <div className="bg-white/5 px-2 py-0.5 md:px-3 md:py-1 rounded-lg border border-white/10 inline-block">
              <p className="text-[7px] md:text-[8px] text-gray-400 font-mono tracking-widest leading-none mb-0.5 text-center">TURN</p>
              <p className="text-base md:text-lg font-bold text-white/90 font-mono leading-none">#{String(turnCount).padStart(2, '0')}</p>
            </div>
          </div>
        </div>

        {/* Main Stage */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 relative w-full overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-[120%] aspect-square border border-cyan-500/20 rounded-full animate-[spin_20s_linear_infinite] max-h-[500px]"></div>
          </div>
          
          <AnimatePresence mode="wait">
            {/* ★ DESTINY CHOICE (お題選択) */}
            {isSelectingMission ? (
               <motion.div 
                 key="selection-ui"
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 1.1 }}
                 className="relative z-20 w-full max-w-4xl flex flex-col items-center gap-4"
               >
                  <div className="text-center mb-2">
                    <h2 className="text-3xl md:text-5xl font-black text-yellow-400 italic tracking-tighter drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">DESTINY CHOICE</h2>
                    {isHost && !isMyTurn && <p className="text-red-400 font-bold bg-red-900/50 px-3 py-1 rounded-full animate-pulse border border-red-500">HOST OVERRIDE ACTIVE</p>}
                    <p className="text-xs md:text-sm font-bold text-white tracking-widest mt-1">お題を選択してください</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                    {currentPlayer.candidates.map((cand: any, idx: number) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.05, borderColor: '#facc15' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleMissionSelected(cand)}
                        className="bg-black/60 backdrop-blur-md border-2 border-white/20 hover:bg-yellow-900/40 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors min-h-[160px]"
                      >
                        <div className="text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">OPTION {idx + 1}</div>
                        <h3 className="font-bold text-white text-lg md:text-xl leading-tight">{cand.title}</h3>
                        <p className="text-xs text-gray-400 font-mono mt-1">{cand.criteria}</p>
                      </motion.button>
                    ))}
                  </div>
               </motion.div>
            ) : 
            /* ★ BOUNTY HUNT (ターゲット選択) */
            isSelectingTarget ? (
                 <motion.div 
                    key="target-ui"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="relative z-20 w-full max-w-lg bg-black/80 border border-emerald-500 rounded-2xl p-6 shadow-[0_0_50px_rgba(16,185,129,0.4)] flex flex-col gap-4"
                 >
                     <h2 className="text-2xl font-black text-emerald-400 text-center tracking-widest italic">SELECT TARGET</h2>
                     {isHost && !isMyTurn && <p className="text-center text-red-400 font-bold bg-red-900/50 px-3 py-1 rounded-full animate-pulse border border-red-500 inline-block mx-auto">HOST OVERRIDE ACTIVE</p>}
                     <p className="text-center text-gray-300 text-xs font-mono">誰から1000ポイント奪いますか？</p>
                     <div className="grid grid-cols-2 gap-3 mt-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                         {members.filter(m => m.id !== currentPlayer.id).map(m => (
                             <button key={m.id} onClick={() => handlePlayerSelected(m.id, 'TARGET')} className="p-4 rounded-xl bg-gray-900 border border-white/10 hover:bg-emerald-900/50 hover:border-emerald-500 transition-all flex flex-col items-center gap-2 group">
                                 <div className="text-2xl group-hover:scale-110 transition-transform">{m.avatar}</div>
                                 <div className="font-bold text-white text-sm">{m.name}</div>
                                 <div className="text-emerald-300 font-mono text-xs">{(m.score||0).toLocaleString()} pt</div>
                             </button>
                         ))}
                     </div>
                 </motion.div>
            ) :
            /* ★ DUET CHANCE (パートナー選択) */
            isSelectingPartner ? (
                <motion.div 
                   key="duet-ui"
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 1.1 }}
                   className="relative z-20 w-full max-w-lg bg-black/80 border border-cyan-500 rounded-2xl p-6 shadow-[0_0_50px_rgba(6,182,212,0.4)] flex flex-col gap-4"
                >
                    <h2 className="text-2xl font-black text-cyan-400 text-center tracking-widest italic">DUET CHANCE</h2>
                    {isHost && !isMyTurn && <p className="text-center text-red-400 font-bold bg-red-900/50 px-3 py-1 rounded-full animate-pulse border border-red-500 inline-block mx-auto">HOST OVERRIDE ACTIVE</p>}
                    <p className="text-center text-gray-300 text-xs font-mono">最初にパートナーを選んでください！<br/>二人で成功すればボーナス！</p>
                    <div className="grid grid-cols-2 gap-3 mt-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                        {members.filter(m => m.id !== currentPlayer.id).map(m => (
                            <button key={m.id} onClick={() => handlePlayerSelected(m.id, 'DUET')} className="p-4 rounded-xl bg-gray-900 border border-white/10 hover:bg-cyan-900/50 hover:border-cyan-500 transition-all flex flex-col items-center gap-2 group">
                                <div className="text-2xl group-hover:scale-110 transition-transform">{m.avatar}</div>
                                <div className="font-bold text-white text-sm">{m.name}</div>
                                <div className="text-cyan-300 font-mono text-xs">{(m.score||0).toLocaleString()} pt</div>
                            </button>
                        ))}
                    </div>
                </motion.div>
           ) : (
              /* 通常のお題表示 */
              <motion.div key={currentChallenge.title + turnCount} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", duration: 0.5 }} className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-2 md:gap-6 text-center">
                
                {/* Event Animation */}
                {currentEventData && (
                  <motion.div 
                      initial={{ y: -20, opacity: 0, scale: 1.2 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="w-full mb-2 flex flex-col items-center justify-center relative"
                  >
                      <div className={`absolute inset-0 blur-xl opacity-40 bg-gradient-to-r ${currentEventData.bgGradient} rounded-full`}></div>
                      <motion.div 
                          animate={{ scale: [1, 1.05, 1] }} 
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="relative z-10 px-4 py-1 border-y border-white/20 bg-black/60 backdrop-blur-md"
                          style={{ boxShadow: `0 0 20px ${currentEventData.shadow}` }}
                      >
                          <p className="text-[8px] font-mono tracking-[0.3em] text-white font-bold">EVENT</p>
                          <h2 className="text-xl md:text-5xl font-black italic tracking-tighter" style={{ color: currentEventData.color, textShadow: `0 0 10px ${currentEventData.shadow}` }}>
                              {currentEventData.name}
                          </h2>
                          <p className="text-[9px] md:text-sm font-bold text-white tracking-widest uppercase">{currentEventData.desc}</p>
                      </motion.div>
                  </motion.div>
                )}
                
                {/* パートナー決定済み表示 */}
                {currentEventKey === EVENT_TYPES.DUET && currentPlayer.duetPartnerId && (
                    <div className="bg-cyan-900/30 border border-cyan-500/50 px-4 py-1 rounded-full flex items-center gap-2 animate-pulse">
                        <span className="text-cyan-400 text-xs font-bold">WITH PARTNER:</span>
                        <span className="text-white font-bold">{members.find(m => m.id === currentPlayer.duetPartnerId)?.name}</span>
                    </div>
                )}

                <div className="w-full flex flex-col items-center mt-2">
                  <div className="inline-block px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono tracking-[0.2em] text-[9px] md:text-xs mb-1 md:mb-4 font-bold">CURRENT MISSION</div>
                  <h1 className="font-black text-white drop-shadow-[0_0_20px_rgba(0,255,255,0.4)] leading-tight w-full break-words text-[clamp(1.5rem,5vw,5rem)] px-2">
                    {/* ステータスに応じたタイトル表示 */}
                    {isAnyoneSelectingMission ? "CHOOSING MISSION..." : 
                     isAnyoneSelectingTarget ? "CHOOSING TARGET..." :
                     isAnyoneSelectingPartner ? "CHOOSING PARTNER..." :
                     currentChallenge.title}
                  </h1>
                </div>
                <div className="w-full flex justify-center mt-2 md:mt-4">
                  <div className="w-auto max-w-full bg-gradient-to-br from-red-900/40 to-black/40 border border-red-500/50 px-4 py-2 md:px-10 md:py-6 rounded-xl backdrop-blur-md shadow-[0_0_30px_rgba(220,38,38,0.2)] flex flex-col items-center gap-0.5">
                    <p className="text-red-300 font-mono tracking-[0.2em] text-[8px] md:text-xs uppercase opacity-90 font-bold whitespace-nowrap">Clear Condition</p>
                    <p className="font-black text-white tracking-widest text-[clamp(1.2rem,4vw,3rem)]">
                        {isInteractionLocked ? "???" : currentChallenge.criteria}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions (Buttons) */}
        <div className="flex-none px-4 pb-2 md:pb-12 pt-2 bg-gradient-to-t from-black/80 to-transparent z-20 w-full">
            <div className="flex gap-2 md:gap-6 w-full max-w-5xl mx-auto h-16 md:h-24">
              {/* 通常時：ボタン表示 */}
              {!isInteractionLocked ? (
                  canControl ? (
                    <>
                      <button onClick={() => triggerNextTurn('FAILED')} className="flex-1 rounded-xl bg-[#1e293b]/80 backdrop-blur-sm border border-[#334155] text-gray-400 font-black text-lg md:text-2xl tracking-widest active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5">FAILED<span className="text-[8px] md:text-[10px] font-normal opacity-50">失敗...</span></button>
                      <button onClick={() => triggerNextTurn('CLEAR')} className="flex-[2] rounded-xl bg-gradient-to-r from-cyan-600/90 to-blue-600/90 backdrop-blur-sm border-0 text-white font-black text-xl md:text-4xl italic tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5"><span className="relative z-10">CLEAR!!</span><span className="relative z-10 text-[8px] md:text-sm font-bold text-cyan-100 tracking-normal opacity-80">成功</span></button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/40 border border-white/10 rounded-xl backdrop-blur-md">
                      <p className="text-gray-400 font-mono text-xs md:text-base tracking-widest animate-pulse">WAITING FOR RESULT...</p>
                    </div>
                  )
              ) : (
                  // 選択中の待機表示
                  <div className={`w-full h-full flex items-center justify-center border rounded-xl backdrop-blur-md ${
                      isAnyoneSelectingTarget ? 'bg-emerald-900/20 border-emerald-500/30' : 
                      isAnyoneSelectingPartner ? 'bg-cyan-900/20 border-cyan-500/30' :
                      'bg-yellow-900/20 border-yellow-500/30'
                  }`}>
                      <p className={`${
                          isAnyoneSelectingTarget ? 'text-emerald-400' : 
                          isAnyoneSelectingPartner ? 'text-cyan-400' :
                          'text-yellow-400'
                      } font-bold animate-pulse tracking-widest flex items-center gap-2`}>
                        <span className={`w-2 h-2 rounded-full ${
                            isAnyoneSelectingTarget ? 'bg-emerald-400' : 
                            isAnyoneSelectingPartner ? 'bg-cyan-400' :
                            'bg-yellow-400'
                        }`}></span>
                        {showJackpot ? "JACKPOT TIME!!" : 
                         isAnyoneSelectingTarget ? "PLAYER IS CHOOSING TARGET..." : 
                         isAnyoneSelectingPartner ? "PLAYER IS CHOOSING PARTNER..." :
                         "PLAYER IS CHOOSING MISSION..."}
                      </p>
                  </div>
              )}
            </div>
        </div>

        {/* MOBILE MEMBER LIST (省略) */}
        {/* ...前回のコードと同じため省略していますが、実際にはここに入れてください... */}
        <div className="md:hidden w-full bg-black/80 backdrop-blur-md border-t border-white/10 p-3 pb-6 flex flex-col gap-2 flex-none">
           <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-bold text-gray-400 tracking-widest">NEXT SINGERS</span>
              {isHost && <button onClick={() => setShowFinishModal(true)} className="text-[10px] text-red-400 border border-red-500/30 px-2 py-1 rounded hover:bg-red-900/30">FINISH GAME</button>}
           </div>
           
           <div ref={mobileListRef} className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar snap-x">
              {reorderedMembers.map((member, index) => {
                 const isCurrent = index === 0; 
                 const isOffline = offlineUsers.has(member.id);
                 const evt = member.event ? GAME_EVENTS[member.event] : null;

                 return (
                   <div key={member.id} className={`snap-start flex-none w-36 bg-white/5 border ${isCurrent ? 'border-cyan-500 bg-cyan-900/20' : 'border-white/10'} rounded-lg p-2 flex flex-col gap-1 relative overflow-hidden`}>
                      {isCurrent && <div className="absolute top-0 right-0 bg-cyan-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-bl">NOW</div>}
                      <div className="flex items-center gap-2">
                         <div className="text-lg">{member.avatar}</div>
                         <div className={`text-xs font-bold truncate ${isCurrent ? 'text-white' : 'text-gray-400'}`}>{member.name}</div>
                      </div>
                      <div className="h-[1px] bg-white/10 w-full my-0.5"></div>
                      <div className="flex flex-col gap-0.5">
                         {evt ? (
                            <div className="text-[8px] text-yellow-400 font-bold truncate">★ {evt.name}</div>
                         ) : (
                            <div className="text-[8px] text-gray-500 truncate">No Event</div>
                         )}
                         <div className="text-[9px] text-cyan-200 font-bold truncate leading-tight">
                            {member.challenge?.title || "..."}
                         </div>
                      </div>
                      {isOffline && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-red-500 font-bold backdrop-blur-[1px]">OFFLINE</div>}
                   </div>
                 );
              })}
           </div>
        </div>
      </div>

      {/* RIGHT AREA (PC Sidebar) */}
      <div className="hidden md:flex w-[300px] lg:w-[360px] flex-none bg-black/60 backdrop-blur-xl border-l border-white/10 flex-col relative z-20 shadow-2xl">
        <div className="p-4 md:p-6 border-b border-white/10 bg-white/5 flex-none">
          <h3 className="text-xs md:text-sm font-bold text-white tracking-widest flex items-center gap-2"><span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>RESERVATION LIST</h3>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">TOTAL: {members.length} MEMBERS</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
          {reorderedMembers.map((member, index) => {
            const isCurrent = index === 0;
            const challenge = member.challenge || { title: "...", criteria: "..." };
            const isOffline = offlineUsers.has(member.id);
            const evt = member.event ? GAME_EVENTS[member.event] : null;
            
            return (
              <motion.div layout key={member.id} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: isOffline ? 0.5 : 1 }} transition={{ duration: 0.3 }}
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
          })}
          <div className="h-4"></div>
        </div>
        {isHost && (
          <div className="p-4 pb-8 md:pb-10 border-t border-white/10 bg-black/40 flex-none">
            <button onClick={() => setShowFinishModal(true)} className="w-full py-3 md:py-4 rounded-xl border-2 border-red-500/30 text-red-400 font-bold tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2 group text-sm">GAME FINISH</button>
          </div>
        )}
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