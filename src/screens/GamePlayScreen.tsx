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
} as const;

const GAME_EVENTS: Record<string, { name: string; desc: string; color: string; shadow: string; bgGradient: string }> = {
  [EVENT_TYPES.DOUBLE]: {
    name: 'DOUBLE STRIKE',
    desc: 'SUCCESS SCORE x2',
    color: '#fbbf24',
    shadow: 'rgba(251, 191, 36, 0.5)',
    bgGradient: 'from-yellow-600/20 to-amber-500/20',
  },
  [EVENT_TYPES.PENALTY]: {
    name: 'ABYSS TRAP',
    desc: 'FAILURE PENALTY -1000',
    color: '#a855f7',
    shadow: 'rgba(168, 85, 247, 0.5)',
    bgGradient: 'from-purple-900/40 to-black/60',
  },
  [EVENT_TYPES.CHALLENGE]: {
    name: 'DEAD OR ALIVE',
    desc: 'SUCCESS +3000 / FAIL -3000',
    color: '#ef4444',
    shadow: 'rgba(239, 68, 68, 0.6)',
    bgGradient: 'from-red-900/40 to-orange-900/40',
  },
  [EVENT_TYPES.REVOLUTION]: {
    name: 'KING SLAYER',
    desc: 'SUCCESS: TOP PLAYER -1000',
    color: '#3b82f6',
    shadow: 'rgba(59, 130, 246, 0.5)',
    bgGradient: 'from-blue-900/40 to-cyan-900/40',
  },
  [EVENT_TYPES.TARGET]: {
    name: 'BOUNTY HUNT',
    desc: 'SUCCESS: STEAL 1000 PTS',
    color: '#10b981',
    shadow: 'rgba(16, 185, 129, 0.5)',
    bgGradient: 'from-emerald-900/40 to-green-900/40',
  },
  [EVENT_TYPES.BOMB]: {
    name: 'BOMB PASS',
    desc: 'NEXT PLAYER -1000',
    color: '#f97316',
    shadow: 'rgba(249, 115, 22, 0.6)',
    bgGradient: 'from-orange-700/40 to-red-900/40',
  },
  [EVENT_TYPES.PHOENIX]: {
    name: 'PHOENIX RISE',
    desc: 'COMEBACK CHANCE x3',
    color: '#e11d48',
    shadow: 'rgba(225, 29, 72, 0.6)',
    bgGradient: 'from-rose-900/40 to-pink-900/40',
  },
  [EVENT_TYPES.DUET]: {
    name: 'DUET CHANCE',
    desc: 'FAIL: YOU -1000',
    color: '#06b6d4',
    shadow: 'rgba(6, 182, 212, 0.6)',
    bgGradient: 'from-cyan-500/20 to-teal-500/20',
  },
  [EVENT_TYPES.JACKPOT]: {
    name: 'JACKPOT 777',
    desc: 'BIG RISK, BIG RETURN',
    color: '#facc15',
    shadow: 'rgba(250, 204, 21, 0.8)',
    bgGradient: 'from-yellow-500/40 to-purple-900/40',
  },
  [EVENT_TYPES.SELECTION]: {
    name: 'DESTINY CHOICE',
    desc: 'CHOOSE YOUR MISSION',
    color: '#f59e0b',
    shadow: 'rgba(245, 158, 11, 0.6)',
    bgGradient: 'from-orange-500/20 to-yellow-500/20',
  },
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
  // NOTE: 元コードだと Math.random() > 1.0 は絶対falseで、毎回イベントが出ます。
  // 意図ならそのままでOK。確率制にしたいなら例: if (Math.random() > 0.25) return null;
  if (Math.random() > 1.0) return null;
  const keys = Object.keys(GAME_EVENTS);
  return keys[Math.floor(Math.random() * keys.length)];
};

// --- Sub Components ---

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'OK' }: ConfirmModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gray-900 border border-white/20 p-6 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col gap-4 text-center"
      >
        <h3 className="text-xl font-bold text-white">{title}</h3>
        <p className="text-gray-300 text-sm whitespace-pre-wrap">{message}</p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-400 font-bold text-xs hover:bg-gray-700"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-cyan-600 text-white font-bold text-xs hover:bg-cyan-500 shadow-lg shadow-cyan-900/50"
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const EventGuideModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f172a] border border-cyan-500/30 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-4 md:p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
          <h2 className="text-xl md:text-2xl font-black text-cyan-400 tracking-widest italic flex items-center gap-2">
            📖 RULE GRIMOIRE
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(GAME_EVENTS).map(([key, evt]) => (
              <div key={key} className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <div className="h-10 w-1 rounded-full" style={{ backgroundColor: evt.color, boxShadow: `0 0 10px ${evt.shadow}` }} />
                  <div className="flex-1">
                    <h3 className="font-black italic text-lg md:text-xl tracking-tighter" style={{ color: evt.color }}>
                      {evt.name}
                    </h3>
                    <p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">{evt.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const ActionOverlay = ({ actionLog, onClose }: { actionLog: any; onClose: () => void }) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onCloseRef.current) onCloseRef.current();
    }, 2500);
    return () => clearTimeout(timer);
  }, [actionLog]);

  if (!actionLog) return null;
  const details = actionLog.detail ? actionLog.detail.split('\n') : [];
  return (
    <div className="fixed inset-0 z-[150] pointer-events-none flex items-center justify-center overflow-hidden">
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full bg-gradient-to-r from-black/80 via-black/95 to-black/80 border-y-2 border-white/20 py-8 md:py-12 flex flex-col items-center justify-center relative backdrop-blur-sm"
      >
        <div className="absolute inset-0 bg-cyan-500/10 mix-blend-overlay" />
        <h2 className="text-2xl md:text-5xl font-black italic text-white tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] px-4 text-center mb-4">
          {actionLog.title}
        </h2>
        <div className="flex flex-col gap-2 items-center w-full px-4">
          {details.map((line: string, idx: number) => {
            const isNegative = line.includes('-');
            const isNoChange = line.includes('No Change');
            const colorClasses = isNegative
              ? 'text-red-400 drop-shadow-[0_0_5px_red] border-red-500/30 bg-red-900/20'
              : isNoChange
                ? 'text-gray-400 border-gray-500/30'
                : 'text-cyan-400 drop-shadow-[0_0_5px_cyan] border-cyan-500/30 bg-cyan-900/20';
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.05 }}
                className={`text-lg md:text-3xl font-bold px-6 py-2 rounded-full border bg-black/40 ${colorClasses}`}
              >
                {line}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

const MissionDisplay = React.memo(
  ({ title, criteria, eventData, isLocked, partnerName, stateText }: any) => {
    const displayTitle = stateText || title;
    const displayCriteria = isLocked ? '???' : criteria;

    const getTitleStyle = (text: string) => {
      const len = text.length;
      if (len > 50) return 'text-[clamp(0.9rem,3.5vw,1.5rem)]';
      if (len > 30) return 'text-[clamp(1.1rem,4.5vw,2rem)]';
      if (len > 15) return 'text-[clamp(1.4rem,6vw,3rem)]';
      return 'text-[clamp(2rem,8vw,5rem)]';
    };

    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.1, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="relative z-10 w-full max-w-6xl flex flex-col items-center gap-1 md:gap-4 text-center px-2"
      >
        {eventData && (
          <motion.div
            initial={{ y: -20, opacity: 0, scale: 1.2 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            className="w-full mb-1 flex flex-col items-center justify-center relative"
          >
            <div className={`absolute inset-0 blur-xl opacity-40 bg-gradient-to-r ${eventData.bgGradient} rounded-full`} />
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="relative z-10 px-4 py-1 border-y border-white/20 bg-black/60 backdrop-blur-md"
              style={{ boxShadow: `0 0 20px ${eventData.shadow}` }}
            >
              <p className="text-[8px] font-mono tracking-[0.3em] text-white font-bold">EVENT</p>
              <h2
                className="text-xl md:text-5xl font-black italic tracking-tighter whitespace-nowrap"
                style={{ color: eventData.color, textShadow: `0 0 10px ${eventData.shadow}` }}
              >
                {eventData.name}
              </h2>
              <p className="text-[8px] md:text-sm font-bold text-white tracking-widest uppercase">{eventData.desc}</p>
            </motion.div>
          </motion.div>
        )}

        {partnerName && (
          <div className="bg-cyan-900/30 border border-cyan-500/50 px-3 py-0.5 md:px-4 md:py-1 rounded-full flex items-center gap-2 animate-pulse mb-1">
            <span className="text-cyan-400 text-[10px] md:text-xs font-bold">WITH PARTNER:</span>
            <span className="text-white text-xs md:text-base font-bold">{partnerName}</span>
          </div>
        )}

        <div className="w-full flex flex-col items-center mt-1 md:mt-2 px-2 overflow-visible">
          <div className="inline-block px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono tracking-[0.2em] text-[8px] md:text-xs mb-1 md:mb-2 font-bold">
            CURRENT MISSION
          </div>

          <div className="w-full px-1">
            <h1
              className={`
              font-black text-white drop-shadow-[0_0_20px_rgba(0,255,255,0.4)] leading-tight w-full 
              whitespace-pre-wrap break-words text-center [text-wrap:balance] 
              ${getTitleStyle(displayTitle)}
            `}
            >
              {displayTitle}
            </h1>
          </div>
        </div>

        <div className="w-full flex justify-center mt-2 md:mt-4">
          <div className="w-auto max-w-full bg-gradient-to-br from-red-900/40 to-black/40 border border-red-500/50 px-4 py-2 md:px-10 md:py-6 rounded-xl backdrop-blur-md shadow-[0_0_30px_rgba(220,38,38,0.2)] flex flex-col items-center gap-0.5">
            <p className="text-red-300 font-mono tracking-[0.2em] text-[8px] md:text-xs uppercase opacity-90 font-bold whitespace-nowrap">
              Clear Condition
            </p>
            <p className="font-black text-white tracking-widest text-[clamp(1.5rem,4vw,3rem)] md:text-[3rem]">
              {displayCriteria}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }
);

const JackpotOverlay = ({ targetValue, onComplete }: { targetValue: number; onComplete: () => void }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    const duration = 3000;
    const isTargetNegative = targetValue < 0;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTimeRef.current;

      if (elapsed < duration) {
        const randomVal = isTargetNegative
          ? -1 * ((Math.floor(Math.random() * 10) + 1) * 500)
          : (Math.floor(Math.random() * 10) + 1) * 500;
        setDisplayValue(randomVal);
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue);
        setIsFinished(true);
        setTimeout(() => {
          if (onCompleteRef.current) onCompleteRef.current();
        }, 2500);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [targetValue]);

  const isNegative = displayValue < 0;
  const valueColor = isNegative ? 'text-red-500' : 'text-yellow-200';
  const finishedColor = isNegative ? 'text-red-500 drop-shadow-[0_0_30px_red]' : 'text-white drop-shadow-[0_0_30px_white]';
  const borderColor = isNegative
    ? 'border-red-600 shadow-[0_0_80px_rgba(220,38,38,0.6)]'
    : 'border-yellow-500 shadow-[0_0_80px_rgba(250,204,21,0.6)]';
  const message = isNegative ? 'FAILURE...' : 'CONGRATULATIONS!!';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl px-4">
      <div className="flex flex-col items-center gap-4 md:gap-8 animate-bounce-short w-full max-w-[90vw] md:max-w-none md:w-auto">
        <h2 className="text-2xl md:text-6xl font-black text-yellow-400 tracking-wider md:tracking-widest italic drop-shadow-[0_0_25px_rgba(250,204,21,0.8)] border-y-2 md:border-y-4 border-yellow-500 py-2 text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">
          🎰 JACKPOT 🎰
        </h2>
        <div
          className={`bg-gradient-to-b from-gray-800 to-black border-4 md:border-8 ${borderColor} rounded-3xl p-6 md:p-16 relative overflow-hidden transition-colors duration-100 w-full max-w-[320px] md:max-w-none md:min-w-[550px]`}
        >
          <div className="absolute top-0 left-0 w-full h-1/2 bg-white/10 skew-y-12 transform origin-top-left pointer-events-none" />
          <p
            className={`font-mono font-black text-5xl md:text-9xl tracking-widest flex items-center justify-center transition-all duration-100 ${
              isFinished ? `${finishedColor} scale-125` : `${valueColor} blur-[2px]`
            }`}
          >
            {displayValue.toLocaleString()}
          </p>
        </div>
        {isFinished && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`font-bold text-sm md:text-2xl tracking-[0.2em] md:tracking-[0.5em] px-4 py-2 md:px-8 rounded-full border text-center ${
              isNegative ? 'text-red-200 bg-red-900/50 border-red-500' : 'text-yellow-200 bg-yellow-900/50 border-yellow-500'
            }`}
          >
            {message}
          </motion.div>
        )}
      </div>
    </div>
  );
};

// --- Main Component ---

export const GamePlayScreen = () => {
  const navigate = useNavigate();
  const { messages, addToast, removeToast } = useToast();
  useWakeLock();

  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [isHost, setIsHost] = useState(false);

  const [members, setMembers] = useState<any[]>([]);
  const [rankedMembers, setRankedMembers] = useState<any[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [turnCount, setTurnCount] = useState(1);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);

  const [showJackpot, setShowJackpot] = useState(false);
  const [jackpotValue, setJackpotValue] = useState(0);
  const [jackpotResultType, setJackpotResultType] = useState<'CLEAR' | 'FAILED'>('CLEAR');

  const [proxyTarget, setProxyTarget] = useState<any>(null);

  const mobileListRef = useRef<HTMLDivElement>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [activeActionLog, setActiveActionLog] = useState<any>(null);

  // ★ lastLogTimestamp は ref で管理（onSnapshotの再購読ループ回避）
  const lastLogTimestampRef = useRef<number>(0);

  // 順位計算
  useEffect(() => {
    if (members.length > 0) {
      const sorted = [...members].sort((a, b) => (b.score || 0) - (a.score || 0));
      const ranked = members.map((m) => {
        const rank = sorted.findIndex((s) => s.id === m.id) + 1;
        return { ...m, rank };
      });
      setRankedMembers(ranked);
    }
  }, [members]);

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

    const roomRef = doc(db, 'rooms', userInfo.roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (!docSnap.exists()) {
        navigate('/');
        return;
      }

      const data = docSnap.data();
      setRoomData(data);
      setMembers(data.members || []);

      if (data.lastLog?.timestamp && data.lastLog.timestamp !== lastLogTimestampRef.current) {
        lastLogTimestampRef.current = data.lastLog.timestamp;
        setActiveActionLog(data.lastLog);
      }

      if (data.currentTurnIndex !== undefined) {
        const maxIndex = (data.members?.length || 1) - 1;
        setCurrentTurnIndex(Math.min(data.currentTurnIndex, maxIndex));
      }
      if (data.turnCount !== undefined) setTurnCount(data.turnCount);

      if (data.status === 'finished') navigate('/result');

      if (data.jackpotState && data.jackpotState.active) {
        setJackpotValue(data.jackpotState.value);
        setJackpotResultType(data.jackpotState.resultType);
        setShowJackpot(true);
      } else {
        setShowJackpot(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning]);

  useEffect(() => {
    if (mobileListRef.current) {
      mobileListRef.current.scrollTo({ left: 0, behavior: 'auto' });
    }
  }, [currentTurnIndex, members]);

  const { offlineUsers, isHostMissing } = usePresence(roomId, userId, roomData, addToast);

  const requestConfirmation = (title: string, message: string, action: () => void) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        action();
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handlePlayerSelectedWrapper = (
    selectedUserId: string,
    mode: 'TARGET' | 'DUET',
    targetUserId: string | null = null
  ) => {
    const targetMember = members.find((m) => m.id === selectedUserId);
    const name = targetMember ? targetMember.name : 'Unknown';
    const title = mode === 'TARGET' ? 'ターゲット選択' : 'パートナー指名';
    const msg =
      mode === 'TARGET'
        ? `${name} から1000pt奪いますか？`
        : `${name} とデュエットしますか？\n(成功時:両者+1500 / 失敗時:自分-1000)`;
    requestConfirmation(title, msg, () => handlePlayerSelected(selectedUserId, mode, targetUserId));
  };

  const handleMissionSelectedWrapper = (selectedChallenge: any, targetUserId: string | null = null) => {
    requestConfirmation('ミッション選択', `このお題で決定しますか？\n\n『${selectedChallenge.title}』`, () =>
      handleMissionSelected(selectedChallenge, targetUserId)
    );
  };

  const triggerNextTurn = async (result: 'CLEAR' | 'FAILED') => {
    setIsTransitioning(true);

    const safeIndex = Math.min(currentTurnIndex, members.length - 1);
    const currentPlayer = members[safeIndex];
    const eventType = currentPlayer?.event;

    if (result === 'CLEAR' && eventType === EVENT_TYPES.TARGET) {
      setIsTransitioning(false);
      const newMembers = [...members];
      newMembers[safeIndex] = { ...newMembers[safeIndex], selectingTarget: true };

      // ★ 追加：すぐUI反映
      setMembers(newMembers);

      try {
        await updateDoc(doc(db, 'rooms', roomId), { members: newMembers });
      } catch (e) {
        console.error(e);
        addToast('通信エラーが発生しました');
      }
      return;
    }

    if (eventType === EVENT_TYPES.JACKPOT) {
      setIsTransitioning(false);
      let winValue = 0;
      const step = 500;
      const multiplier = Math.floor(Math.random() * 10) + 1;
      winValue = result === 'CLEAR' ? multiplier * step : -1 * (multiplier * step);

      try {
        await updateDoc(doc(db, 'rooms', roomId), {
          jackpotState: { active: true, value: winValue, resultType: result },
        });
      } catch (e) {
        console.error(e);
        addToast('通信エラーが発生しました');
      }
      return;
    }

    handleNextTurn(result);
  };

  const finishJackpotTurn = async () => {
    if (!isHost) return;
    setIsTransitioning(true);
    await handleNextTurn(jackpotResultType, undefined, jackpotValue);
    await updateDoc(doc(db, 'rooms', roomId), { jackpotState: null });
  };

  const handlePlayerSelected = async (selectedUserId: string, mode: 'TARGET' | 'DUET', targetUserId: string | null = null) => {
    const prevMembers = members; // ★ rollback 用
    const prevProxy = proxyTarget;

    const newMembers = [...members];
    let actorIndex = -1;

    // 更新対象（Actor）の特定ロジック
    if (targetUserId) {
      actorIndex = newMembers.findIndex((m) => m.id === targetUserId);
    } else {
      actorIndex = Math.min(currentTurnIndex, newMembers.length - 1);
    }

    if (actorIndex === -1 || !newMembers[actorIndex]) return;

    if (mode === 'TARGET') {
      setIsTransitioning(true);
      await handleNextTurn('CLEAR', selectedUserId);
      return;
    }

    if (mode === 'DUET') {
      const updatedMember = { ...newMembers[actorIndex] };
      updatedMember.duetPartnerId = selectedUserId;

      // ★ 必ず消す
      delete updatedMember.selectingPartner;

      newMembers[actorIndex] = updatedMember;

      // ★ 楽観的更新：すぐ閉じる（固まり防止）
      setMembers(newMembers);
      setProxyTarget(null);

      try {
        await updateDoc(doc(db, 'rooms', roomId), { members: newMembers });
      } catch (e) {
        console.error(e);
        addToast('通信エラーが発生しました');
        // rollback
        setMembers(prevMembers);
        setProxyTarget(prevProxy);
      }
    }
  };

  const handleMissionSelected = async (selectedChallenge: any, targetUserId: string | null = null) => {
    if (members.length === 0) return;

    const prevMembers = members; // ★ rollback 用
    const prevProxy = proxyTarget;

    const newMembers = [...members];
    let actorIndex = -1;

    if (targetUserId) {
      actorIndex = newMembers.findIndex((m) => m.id === targetUserId);
    } else {
      actorIndex = Math.min(currentTurnIndex, newMembers.length - 1);
    }

    if (actorIndex !== -1 && newMembers[actorIndex]) {
      const updatedMember = { ...newMembers[actorIndex] };
      updatedMember.challenge = selectedChallenge;

      // ★ 必ず消す
      delete updatedMember.candidates;

      newMembers[actorIndex] = updatedMember;

      // ★ 楽観的更新：すぐUIを閉じる（固まり防止）
      setMembers(newMembers);
      setProxyTarget(null);

      try {
        await updateDoc(doc(db, 'rooms', roomId), { members: newMembers });
      } catch (error) {
        console.error(error);
        addToast('選択エラー');
        // rollback
        setMembers(prevMembers);
        setProxyTarget(prevProxy);
      }
    }
  };

  const handleNextTurn = async (result: 'CLEAR' | 'FAILED', targetPlayerId?: string, jackpotAmount?: number) => {
    if (members.length === 0) return;

    const newMembers = [...members];
    const safeIndex = Math.min(currentTurnIndex, newMembers.length - 1);
    const currentPlayer = newMembers[safeIndex];
    if (!currentPlayer) return;

    const eventType = currentPlayer.event;
    const scoreChanges: { name: string; diff: number }[] = [];
    let logTitle = '';

    const applyScoreChange = (memberIndex: number, amount: number) => {
      if (newMembers[memberIndex]) {
        const currentVal = newMembers[memberIndex].score || 0;
        newMembers[memberIndex].score = currentVal + amount;
        scoreChanges.push({ name: newMembers[memberIndex].name, diff: amount });
      }
    };

    const myIndex = safeIndex;

    if (result === 'CLEAR') {
      if (eventType === EVENT_TYPES.DOUBLE) {
        logTitle = 'DOUBLE STRIKE!';
        applyScoreChange(myIndex, 2000);
      } else if (eventType === EVENT_TYPES.CHALLENGE) {
        logTitle = 'DEAD OR ALIVE SUCCESS!';
        applyScoreChange(myIndex, 3000);
      } else if (eventType === EVENT_TYPES.REVOLUTION) {
        logTitle = 'KING SLAYER!';
        applyScoreChange(myIndex, 1000);

        let topScore = -99999;
        let topMemberIndex = -1;
        newMembers.forEach((m, idx) => {
          if (m.id !== currentPlayer.id && (m.score || 0) > topScore) {
            topScore = m.score || 0;
            topMemberIndex = idx;
          }
        });
        if (topMemberIndex !== -1) applyScoreChange(topMemberIndex, -1000);
      } else if (eventType === EVENT_TYPES.TARGET && targetPlayerId) {
        logTitle = 'BOUNTY HUNT SUCCESS!';
        applyScoreChange(myIndex, 1000);
        const targetIndex = newMembers.findIndex((m) => m.id === targetPlayerId);
        if (targetIndex !== -1) applyScoreChange(targetIndex, -1000);
      } else if (eventType === EVENT_TYPES.BOMB) {
        logTitle = 'BOMB PASSED!';
        applyScoreChange(myIndex, 1000);
        const victimIndex = (safeIndex + 1) % newMembers.length;
        if (newMembers[victimIndex].id !== currentPlayer.id) applyScoreChange(victimIndex, -1000);
      } else if (eventType === EVENT_TYPES.PHOENIX) {
        logTitle = 'PHOENIX RISE!';
        const sortedScores = [...newMembers].sort((a, b) => (b.score || 0) - (a.score || 0));
        const myRank = sortedScores.findIndex((m) => m.id === currentPlayer.id);
        const isLowerHalf = myRank >= Math.floor(newMembers.length / 2);
        applyScoreChange(myIndex, isLowerHalf ? 3000 : 1000);
      } else if (eventType === EVENT_TYPES.DUET) {
        logTitle = 'DUET PERFECT!';
        applyScoreChange(myIndex, 1500);
        const partnerId = currentPlayer.duetPartnerId;
        if (partnerId) {
          const partnerIndex = newMembers.findIndex((m) => m.id === partnerId);
          if (partnerIndex !== -1) applyScoreChange(partnerIndex, 1500);
        }
      } else if (eventType === EVENT_TYPES.JACKPOT) {
        logTitle = 'JACKPOT WINNER!';
        applyScoreChange(myIndex, jackpotAmount || 0);
      } else if (eventType === EVENT_TYPES.SELECTION) {
        logTitle = 'DESTINY FULFILLED';
        applyScoreChange(myIndex, 1000);
      } else {
        logTitle = 'MISSION CLEAR';
        applyScoreChange(myIndex, 1000);
      }
    } else {
      if (eventType === EVENT_TYPES.PENALTY) {
        logTitle = 'ABYSS TRAP TRIGGERED';
        applyScoreChange(myIndex, -1000);
      } else if (eventType === EVENT_TYPES.CHALLENGE) {
        logTitle = 'DEAD OR ALIVE FAILED';
        applyScoreChange(myIndex, -3000);
      } else if (eventType === EVENT_TYPES.BOMB) {
        logTitle = 'BOMB EXPLODED!';
        applyScoreChange(myIndex, -2000);
      } else if (eventType === EVENT_TYPES.DUET) {
        logTitle = 'DUET FAILED';
        applyScoreChange(myIndex, -1000);
      } else if (eventType === EVENT_TYPES.JACKPOT) {
        logTitle = 'JACKPOT CRASH';
        applyScoreChange(myIndex, jackpotAmount || 0);
      } else {
        logTitle = 'MISSION FAILED';
        scoreChanges.push({ name: currentPlayer.name, diff: 0 });
      }
    }

    const logDetail =
      scoreChanges.length > 0
        ? scoreChanges
            .map((c) => {
              const sign = c.diff > 0 ? '+' : '';
              const valStr = c.diff === 0 ? 'No Change' : `${sign}${c.diff}`;
              return `${c.name}: ${valStr}`;
            })
            .join('\n')
        : 'No Score Change';

    // リセット
    delete currentPlayer.event;
    delete currentPlayer.candidates;
    delete currentPlayer.selectingTarget;
    delete currentPlayer.duetPartnerId;
    delete currentPlayer.selectingPartner;

    // Deck / Theme
    let currentDeck = roomData?.deck ? [...roomData.deck] : [];
    const currentPool = roomData?.themePool || [];
    if (currentPool.length === 0) {
      addToast('エラー：お題データなし');
      return;
    }

    const refillDeck = (deck: any[]) => (deck.length === 0 ? shuffleArray(currentPool) : deck);
    currentDeck = refillDeck(currentDeck);

    const nextLoopEvent = rollEvent();
    if (nextLoopEvent) currentPlayer.event = nextLoopEvent;

    if (nextLoopEvent === EVENT_TYPES.SELECTION) {
      const mainChallenge = currentDeck.pop();
      currentDeck = refillDeck(currentDeck);

      const remainingDeckTitles = new Set(currentDeck.map((c: any) => c.title));
      let availablePool = currentPool.filter((c: any) => c.title !== mainChallenge.title && !remainingDeckTitles.has(c.title));
      if (availablePool.length < 2) availablePool = currentPool.filter((c: any) => c.title !== mainChallenge.title);

      const tempDeck = shuffleArray(availablePool);
      const subChallenge1 = tempDeck.pop();
      const subChallenge2 = tempDeck.pop();

      currentPlayer.challenge = mainChallenge;
      currentPlayer.candidates = shuffleArray([mainChallenge, subChallenge1, subChallenge2]);
    } else if (nextLoopEvent === EVENT_TYPES.DUET) {
      const nextChallenge = currentDeck.pop();
      currentPlayer.challenge = nextChallenge;
      currentPlayer.selectingPartner = true;
    } else {
      const nextChallenge = currentDeck.pop();
      currentPlayer.challenge = nextChallenge;
    }

    // ★ 壊れていた let を修正
    let nextIndex = (safeIndex + 1) % newMembers.length;
    const nextPlayer = newMembers[nextIndex];
    const isSelecting = nextPlayer?.candidates || nextPlayer?.selectingPartner;
    if (!isSelecting && !nextPlayer?.challenge) {
      const fallbackChallenge = currentDeck.pop();
      nextPlayer.challenge = fallbackChallenge;
    }

    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        members: newMembers,
        currentTurnIndex: nextIndex,
        turnCount: turnCount + 1,
        deck: currentDeck,
        lastLog: { timestamp: Date.now(), title: logTitle, detail: logDetail },
      });
    } catch (error) {
      console.error('Error:', error);
      addToast('通信エラー');
    }
  };

  const confirmFinish = async () => {
    try {
      await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' });
    } catch (error) {
      console.error(error);
    }
  };

  const handleForceLeave = async () => {
    try {
      const roomRef = doc(db, 'rooms', roomId);
      if (isHost) {
        await deleteDoc(roomRef);
      } else {
        const newMembers = members.filter((m) => m.id !== userId);
        await updateDoc(roomRef, { members: newMembers });
      }
      localStorage.removeItem('shibari_user_info');
      navigate('/');
    } catch (error) {
      navigate('/');
    }
  };

  if (members.length === 0) return <div className="h-screen w-full flex items-center justify-center text-white">LOADING...</div>;

  const safeCurrentIndex = Math.min(currentTurnIndex, members.length - 1);
  const currentPlayerMember = members[safeCurrentIndex] || members[0];
  const currentPlayer = rankedMembers.find((m) => m.id === currentPlayerMember.id) || currentPlayerMember;

  // ✅ 追加：白画面の原因だった isMyTurn を定義
  const isMyTurn = currentPlayer?.id === userId;

  const currentChallenge = currentPlayer.challenge || { title: 'お題準備中...', criteria: '...' };
  const currentEventKey = currentPlayer.event;
  const currentEventData = currentEventKey ? GAME_EVENTS[currentEventKey] : null;

  const canControl = isHost || currentPlayer.id === userId;
  const canSelect = isHost || currentPlayer.id === userId;

  const myMember = members.find((m) => m.id === userId);

  const isSelectingMission =
    (myMember?.candidates && myMember.candidates.length > 0) ||
    (isHost && currentPlayer.candidates && currentPlayer.candidates.length > 0 && currentPlayer.id !== userId);

  const isSelectingMyPartner =
    myMember?.selectingPartner || (isHost && currentPlayer.selectingPartner && currentPlayer.id !== userId);

  const isSelectingTarget = canSelect && currentPlayer.selectingTarget;

  const displayCandidates =
    isHost && currentPlayer.candidates?.length > 0 && currentPlayer.id !== userId ? currentPlayer.candidates : myMember?.candidates;

  const isAnyoneSelectingMission = currentPlayer.candidates && currentPlayer.candidates.length > 0;
  const isAnyoneSelectingTarget = currentPlayer.selectingTarget;
  const isAnyoneSelectingPartnerNow =
    (currentEventKey === EVENT_TYPES.DUET && !currentPlayer.duetPartnerId) || currentPlayer.selectingPartner;

  const isEventSelectionWithoutCandidates =
    currentEventKey === EVENT_TYPES.SELECTION && (!currentPlayer.candidates || currentPlayer.candidates.length === 0) && !currentPlayer.challenge;

  const isEventDuetWithoutPartner =
    currentEventKey === EVENT_TYPES.DUET && !currentPlayer.duetPartnerId && !currentPlayer.selectingPartner;

  const isInteractionLocked =
    isAnyoneSelectingMission ||
    isAnyoneSelectingTarget ||
    isAnyoneSelectingPartnerNow ||
    showJackpot ||
    isEventSelectionWithoutCandidates ||
    isEventDuetWithoutPartner;

  const stateText = isAnyoneSelectingTarget
    ? 'CHOOSING TARGET...'
    : isAnyoneSelectingPartnerNow || isEventDuetWithoutPartner
      ? 'CHOOSING PARTNER...'
      : isAnyoneSelectingMission || isEventSelectionWithoutCandidates
        ? 'CHOOSING MISSION...'
        : null;

  const partnerName =
    currentEventKey === EVENT_TYPES.DUET && currentPlayer.duetPartnerId
      ? members.find((m) => m.id === currentPlayer.duetPartnerId)?.name
      : null;

  const reorderedMembers = [...rankedMembers.slice(safeCurrentIndex), ...rankedMembers.slice(0, safeCurrentIndex)];
  const isButtonsDisabled = !!activeActionLog;

  return (
    <div className="w-full h-[100dvh] text-white overflow-hidden flex flex-col md:flex-row relative bg-[#0f172a]">
      <Toast messages={messages} onRemove={removeToast} />

      <AnimatePresence>
        {activeActionLog && <ActionOverlay actionLog={activeActionLog} onClose={() => setActiveActionLog(null)} />}
      </AnimatePresence>

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

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />

      <EventGuideModal isOpen={showGuideModal} onClose={() => setShowGuideModal(false)} />

      {/* ★代理操作モーダル */}
      <AnimatePresence>
        {proxyTarget && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setProxyTarget(null)}
            />

            {/* DESTINY CHOICE PROXY UI */}
            {proxyTarget.candidates && proxyTarget.candidates.length > 0 && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative z-[170] w-full max-w-4xl flex flex-col items-center gap-2 md:gap-4 h-full md:justify-center pointer-events-auto"
              >
                <div className="flex-none text-center">
                  <h2 className="text-2xl md:text-5xl font-black text-yellow-400 italic tracking-tighter drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">
                    DESTINY CHOICE
                  </h2>
                  <p className="text-yellow-200 font-bold text-sm tracking-widest mt-1 uppercase">PROXY FOR: {proxyTarget.name}</p>
                </div>

                <div className="w-full flex-1 overflow-y-auto min-h-0 custom-scrollbar px-1 pb-2 md:overflow-visible md:h-auto">
                  <div className="flex flex-col md:grid md:grid-cols-3 gap-2 md:gap-4 w-full">
                    {proxyTarget.candidates.map((cand: any, idx: number) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.05, borderColor: '#facc15' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleMissionSelectedWrapper(cand, proxyTarget.id)}
                        className="bg-black/80 backdrop-blur-md border border-white/20 hover:bg-yellow-900/40 p-4 md:p-6 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-2 transition-colors min-h-[100px] md:min-h-[160px] shrink-0"
                      >
                        <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">
                          OPTION {idx + 1}
                        </div>
                        <h3 className="font-bold text-white text-base md:text-xl leading-tight break-all">{cand.title}</h3>
                        <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5">{cand.criteria}</p>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setProxyTarget(null)}
                  className="mt-2 px-8 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-gray-400 font-bold text-xs tracking-widest"
                >
                  CANCEL PROXY
                </button>
              </motion.div>
            )}

            {/* DUET CHANCE PROXY UI */}
            {proxyTarget.selectingPartner && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative z-[170] w-full max-w-lg bg-black/80 border border-cyan-500 rounded-2xl md:p-6 shadow-[0_0_50px_rgba(6,182,212,0.4)] flex flex-col h-[80vh] md:h-auto overflow-hidden pointer-events-auto"
              >
                <div className="flex-none p-4 pb-0 md:p-0 text-center md:mb-4">
                  <h2 className="text-xl md:text-2xl font-black text-cyan-400 tracking-widest italic">DUET CHANCE</h2>
                  <p className="text-cyan-200 font-bold text-xs tracking-widest mt-1 uppercase">PROXY FOR: {proxyTarget.name}</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-0 min-h-0">
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    {members
                      .filter((m) => m.id !== proxyTarget.id)
                      .map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handlePlayerSelectedWrapper(m.id, 'DUET', proxyTarget.id)}
                          className="p-2 md:p-4 rounded-xl bg-gray-900 border border-white/10 hover:bg-cyan-900/50 hover:border-cyan-500 transition-all flex flex-col items-center gap-1 md:gap-2 group"
                        >
                          <div className="text-2xl md:text-3xl group-hover:scale-110 transition-transform">{m.avatar}</div>
                          <div className="font-bold text-white text-xs md:text-sm truncate w-full text-center">{m.name}</div>
                          <div className="text-cyan-300 font-mono text-[10px] md:text-xs">{(m.score || 0).toLocaleString()} pt</div>
                        </button>
                      ))}
                  </div>
                </div>

                <div className="flex-none p-4 pt-2 md:p-0 md:pt-4 text-center">
                  <button
                    onClick={() => setProxyTarget(null)}
                    className="px-8 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-gray-400 font-bold text-xs tracking-widest"
                  >
                    CANCEL PROXY
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
        {/* Header */}
        <div className="flex-none h-14 md:h-20 flex items-center justify-between px-2 md:px-6 border-b border-white/10 bg-black/20 backdrop-blur-md overflow-hidden gap-2">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 overflow-hidden">
            <div className="flex-none w-8 h-8 md:w-12 md:h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-lg md:text-2xl shadow-[0_0_15px_cyan] border border-white/20 font-bold">
              <span className="text-white drop-shadow-md">
                {currentPlayer.rank}
                <span className="text-[0.6em] align-top">th</span>
              </span>
            </div>
            <div className="min-w-0 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-red-500 rounded-full animate-pulse flex-none" />
                <p className="text-[8px] md:text-[10px] text-cyan-400 font-mono tracking-widest font-bold whitespace-nowrap">NOW SINGING</p>
                <span className="text-[8px] md:text-[10px] text-gray-500 font-mono whitespace-nowrap">ID: {roomId}</span>
              </div>
              <motion.p
                key={currentPlayer.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-white font-black leading-none truncate drop-shadow-md text-base md:text-[clamp(1.5rem,3vw,3rem)]"
              >
                {currentPlayer.name}
              </motion.p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-none">
            <button
              onClick={() => setShowGuideModal(true)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 hover:bg-cyan-900/30 hover:border-cyan-500 transition-all active:scale-95 group"
            >
              <span className="text-lg md:text-xl group-hover:drop-shadow-[0_0_5px_cyan]">📖</span>
            </button>

            <div className="text-right flex-none flex flex-col items-end gap-0.5 md:gap-1 pl-1">
              <div className="flex flex-col items-end">
                <p className="text-[7px] md:text-[8px] text-gray-400 font-mono tracking-widest leading-none">SCORE</p>
                <motion.p
                  key={currentPlayer.score || 0}
                  initial={{ scale: 1.2, color: '#22d3ee' }}
                  animate={{ scale: 1, color: '#ffffff' }}
                  className="text-base md:text-2xl font-black font-mono leading-none"
                >
                  {(currentPlayer.score || 0).toLocaleString()}
                </motion.p>
              </div>

              <div className="bg-white/5 px-2 py-0.5 md:px-3 md:py-0.5 rounded-lg border border-white/10">
                <div className="flex items-baseline gap-1 md:gap-2">
                  <span className="text-[7px] md:text-[8px] text-gray-400 font-mono">TURN</span>
                  <span className="text-sm md:text-lg font-bold text-white/90 font-mono leading-none">
                    #{String(turnCount).padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-2 md:p-4 relative w-full overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-[120%] aspect-square border border-cyan-500/20 rounded-full animate-[spin_20s_linear_infinite] max-h-[500px]" />
          </div>

          <AnimatePresence mode="wait">
            {isSelectingMission && displayCandidates ? (
              <motion.div
                key="selection-ui"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="relative z-20 w-full max-w-4xl flex flex-col items-center gap-2 md:gap-4 h-full md:justify-center"
              >
                <div className="flex-none text-center pt-2 md:pt-0">
                  <h2 className="text-2xl md:text-5xl font-black text-yellow-400 italic tracking-tighter drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">
                    DESTINY CHOICE
                  </h2>
                  {isHost && currentPlayer.candidates?.length > 0 && currentPlayer.id !== userId ? (
                    <p className="text-[10px] md:text-sm font-bold text-red-400 tracking-widest mt-1 bg-red-900/50 px-3 py-1 rounded-full border border-red-500 animate-pulse">
                      HOST OVERRIDE
                    </p>
                  ) : (
                    <p className="text-[10px] md:text-sm font-bold text-white tracking-widest mt-1">ミッションを選択してください</p>
                  )}
                </div>

                <div className="w-full flex-1 overflow-y-auto min-h-0 custom-scrollbar px-1 pb-2 md:overflow-visible md:h-auto">
                  <div className="flex flex-col md:grid md:grid-cols-3 gap-2 md:gap-4 w-full">
                    {displayCandidates.map((cand: any, idx: number) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.05, borderColor: '#facc15' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleMissionSelectedWrapper(cand)}
                        className="bg-black/80 backdrop-blur-md border border-white/20 hover:bg-yellow-900/40 p-4 md:p-6 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-2 transition-colors min-h-[100px] md:min-h-[160px] shrink-0"
                      >
                        <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">
                          OPTION {idx + 1}
                        </div>
                        <h3 className="font-bold text-white text-base md:text-xl leading-tight break-all">{cand.title}</h3>
                        <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5">{cand.criteria}</p>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : isSelectingMyPartner ? (
              <motion.div
                key="duet-ui"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="relative z-20 w-full max-w-lg bg-black/80 border border-cyan-500 rounded-2xl md:p-6 shadow-[0_0_50px_rgba(6,182,212,0.4)] flex flex-col h-full md:h-auto md:max-h-[80vh] overflow-hidden"
              >
                <div className="flex-none p-4 pb-0 md:p-0 text-center md:mb-4">
                  <h2 className="text-xl md:text-2xl font-black text-cyan-400 tracking-widest italic">DUET CHANCE</h2>
                  {isHost && currentPlayer.selectingPartner && currentPlayer.id !== userId ? (
                    <p className="text-red-400 text-[10px] md:text-xs font-mono mt-1">ホスト代理操作: パートナー指名</p>
                  ) : (
                    <p className="text-gray-300 text-[10px] md:text-xs font-mono mt-1">パートナーを指名してください！</p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-0 min-h-0">
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    {members
                      .filter(
                        (m) =>
                          m.id !==
                          (isHost && currentPlayer.selectingPartner && currentPlayer.id !== userId ? currentPlayer.id : userId)
                      )
                      .map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handlePlayerSelectedWrapper(m.id, 'DUET')}
                          className="p-2 md:p-4 rounded-xl bg-gray-900 border border-white/10 hover:bg-cyan-900/50 hover:border-cyan-500 transition-all flex flex-col items-center gap-1 md:gap-2 group"
                        >
                          <div className="text-2xl md:text-3xl group-hover:scale-110 transition-transform">{m.avatar}</div>
                          <div className="font-bold text-white text-xs md:text-sm truncate w-full text-center">{m.name}</div>
                          <div className="text-cyan-300 font-mono text-[10px] md:text-xs">{(m.score || 0).toLocaleString()} pt</div>
                        </button>
                      ))}
                  </div>
                </div>
              </motion.div>
            ) : isSelectingTarget ? (
              <motion.div
                key="target-ui"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="relative z-20 w-full max-w-lg bg-black/80 border border-emerald-500 rounded-2xl md:p-6 shadow-[0_0_50px_rgba(16,185,129,0.4)] flex flex-col h-full md:h-auto md:max-h-[80vh] overflow-hidden"
              >
                <div className="flex-none p-4 pb-0 md:p-0 text-center md:mb-4">
                  <h2 className="text-xl md:text-2xl font-black text-emerald-400 tracking-widest italic">SELECT TARGET</h2>
                  {/* ✅ isMyTurn 定義済みなので白画面にならない */}
                  {isHost && !isMyTurn && <p className="text-red-400 font-bold text-[9px] md:text-xs animate-pulse">HOST OVERRIDE</p>}
                  <p className="text-gray-300 text-[10px] md:text-xs font-mono mt-1">誰から1000ポイント奪いますか？</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-0 min-h-0">
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    {currentPlayer &&
                      members
                        .filter((m) => m.id !== currentPlayer.id)
                        .map((m) => (
                          <button
                            key={m.id}
                            onClick={() => handlePlayerSelectedWrapper(m.id, 'TARGET')}
                            className="p-2 md:p-4 rounded-xl bg-gray-900 border border-white/10 hover:bg-emerald-900/50 hover:border-emerald-500 transition-all flex flex-col items-center gap-1 md:gap-2 group"
                          >
                            <div className="text-2xl md:text-3xl group-hover:scale-110 transition-transform">{m.avatar}</div>
                            <div className="font-bold text-white text-xs md:text-sm truncate w-full text-center">{m.name}</div>
                            <div className="text-emerald-300 font-mono text-[10px] md:text-xs">{(m.score || 0).toLocaleString()} pt</div>
                          </button>
                        ))}
                  </div>
                </div>
              </motion.div>
            ) : !isTransitioning ? (
              <MissionDisplay
                key={currentPlayer.id + turnCount}
                title={currentChallenge.title}
                criteria={currentChallenge.criteria}
                eventData={currentEventData}
                isLocked={isInteractionLocked}
                partnerName={partnerName}
                stateText={stateText}
              />
            ) : null}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex-none px-2 pb-2 md:pb-12 pt-1 bg-gradient-to-t from-black/90 to-transparent z-20 w-full">
          <div className="flex gap-2 md:gap-6 w-full max-w-5xl mx-auto h-12 md:h-24">
            {!isInteractionLocked ? (
              canControl ? (
                <>
                  <button
                    disabled={isButtonsDisabled}
                    onClick={() => triggerNextTurn('FAILED')}
                    className="flex-1 rounded-xl bg-[#1e293b]/80 backdrop-blur-sm border border-[#334155] text-gray-400 font-black text-sm md:text-2xl tracking-widest active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    FAILED
                  </button>
                  <button
                    disabled={isButtonsDisabled}
                    onClick={() => triggerNextTurn('CLEAR')}
                    className="flex-[2] rounded-xl bg-gradient-to-r from-cyan-600/90 to-blue-600/90 backdrop-blur-sm border-0 text-white font-black text-lg md:text-4xl italic tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="relative z-10">CLEAR!!</span>
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/40 border border-white/10 rounded-xl backdrop-blur-md">
                  <p className="text-gray-400 font-mono text-[10px] md:text-base tracking-widest animate-pulse">WAITING FOR RESULT...</p>
                </div>
              )
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center border rounded-xl backdrop-blur-md px-2 ${
                  isAnyoneSelectingTarget
                    ? 'bg-emerald-900/20 border-emerald-500/30'
                    : isAnyoneSelectingPartnerNow || isEventDuetWithoutPartner
                      ? 'bg-cyan-900/20 border-cyan-500/30'
                      : 'bg-yellow-900/20 border-yellow-500/30'
                }`}
              >
                <p
                  className={`${
                    isAnyoneSelectingTarget
                      ? 'text-emerald-400'
                      : isAnyoneSelectingPartnerNow || isEventDuetWithoutPartner
                        ? 'text-cyan-400'
                        : 'text-yellow-400'
                  } font-bold animate-pulse tracking-widest flex items-center gap-2 text-[10px] md:text-base whitespace-nowrap`}
                >
                  <span
                    className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${
                      isAnyoneSelectingTarget
                        ? 'bg-emerald-400'
                        : isAnyoneSelectingPartnerNow || isEventDuetWithoutPartner
                          ? 'bg-cyan-400'
                          : 'bg-yellow-400'
                    }`}
                  />
                  {showJackpot
                    ? 'JACKPOT TIME!!'
                    : isAnyoneSelectingTarget
                      ? 'SELECTING TARGET...'
                      : isAnyoneSelectingPartnerNow || isEventDuetWithoutPartner
                        ? 'SELECTING PARTNER...'
                        : 'CHOOSING MISSION...'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile List */}
        <div className="md:hidden w-full bg-black/80 backdrop-blur-md border-t border-white/10 p-1.5 pb-4 flex flex-col gap-1 flex-none">
          <div className="flex justify-between items-center px-1">
            <span className="text-[8px] font-bold text-gray-500 tracking-widest">NEXT SINGERS</span>
            {isHost && (
              <button
                onClick={() => setShowFinishModal(true)}
                className="text-[8px] text-red-400 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-900/30"
              >
                FINISH
              </button>
            )}
          </div>

          <div ref={mobileListRef} className="flex overflow-x-auto gap-2 pb-1 custom-scrollbar snap-x">
            {reorderedMembers.map((member, index) => {
              const isCurrent = index === 0;
              const isGuest = member.id.startsWith('guest_');
              const isOffline = offlineUsers.has(member.id);
              const isOfflineDisplay = isOffline && !isGuest;
              const evt = member.event ? GAME_EVENTS[member.event] : null;

              const needsSelection = (member.candidates && member.candidates.length > 0) || member.selectingPartner;
              const canProxy = isHost && isOffline && needsSelection;
              const canGuestSelect = isHost && isGuest && needsSelection;

              return (
                <div
                  key={member.id}
                  className={`snap-start flex-none w-28 bg-white/5 border ${
                    isCurrent ? 'border-cyan-500 bg-cyan-900/20' : 'border-white/10'
                  } rounded-lg p-1.5 flex flex-col gap-0.5 relative overflow-hidden ${isOfflineDisplay ? 'grayscale opacity-70' : ''}`}
                >
                  {isCurrent && <div className="absolute top-0 right-0 bg-cyan-500 text-black text-[6px] font-bold px-1 py-0.5 rounded-bl">NOW</div>}
                  {isGuest && <div className="absolute top-0 left-0 bg-purple-600 text-white text-[6px] font-bold px-1 py-0.5 rounded-br">GUEST</div>}

                  <div className="flex items-center gap-1">
                    <div className="text-sm">{member.avatar}</div>
                    <div className={`text-[9px] font-bold truncate flex-1 ${isCurrent ? 'text-white' : 'text-gray-400'}`}>{member.name}</div>
                  </div>

                  <div className="h-[1px] bg-white/10 w-full my-0.5" />

                  <div className="flex justify-between items-center text-[8px] font-mono text-gray-400">
                    <span>{member.rank}th</span>
                    <span>{member.score?.toLocaleString()}</span>
                  </div>

                  <div className="flex flex-col gap-0 mt-0.5">
                    {evt ? (
                      <div
                        className="text-[6px] font-bold truncate px-1 rounded"
                        style={{ backgroundColor: `${evt.color}20`, color: evt.color, border: `1px solid ${evt.color}40` }}
                      >
                        ★ {evt.name}
                      </div>
                    ) : (
                      <div className="text-[6px] text-gray-600 truncate">-</div>
                    )}
                    <div className="text-[7px] text-cyan-200 font-bold truncate leading-tight mt-0.5">{member.challenge?.title || '...'}</div>
                  </div>

                  {isOfflineDisplay && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-red-500 font-bold backdrop-blur-[1px]">
                      OFFLINE
                    </div>
                  )}

                  {/* Real Proxy Button (Yellow) */}
                  {canProxy && !canGuestSelect && (
                    <button
                      onClick={() => setProxyTarget(member)}
                      className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm z-10 border-2 border-yellow-400 animate-pulse text-yellow-400 hover:bg-yellow-400 hover:text-black transition-colors"
                    >
                      <span className="text-xl">⚡</span>
                      <span className="text-[8px] font-black tracking-tighter">PROXY</span>
                    </button>
                  )}

                  {/* Guest Select Button (Cyan) */}
                  {canGuestSelect && (
                    <button
                      onClick={() => setProxyTarget(member)}
                      className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm z-10 border-2 border-cyan-400 animate-pulse text-cyan-400 hover:bg-cyan-400 hover:text-black transition-colors"
                    >
                      <span className="text-xl">👆</span>
                      <span className="text-[8px] font-black tracking-tighter">SELECT</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop List */}
      <div className="hidden md:flex w-[300px] lg:w-[360px] flex-none bg-black/60 backdrop-blur-xl border-l border-white/10 flex-col relative z-20 shadow-2xl">
        <div className="p-4 md:p-6 border-b border-white/10 bg-white/5 flex-none">
          <h3 className="text-xs md:text-sm font-bold text-white tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            RESERVATION LIST
          </h3>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">TOTAL: {members.length} MEMBERS</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
          {reorderedMembers.map((member, index) => {
            const isCurrent = index === 0;
            const challenge = member.challenge || { title: '...', criteria: '...' };
            const isGuest = member.id.startsWith('guest_');
            const isOffline = offlineUsers.has(member.id);
            const isOfflineDisplay = isOffline && !isGuest;
            const evt = member.event ? GAME_EVENTS[member.event] : null;

            const needsSelection = (member.candidates && member.candidates.length > 0) || member.selectingPartner;
            const canProxy = isHost && isOffline && needsSelection;
            const canGuestSelect = isHost && isGuest && needsSelection;

            return (
              <motion.div
                layout
                key={member.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: isOfflineDisplay ? 0.5 : 1 }}
                transition={{ duration: 0.3 }}
                className={`p-3 rounded-xl relative overflow-hidden group transition-all shrink-0 border ${
                  isCurrent ? 'bg-cyan-900/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-black/40 border-white/10 hover:border-white/30'
                } ${isOfflineDisplay ? 'grayscale opacity-70' : ''}`}
              >
                <div className="absolute top-0 right-0 bg-white/10 px-2 py-0.5 rounded-bl-lg text-[9px] font-mono text-gray-400">
                  {isCurrent ? 'NOW' : 'NEXT'}
                </div>

                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center text-lg relative">
                    {member.avatar}
                    {evt && !isCurrent && <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-500 border border-black animate-pulse shadow-[0_0_10px_yellow]" />}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-gray-400'}`}>{member.name}</span>
                      {isGuest && <span className="text-[9px] bg-purple-600 text-white px-1.5 rounded font-bold">GUEST</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-yellow-500 font-bold">{member.rank}th</span>
                      <span className="text-gray-500">|</span>
                      <span className="text-cyan-300">{(member.score || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {isOfflineDisplay && <span className="ml-auto text-[9px] bg-red-900 text-red-300 px-1 rounded">OFFLINE</span>}

                  {/* PROXY Button (Yellow) */}
                  {canProxy && !canGuestSelect && (
                    <button
                      onClick={() => setProxyTarget(member)}
                      className="ml-auto px-3 py-1.5 rounded bg-yellow-400 text-black font-black text-[10px] animate-pulse border-2 border-yellow-200 shadow-[0_0_10px_yellow] hover:scale-110 transition-transform z-10 flex items-center gap-1"
                    >
                      ⚡ PROXY
                    </button>
                  )}

                  {/* Guest Select Button (Cyan) */}
                  {canGuestSelect && (
                    <button
                      onClick={() => setProxyTarget(member)}
                      className="ml-auto px-3 py-1.5 rounded bg-cyan-500 text-black font-black text-[10px] animate-pulse border-2 border-cyan-200 shadow-[0_0_10px_cyan] hover:scale-110 transition-transform z-10 flex items-center gap-1"
                    >
                      👆 SELECT
                    </button>
                  )}
                </div>

                {evt && (
                  <div className="mb-2 px-2 py-1 rounded bg-black/40 border border-white/5 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: evt.color }} />
                    <span className="text-[9px] font-bold tracking-wider" style={{ color: evt.color }}>
                      {evt.name}
                    </span>
                  </div>
                )}

                <div className="bg-black/40 rounded-lg p-2 border-l-2 border-cyan-500/50">
                  <p className={`text-[10px] font-bold leading-tight mb-1 ${isCurrent ? 'text-cyan-200' : 'text-gray-300'}`}>{challenge.title}</p>
                  <div className="flex items-center gap-1 opacity-70">
                    <span className="w-1 h-1 rounded-full bg-red-400" />
                    <p className="text-[9px] text-gray-400 font-mono leading-tight">{challenge.criteria}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div className="h-4" />
        </div>

        {isHost && (
          <div className="p-4 pb-8 md:pb-10 border-t border-white/10 bg-black/40 flex-none">
            <button
              onClick={() => setShowFinishModal(true)}
              className="w-full py-3 md:py-4 rounded-xl border-2 border-red-500/30 text-red-400 font-bold tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2 group text-sm"
            >
              GAME FINISH
            </button>
          </div>
        )}
      </div>

      {/* Finish Modal */}
      <AnimatePresence>
        {showFinishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowFinishModal(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1"
            >
              <div className="bg-black/40 rounded-xl p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">
                  🏁
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest mb-2">FINISH GAME?</h2>
                  <p className="text-gray-400 text-sm font-mono">ゲームを終了して結果発表へ移動しますか？</p>
                </div>
                <div className="flex w-full gap-3 mt-2">
                  <button
                    onClick={() => setShowFinishModal(false)}
                    className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={confirmFinish}
                    className="flex-1 py-4 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]"
                  >
                    YES, FINISH
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Host Missing */}
      <AnimatePresence>
        {!isHost && isHostMissing && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/95 backdrop-blur-xl" />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#0f172a] border border-orange-500/50 rounded-2xl shadow-[0_0_50px_rgba(249,115,22,0.3)] p-1 z-50"
            >
              <div className="bg-gradient-to-b from-orange-900/40 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="text-4xl animate-bounce">📡</div>
                <div>
                  <h2 className="text-xl font-black text-orange-400 tracking-widest">WAITING FOR HOST</h2>
                  <p className="text-gray-400 text-sm font-mono mt-2 leading-relaxed">
                    ホストとの接続が確認できません。
                    <br />
                    再接続を待機しています...
                  </p>
                </div>
                <div className="w-full mt-2">
                  <button
                    onClick={handleForceLeave}
                    className="w-full py-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold tracking-widest text-xs"
                  >
                    LEAVE ROOM
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
