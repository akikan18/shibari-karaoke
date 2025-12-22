import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- Firebase ---
import { doc, onSnapshot, updateDoc, deleteDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
// --- Hooks & Components ---
import { usePresence } from '../hooks/usePresence';
import { useWakeLock } from '../hooks/useWakeLock';
import { Toast, useToast } from '../components/Toast';

// ★追加: アバターリスト（Entranceと同じもの）
const AVATARS = ['🎤', '🎸', '🎹', '🥁', '🎷', '🎧', '👑', '🎩', '🐶', '🐱', '🦁', '🐼', '🐯', '👽', '👻', '🤖'];

const shuffleArray = (array: any[]) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// --- 演出設定定数 ---
const TIME_SPIN = 800;          
const TIME_LOCK = 1200;         
const TIME_LIST_WAIT = 4000;    
const TIME_GAME_START = 5000;   

// --- EliminationRouletteOverlay (スマホ・レスポンシブ完全対応版) ---
// --- EliminationRouletteOverlay (文字切れ修正・完全版) ---
const EliminationRouletteOverlay = ({ finalMembers }: { finalMembers: any[] }) => {
  const [confirmedList, setConfirmedList] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [displayAvatar, setDisplayAvatar] = useState('?');
  const [displayName, setDisplayName] = useState('');
  const [phase, setPhase] = useState('init');
  const phaseRef = useRef('init');
  const roundRef = useRef(0);

  const setPhaseSafe = (newPhase: string) => { setPhase(newPhase); phaseRef.current = newPhase; };

  useEffect(() => { if (finalMembers.length > 0 && phaseRef.current === 'init') { setPhaseSafe('spinning'); spinLoop(); } }, [finalMembers]);

  const spinLoop = () => {
    if (phaseRef.current !== 'spinning') return;
    const round = roundRef.current;
    if (round >= finalMembers.length) { setPhaseSafe('finished'); startFinishSequence(); return; }
    
    const targetMember = finalMembers[round];
    const candidates = finalMembers.slice(round);

    if (candidates.length <= 1) {
      setDisplayAvatar(targetMember.avatar);
      setDisplayName(targetMember.name);
      lockAndNext(targetMember);
      return;
    }

    let elapsed = 0;
    const tick = 60;
    const runTick = () => {
      const candidatesList = candidates.length > 0 ? candidates : finalMembers; // フォールバック
      const random = candidatesList[Math.floor(Math.random() * candidatesList.length)];
      if (random) {
        setDisplayAvatar(random.avatar);
        setDisplayName("Scanning...");
      }
      elapsed += tick;
      if (elapsed >= TIME_SPIN) {
        setDisplayAvatar(targetMember.avatar);
        setDisplayName(targetMember.name);
        lockAndNext(targetMember);
      } else {
        setTimeout(runTick, tick);
      }
    };
    runTick();
  };

  const lockAndNext = (member: any) => {
    setPhaseSafe('locked');
    setTimeout(() => {
      setConfirmedList(prev => {
        if (prev.find(m => m.id === member.id)) return prev;
        return [...prev, member];
      });
      roundRef.current += 1;
      setCurrentRound(roundRef.current);
      setPhaseSafe('spinning');
      setTimeout(spinLoop, 50);
    }, TIME_LOCK);
  };

  const startFinishSequence = () => { setTimeout(() => { setPhaseSafe('gamestart'); }, TIME_LIST_WAIT); };

  const containerVariants = {
    init: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const glitchVariants = {
    hidden: { opacity: 0, scale: 2, filter: "blur(10px)" },
    visible: { 
      opacity: 1, scale: 1, filter: "blur(0px)",
      transition: { type: "spring", stiffness: 300, damping: 20 }
    },
    exit: { scale: 5, opacity: 0, filter: "blur(20px)", transition: { duration: 0.3 } }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="init" animate="visible" exit="exit"
      className="fixed inset-0 z-[200] flex flex-col items-center bg-black overflow-hidden font-sans"
    >
      {/* 背景エフェクト */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black"></div>
      <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] mix-blend-overlay"></div>
      
      {/* 決定時のフラッシュ */}
      <AnimatePresence>
        {phase === 'locked' && (
          <motion.div
            initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-cyan-500 mix-blend-overlay z-10 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* GAME START演出 (文字切れ対策済み) */}
      <AnimatePresence>
        {phase === 'gamestart' && (
          <motion.div
            initial="hidden" animate="visible" exit="exit"
            className="absolute inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm overflow-hidden"
          >
            {/* 左右にパディングを持たせて文字切れを防止 */}
            <div className="relative w-full max-w-full px-8 text-center">
              {/* 背景の爆発光 */}
              <motion.div 
                initial={{ scale: 0 }} animate={{ scale: [0, 1.5, 3], opacity: [1, 0.5, 0] }} 
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute inset-0 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-cyan-500 rounded-full blur-[60px] md:blur-[100px] w-full h-full opacity-50 pointer-events-none"
              />
              
              <div className="relative z-10 flex flex-col items-center justify-center">
                 {/* GAME */}
                 <motion.h1 
                  variants={glitchVariants}
                  // テキストサイズを微調整: text-5xl(スマホ) -> text-9xl(PC)
                  // lg:text-9xl は画面幅が広いときのみ適用
                  className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] leading-none select-none"
                 >
                   GAME
                 </motion.h1>
                 
                 {/* START */}
                 {/* pr-2 (padding-right) を追加してイタリック体の右上が切れるのを防ぐ */}
                 <motion.h1 
                  variants={glitchVariants}
                  transition={{ delay: 0.1 }}
                  className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 drop-shadow-[0_0_30px_rgba(6,182,212,0.8)] leading-none mt-2 md:mt-4 select-none pr-4"
                 >
                   START
                 </motion.h1>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ルーレットメイン画面 */}
      {phase !== 'gamestart' && phase !== 'init' && (
        <div className="relative z-20 w-full h-full max-w-md mx-auto flex flex-col p-4 md:p-6">
          
          {/* 上部: 状況ヘッダー */}
          <div className="flex-none h-16 md:h-20 flex flex-col items-center justify-center shrink-0">
            {phase !== 'finished' ? (
              <>
                <motion.div 
                  initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                  className="text-cyan-500 font-mono tracking-[0.5em] text-[10px] md:text-xs mb-1 border-b border-cyan-500/30 pb-1"
                >
                  DECIDING TURN ORDER
                </motion.div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg md:text-xl text-gray-500 font-black italic">#</span>
                  <motion.span 
                    key={currentRound}
                    initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="text-4xl md:text-6xl font-black text-white italic tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                  >
                    {currentRound + 1}
                  </motion.span>
                </div>
              </>
            ) : (
              <motion.h2 
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="text-yellow-400 font-black tracking-widest text-2xl md:text-4xl drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]"
              >
                ORDER FIXED
              </motion.h2>
            )}
          </div>

          {/* 中部: アバターサークル */}
          {phase !== 'finished' && (
            <div className="flex-none flex flex-col items-center justify-center py-4 md:py-8 shrink-0">
              <div className="relative flex items-center justify-center">
                {/* 装飾リング */}
                <motion.div 
                  animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="absolute w-40 h-40 md:w-56 md:h-56 border border-white/10 rounded-full border-dashed"
                />
                <motion.div 
                  animate={{ rotate: -360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                  className="absolute w-32 h-32 md:w-48 md:h-48 border border-cyan-500/20 rounded-full"
                />

                {/* アバター表示部 */}
                <motion.div
                  key={phase === 'locked' ? 'locked' : 'spinning'}
                  animate={phase === 'locked' 
                    ? { scale: [1, 1.1, 1], borderColor: '#22d3ee', boxShadow: ["0 0 0px #22d3ee", "0 0 30px #22d3ee", "0 0 10px #22d3ee"] } 
                    : { scale: [1, 0.98, 1], borderColor: 'rgba(255,255,255,0.1)' }
                  }
                  transition={phase === 'spinning' ? { duration: 0.1, repeat: Infinity } : { duration: 0.4 }}
                  className="relative w-28 h-28 md:w-40 md:h-40 rounded-full border-4 flex items-center justify-center overflow-hidden bg-black/50 backdrop-blur-md z-10"
                >
                  <AnimatePresence mode='wait'>
                    <motion.div
                      key={`${displayAvatar}-${phase}`}
                      initial={phase === 'spinning' ? { y: 20, opacity: 0, filter: 'blur(5px)' } : { scale: 2, opacity: 0 }}
                      animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      exit={phase === 'spinning' ? { y: -20, opacity: 0, filter: 'blur(5px)' } : { opacity: 0 }}
                      transition={{ duration: phase === 'spinning' ? 0.05 : 0.2 }}
                      className="text-5xl md:text-7xl select-none"
                    >
                      {displayAvatar}
                    </motion.div>
                  </AnimatePresence>
                  
                  {phase === 'spinning' && (
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent animate-pulse"></div>
                  )}
                </motion.div>
              </div>

              {/* ネームプレート */}
              <div className="h-10 md:h-12 mt-4 flex items-center justify-center w-full px-4">
                {phase === 'locked' ? (
                  <motion.div 
                    initial={{ scale: 0.5, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-cyan-900/80 border border-cyan-400/50 px-4 py-1 md:px-6 md:py-2 rounded text-lg md:text-xl font-black text-white tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.4)] truncate max-w-full"
                  >
                    {displayName}
                  </motion.div>
                ) : (
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <motion.div 
                        key={i} 
                        animate={{ height: [8, 16, 8], opacity: [0.5, 1, 0.5] }} 
                        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                        className="w-1 bg-cyan-500 rounded-full"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 下部: 確定リスト (スクロール領域確保) */}
          <motion.div 
            layout
            className="flex-1 min-h-0 flex flex-col mt-2 md:mt-4 bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm"
          >
            <div className="flex-none p-2 border-b border-white/10 bg-black/40 text-[10px] md:text-xs text-gray-400 font-mono tracking-widest text-center">
              CONFIRMED ORDER LIST
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
              <AnimatePresence initial={false}>
                {confirmedList.map((member, index) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={`flex items-center gap-3 p-2 md:p-3 rounded border-l-4 relative overflow-hidden group shrink-0 ${
                      index === 0 
                        ? 'border-yellow-400 bg-gradient-to-r from-yellow-900/40 to-black/60' 
                        : 'border-cyan-500 bg-gradient-to-r from-cyan-900/20 to-black/60'
                    }`}
                  >
                    <div className={`w-8 h-8 flex items-center justify-center rounded font-black text-sm shadow-lg ${
                      index === 0 ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-cyan-400 border border-white/10'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="text-2xl md:text-3xl drop-shadow-md">{member.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-sm md:text-lg leading-none truncate ${index === 0 ? 'text-yellow-200' : 'text-white'}`}>
                        {member.name}
                      </div>
                      {index === 0 && <span className="text-[10px] text-yellow-400 font-mono tracking-widest block mt-0.5">LEADER</span>}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {phase !== 'finished' && (
                <div className="py-4 flex justify-center gap-1 opacity-20">
                   {[...Array(Math.max(0, finalMembers.length - confirmedList.length))].map((_, i) => (
                     <div key={i} className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}></div>
                   ))}
                </div>
              )}
            </div>
          </motion.div>

        </div>
      )}
    </motion.div>
  );
};

export const GameSetupScreen = () => {
  const navigate = useNavigate();
  const { messages, addToast, removeToast } = useToast();
  useWakeLock();
   
  const [members, setMembers] = useState<any[]>([]); 
  const [roomId, setRoomId] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState(''); 
  const [userAvatar, setUserAvatar] = useState(''); 
  const [gameMode, setGameMode] = useState<'standard' | 'free'>('standard');
  const [roomClosed, setRoomClosed] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);

  const [showRoulette, setShowRoulette] = useState(false);
  const [finalOrderedMembers, setFinalOrderedMembers] = useState<any[]>([]);
  const isMounting = useRef(true);

  // --- プロフィール編集用ステート ---
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null); // null = 新規作成, IDあり = 編集
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState(AVATARS[0]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // ★追加: メンバー削除確認用ステート
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // --- 初期化 & 監視 ---
  useEffect(() => {
    const stored = localStorage.getItem('shibari_user_info');
    if (!stored) {
      navigate('/');
      return;
    }
    const userInfo = JSON.parse(stored);
    setRoomId(userInfo.roomId);
    setIsHost(userInfo.isHost);
    setUserId(userInfo.userId);
    setUserName(userInfo.name);
    setUserAvatar(userInfo.avatar);

    setTimeout(() => { isMounting.current = false; }, 2000);

    const roomRef = doc(db, "rooms", userInfo.roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData(data);
        setMembers(data.members || []);
        if (data.mode) setGameMode(data.mode);

        if (data.status === 'roulette') {
           setShowRoulette(true);
           if (data.members && data.members.length > 0) {
             setFinalOrderedMembers(data.members);
           }
        } else if (data.status === 'playing') {
          if (data.mode === 'free') navigate('/free');
          else navigate('/game-play');
        }

        // Firestoreの自分の情報が更新されていたらローカルStateも合わせる
        const myData = data.members?.find((m: any) => m.id === userInfo.userId);
        if (myData) {
            if (myData.name !== userName) setUserName(myData.name);
            if (myData.avatar !== userAvatar) setUserAvatar(myData.avatar);
            
            // LocalStorageも更新しておく
            const newInfo = { ...userInfo, name: myData.name, avatar: myData.avatar };
            localStorage.setItem('shibari_user_info', JSON.stringify(newInfo));
        }

      } else {
        if (!isMounting.current) {
          setRoomClosed(true);
        }
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const { offlineUsers, isHostMissing } = usePresence(roomId, userId, roomData, addToast);

  // Self Update logic (joinedAt更新)
  useEffect(() => {
    if (!roomId || !userId || !members.length) return;
    const myData = members.find(m => m.id === userId);
    if (myData) {
        const updatePresence = async () => {
            try {
                const roomRef = doc(db, "rooms", roomId);
                // 更新が必要な場合のみFirestoreへ
                if (Date.now() - (myData.joinedAt || 0) > 5000) {
                    const updatedMembers = members.map(m => {
                        if (m.id === userId) return { ...m, joinedAt: Date.now() };
                        return m;
                    });
                    await updateDoc(roomRef, { members: updatedMembers });
                }
            } catch (e) { console.error("Self-update failed", e); }
        };
        updatePresence();
    }
  }, [roomId, userId, members.length]);

  // 自動復帰ロジック
  useEffect(() => {
    if (isHost || !roomId || !userId || !roomData || roomClosed) return;
    const amIMember = members.some(m => m.id === userId);
    if (!amIMember && !isMounting.current) {
       const rejoin = async () => {
         try {
           const roomRef = doc(db, "rooms", roomId);
           const myData = {
             id: userId,
             name: userName || "Unknown",
             avatar: userAvatar || "👻",
             isHost: false,
             isReady: false,
             joinedAt: Date.now()
           };
           await updateDoc(roomRef, { members: arrayUnion(myData) });
         } catch (e) { console.error("Rejoin failed", e); }
       };
       rejoin();
    }
  }, [members, isHost, roomId, userId, roomData, roomClosed, userName, userAvatar]);

  // オフラインゲスト自動削除ロジック
  useEffect(() => {
    if (!isHost || !members.length || offlineUsers.size === 0) return;
    const now = Date.now();
    const CONNECTION_GRACE = 5000;
    const membersToKeep = [];
    let needsUpdate = false;
    let pendingKickTime = null;

    for (const member of members) {
      // 明示的に作成されたゲストは自動削除対象外にする（IDで判定）
      if (member.id.startsWith('guest_')) {
        membersToKeep.push(member);
        continue;
      }

      if (!offlineUsers.has(member.id)) {
        membersToKeep.push(member);
        continue;
      }
       
      const joinedAt = member.joinedAt || 0;
      const elapsed = now - joinedAt;
      if (elapsed > CONNECTION_GRACE) {
        needsUpdate = true;
      } else {
        membersToKeep.push(member);
        const remaining = CONNECTION_GRACE - elapsed + 100;
        if (pendingKickTime === null || remaining < pendingKickTime) {
          pendingKickTime = remaining;
        }
      }
    }

    if (needsUpdate) {
      const executeKick = async () => {
        try {
          const roomRef = doc(db, "rooms", roomId);
          await updateDoc(roomRef, { members: membersToKeep });
        } catch (error) { console.error("Auto kick failed", error); }
      };
      executeKick();
    }

    if (pendingKickTime !== null) {
      const timer = setTimeout(() => {
        setRefreshTick(prev => prev + 1);
      }, pendingKickTime);
      return () => clearTimeout(timer);
    }
  }, [isHost, offlineUsers, members, roomId]);

  const [refreshTick, setRefreshTick] = useState(0);

  // --- プロフィール編集・ゲスト追加ロジック ---

  // 編集モーダルを開く
  const openEditModal = (targetMember?: any) => {
    if (targetMember) {
      // 既存メンバー（自分またはゲスト）の編集
      setEditTargetId(targetMember.id);
      setEditName(targetMember.name);
      setEditAvatar(targetMember.avatar);
    } else {
      // 新規ゲスト追加（ホストのみ）
      setEditTargetId(null);
      setEditName('');
      setEditAvatar(AVATARS[0]);
    }
    setIsProfileModalOpen(true);
  };

  // プロフィール保存
  const handleSaveProfile = async () => {
    if (!editName.trim() || isSavingProfile) return;
    setIsSavingProfile(true);

    try {
      const roomRef = doc(db, "rooms", roomId);
      let newMembers = [...members];

      if (editTargetId) {
        // 既存更新
        newMembers = newMembers.map(m => {
          if (m.id === editTargetId) {
            return { ...m, name: editName, avatar: editAvatar };
          }
          return m;
        });
        
        // もし自分の更新ならローカルステートも即時反映
        if (editTargetId === userId) {
            setUserName(editName);
            setUserAvatar(editAvatar);
        }

      } else {
        // 新規ゲスト追加
        const newGuest = {
            id: `guest_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            name: editName,
            avatar: editAvatar,
            isHost: false,
            isReady: true, // ゲストは最初からReadyにしておく（ホスト管理のため）
            joinedAt: Date.now()
        };
        newMembers.push(newGuest);
      }

      await updateDoc(roomRef, { members: newMembers });
      setIsProfileModalOpen(false);
      addToast(editTargetId ? "プロフィールを更新しました" : "ゲストを追加しました");

    } catch (e) {
      console.error("Profile update failed", e);
      addToast("保存に失敗しました");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ★ 削除クリック（モーダルを開く）
  const handleDeleteClick = (targetId: string) => {
    setDeleteTargetId(targetId);
  };

  // ★ 削除実行（モーダルから呼ばれる）
  const executeDeleteMember = async () => {
    if (!deleteTargetId) return;
    try {
        const roomRef = doc(db, "rooms", roomId);
        const newMembers = members.filter(m => m.id !== deleteTargetId);
        await updateDoc(roomRef, { members: newMembers });
        addToast("プレイヤーを削除しました");
    } catch (e) {
        console.error("Delete failed", e);
        addToast("削除に失敗しました");
    } finally {
        setDeleteTargetId(null);
    }
  };


  const handleShare = async () => {
    const baseUrl = window.location.href.split('#')[0];
    const shareUrl = `${baseUrl}#/?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      addToast("リンクをコピーしました！");
    } catch (err) {
      addToast("コピーに失敗しました");
    }
  };
   
  const toggleReady = async () => {
    if (!roomId || !userId) return;
    try {
      const newMembers = members.map(m => {
        if (m.id === userId) return { ...m, isReady: !m.isReady };
        return m;
      });
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, { members: newMembers });
    } catch (error) { console.error(error); }
  };

  const allReady = members.length > 0 && members.every(m => m.isReady);

  const handleStart = async () => {
    if (!roomId) return;
    try {
      const themesRef = doc(db, "system", "themes");
      const themesSnap = await getDoc(themesRef);
      if (!themesSnap.exists() || !themesSnap.data().list || themesSnap.data().list.length === 0) {
        addToast("エラー：お題が見つかりません");
        return;
      }
       
      const pool = themesSnap.data().list;
      let deck = shuffleArray(pool);
      const shuffledMembers = shuffleArray(members);

      const membersWithChallenge = shuffledMembers.map(m => {
        if (deck.length === 0) deck = shuffleArray(pool);
        const challenge = deck.pop();
        return { ...m, challenge: challenge };
      });

      const roomRef = doc(db, "rooms", roomId);
       
      await updateDoc(roomRef, { 
        members: membersWithChallenge, 
        themePool: pool, 
        deck: deck,        
        status: 'roulette', 
        currentTurnIndex: 0, 
        turnCount: 1
      });

      const playerCount = members.length;
      const rouletteTime = (Math.max(0, playerCount - 1) * (TIME_SPIN + TIME_LOCK)) + TIME_LOCK;
      const totalWaitTime = rouletteTime + TIME_LIST_WAIT + TIME_GAME_START + 2000; 

      setTimeout(async () => {
        await updateDoc(roomRef, { status: 'playing' });
      }, totalWaitTime);

    } catch (error) {
      console.error("Error starting game:", error);
      addToast("開始に失敗しました");
    }
  };

  const handleLeaveConfirm = async () => {
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
      console.error("Error leaving room:", error);
      navigate('/');
    }
  };

  const handleForceLeave = async () => await handleLeaveConfirm();
  const handleRoomClosedConfirm = () => { localStorage.removeItem('shibari_user_info'); navigate('/'); };
  const handleChangeMode = () => navigate('/menu');

  const displayMembers = [...members].sort((a, b) => {
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    return 0; 
  });

  // guest_ で始まるID、もしくはオフラインでないユーザーを表示
  const visibleMembers = displayMembers.filter(m => {
      if (m.id.startsWith('guest_')) return true; // ゲストは常に表示
      return !offlineUsers.has(m.id);
  });

  return (
    <div className="w-full h-screen flex flex-col items-center relative overflow-hidden">
      {/* 背景 */}
      <div className="absolute inset-0 bg-slate-900 z-0">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20"></div>
          <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-purple-900/30 blur-[100px] rounded-full mix-blend-screen animate-pulse"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-cyan-900/30 blur-[100px] rounded-full mix-blend-screen animate-pulse delay-1000"></div>
      </div>
      <div className="absolute inset-0 pointer-events-none transition-colors duration-1000">
        <div className={`absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] blur-[120px] rounded-full mix-blend-screen opacity-40 animate-pulse ${gameMode === 'free' ? 'bg-blue-900' : 'bg-cyan-900'}`}></div>
      </div>
      <Toast messages={messages} onRemove={removeToast} />
       
      <AnimatePresence>
        {showRoulette && <EliminationRouletteOverlay finalMembers={finalOrderedMembers} />}
      </AnimatePresence>

      <div className="w-full max-w-6xl flex flex-col h-full px-4 py-8 md:py-12 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
          <div className="flex-1">
            <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-cyan-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">LOBBY</h1>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span className="px-3 py-1 rounded bg-white/10 border border-white/20 text-xs font-mono tracking-widest text-cyan-300">ID: {roomId}</span>
              <button onClick={handleShare} className="px-3 py-1 rounded bg-white/5 hover:bg-white/20 border border-white/20 text-xs text-white transition-all flex items-center gap-2">🔗 SHARE</button>
              <div className={`px-4 py-1.5 rounded border text-xs font-bold tracking-widest flex items-center gap-3 transition-colors ${gameMode === 'free' ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'}`}>
                {gameMode === 'free' ? '🧪 FREE MODE' : '👥 GAME MODE'}
                {isHost && <button onClick={handleChangeMode} className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] text-white transition-all hover:scale-105">CHANGE MODE 🔄</button>}
              </div>
            </div>
            {!isHost && <p className="text-[10px] text-gray-500 font-mono mt-2 tracking-widest animate-pulse">HOST IS SELECTING SETTINGS...</p>}
          </div>
          <button onClick={() => setShowLeaveModal(true)} className="px-4 py-2 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold tracking-widest transition-colors">LEAVE ROOM</button>
        </div>
        
        {/* Members */}
        <div className="flex-1 overflow-y-auto mb-8 pr-2 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {visibleMembers.map((member, index) => {
                  const isMe = member.id === userId;
                  const isGuest = member.id.startsWith('guest_');

                  return (
                    <motion.div key={member.id} layout="position" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }} transition={{ layout: { duration: 0.3 } }} className={`relative backdrop-blur-sm border rounded-xl p-4 flex items-center gap-4 group/card ${member.isReady ? 'bg-cyan-900/30 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-black/40 border-white/10'}`}>
                      <div className={`w-12 h-12 rounded-full border flex items-center justify-center text-2xl relative ${member.isReady ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_10px_cyan]' : 'bg-white/5 border-white/20'}`}>
                          {member.avatar}
                          {/* 自分の場合は編集バッジ表示 */}
                          {isMe && (
                              <button onClick={() => openEditModal(member)} className="absolute -bottom-1 -right-1 w-5 h-5 bg-white text-black rounded-full flex items-center justify-center text-[10px] border border-gray-300 shadow hover:scale-110 transition-transform cursor-pointer" title="Edit Profile">✏️</button>
                          )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-lg tracking-wider ${member.isReady ? 'text-white' : 'text-gray-400'}`}>{member.name}</span>
                          {member.isHost && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-500/30">HOST</span>}
                          {isGuest && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">GUEST</span>}
                        </div>
                        <p className={`text-xs font-mono tracking-widest ${member.isReady ? 'text-cyan-400 font-bold' : 'text-white/30'}`}>{member.isReady ? 'READY!' : 'WAITING...'}</p>
                      </div>

                      {/* ホスト用操作ボタン (自分以外) - 修正: モーダルを開く関数に変更 */}
                      {isHost && !isMe && (
                          <button onClick={() => handleDeleteClick(member.id)} className="opacity-0 group-hover/card:opacity-100 p-2 text-red-400 hover:text-red-200 hover:bg-red-500/20 rounded transition-all" title="Remove Player">🗑️</button>
                      )}
                    </motion.div>
                  );
              })}

              {/* 追加: ホスト用 ゲスト追加ボタン */}
              {isHost && (
                 <motion.button layout onClick={() => openEditModal()} className="border border-dashed border-white/20 rounded-xl p-4 flex items-center justify-center gap-4 hover:bg-white/5 hover:border-cyan-500/50 transition-all group h-[88px]">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-cyan-300 group-hover:scale-110 transition-all">＋</div>
                    <span className="text-sm font-bold tracking-widest text-gray-500 group-hover:text-cyan-300">ADD GUEST</span>
                 </motion.button>
              )}

              {[...Array(Math.max(0, (isHost ? 3 : 4) - visibleMembers.length))].map((_, i) => (
                <div key={`empty-${i}`} className="border border-white/5 rounded-xl p-4 flex items-center gap-4 opacity-30 border-dashed"><div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-xl animate-pulse">?</div><p className="text-sm font-mono tracking-widest text-white/50">WAITING...</p></div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        
        {/* Footer */}
        <div className="h-24 flex items-center justify-center relative z-50">
          {isHost ? (
            <button type="button" onClick={handleStart} disabled={!allReady} className={`group relative px-12 py-4 rounded-full font-black text-xl tracking-[0.2em] transition-all ${allReady ? 'hover:scale-105 active:scale-95 cursor-pointer ' + (gameMode === 'free' ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_30px_rgba(37,99,235,0.5)]' : 'bg-white text-black hover:bg-cyan-50 shadow-[0_0_30px_rgba(6,182,212,0.5)]') : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/10 opacity-50'}`}>
              <span className="relative z-10 flex items-center gap-3">{gameMode === 'free' ? 'START FREE MODE' : 'START GAME'}<span className="text-sm opacity-50">▶</span></span>
              {!allReady && <p className="absolute -bottom-6 w-full text-center text-[10px] text-red-400 font-mono tracking-widest">WAITING FOR PLAYERS...</p>}
            </button>
          ) : (
            <button onClick={toggleReady} className={`group relative px-12 py-4 rounded-full font-black text-xl tracking-[0.2em] transition-all hover:scale-105 active:scale-95 ${members.find(m => m.id === userId)?.isReady ? 'bg-cyan-600 text-white shadow-[0_0_30px_cyan]' : 'bg-transparent border-2 border-cyan-500 text-cyan-400 hover:bg-cyan-500/10'}`}>
              {members.find(m => m.id === userId)?.isReady ? 'READY!' : 'PRESS TO READY'}
            </button>
          )}
        </div>
      </div>
      
      {/* --- Modals --- */}
      
      {/* プロフィール編集モーダル */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !isSavingProfile && setIsProfileModalOpen(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-1 z-[151]">
              <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/50 p-6 md:p-8 rounded-xl flex flex-col gap-6">
                <div className="text-center">
                    <h3 className="text-xl font-black text-white tracking-widest uppercase">{editTargetId ? 'EDIT PROFILE' : 'ADD GUEST'}</h3>
                    <p className="text-xs text-gray-400 font-mono mt-1">{editTargetId ? 'プロフィールを変更します' : 'オフラインプレイヤーを追加します'}</p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-5xl shadow-[0_0_20px_cyan] border-4 border-white/20 relative">
                      {editAvatar}
                      <div className="absolute bottom-0 right-0 bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full">EDIT</div>
                  </div>
                  <div className="w-full overflow-x-auto pb-2 flex gap-2 no-scrollbar">
                      {AVATARS.map((avatar) => (
                          <button type="button" key={avatar} onClick={() => setEditAvatar(avatar)} className={`flex-none w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all border ${editAvatar === avatar ? 'bg-white text-black border-cyan-500 scale-110' : 'bg-white/5 text-white border-white/10 hover:bg-white/20'}`}>
                              {avatar}
                          </button>
                      ))}
                  </div>
                </div>
                <div className="form-control w-full">
                    <label className="label"><span className="label-text text-cyan-400 font-bold text-xs tracking-widest">NICKNAME</span></label>
                    <input type="text" placeholder="ENTER NAME" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={10} className="input w-full bg-black/40 border border-white/20 focus:border-cyan-400 text-white font-bold text-center tracking-wider text-lg h-14" />
                </div>
                <div className="flex gap-3">
                    <button type="button" onClick={() => setIsProfileModalOpen(false)} className="flex-1 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-xs">CANCEL</button>
                    <button type="button" onClick={handleSaveProfile} disabled={!editName.trim() || isSavingProfile} className="flex-1 py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 border-0 text-white font-black tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg shadow-cyan-500/20">
                        {isSavingProfile ? "SAVING..." : "SAVE"}
                    </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLeaveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowLeaveModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1">
              <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">👋</div>
                <div><h2 className="text-2xl font-black text-white tracking-widest mb-2">LEAVE ROOM?</h2><p className="text-gray-400 text-sm font-mono">ルームから退出してタイトル画面に戻りますか？<br/>{isHost && <span className="text-red-400 block mt-2">※あなたはホストです。退出するとルームは解散されます。</span>}</p></div>
                <div className="flex w-full gap-3 mt-2"><button onClick={() => setShowLeaveModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors">CANCEL</button><button onClick={handleLeaveConfirm} className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]">{isHost ? 'DISBAND' : 'LEAVE'}</button></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {roomClosed && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-sm bg-[#0f172a] border border-red-500 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.4)] p-1 z-50">
               <div className="bg-gradient-to-b from-red-900/40 to-black p-8 flex flex-col items-center text-center gap-4">
                  <div className="text-4xl">🚫</div>
                  <div><h2 className="text-xl font-black text-red-500 tracking-widest">ROOM CLOSED</h2><p className="text-gray-400 text-sm font-mono mt-2">ルームが解散されたか、<br/>存在しなくなりました。</p></div>
                  <button onClick={handleRoomClosedConfirm} className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold tracking-widest text-sm shadow-lg shadow-red-900/50 mt-4">BACK TO TITLE</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!isHost && isHostMissing && !roomClosed && (
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

      {/* ★追加: メンバー削除確認用モーダル (デザイン踏襲) */}
      <AnimatePresence>
        {deleteTargetId && (
            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    className="absolute inset-0 bg-black/80 backdrop-blur-md" 
                    onClick={() => setDeleteTargetId(null)}
                />
                
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }} 
                    exit={{ scale: 0.9, opacity: 0, y: 20 }} 
                    className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1 z-50"
                >
                    <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                        <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">
                            🗑️
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-widest mb-2">REMOVE PLAYER?</h2>
                            <p className="text-gray-400 text-sm font-mono">
                                このプレイヤーをルームから削除しますか？<br/>
                                <span className="text-red-400">この操作は取り消せません。</span>
                            </p>
                        </div>
                        <div className="flex w-full gap-3 mt-2">
                            <button 
                                onClick={() => setDeleteTargetId(null)} 
                                className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors"
                            >
                                CANCEL
                            </button>
                            <button 
                                onClick={executeDeleteMember} 
                                className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]"
                            >
                                DELETE
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