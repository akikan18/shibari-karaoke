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

const shuffleArray = (array: any[]) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// --- 演出設定定数 (ミリ秒) ---
const TIME_SPIN = 800;          // 1人の回転時間
const TIME_LOCK = 1200;         // 1人の確定表示時間
const TIME_LIST_WAIT = 4000;    // 全員決定後のリスト確認時間
const TIME_GAME_START = 5000;   // GAME START 表示時間

// --- 順次ルーレット演出用コンポーネント (完全修正版) ---
const EliminationRouletteOverlay = ({ finalMembers }: { finalMembers: any[] }) => {
  const [confirmedList, setConfirmedList] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  
  // 表示用
  const [displayAvatar, setDisplayAvatar] = useState('?');
  const [displayName, setDisplayName] = useState('');
  
  // フェーズ: 'spinning' | 'locked' | 'finished' | 'gamestart'
  const [phase, setPhase] = useState('init');

  // アニメーション用のRef（Stateだとタイマー内で古くなるためRefで管理）
  const phaseRef = useRef('init');
  const roundRef = useRef(0);

  // ステートとRefを同期させるヘルパー
  const setPhaseSafe = (newPhase: string) => {
    setPhase(newPhase);
    phaseRef.current = newPhase;
  };

  // 初期化：メンバーデータが届いたら開始
  useEffect(() => {
    if (finalMembers.length > 0 && phaseRef.current === 'init') {
      setPhaseSafe('spinning');
      spinLoop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalMembers]);

  // ★ コアロジック: 再帰的な回転処理
  const spinLoop = () => {
    // 現在のフェーズやラウンドをRefから取得（常に最新）
    if (phaseRef.current !== 'spinning') return;

    const round = roundRef.current;
    
    // 全員終わっていたら終了へ
    if (round >= finalMembers.length) {
      setPhaseSafe('finished');
      startFinishSequence();
      return;
    }

    const targetMember = finalMembers[round];
    // まだ確定していない候補者（演出用）
    const candidates = finalMembers.slice(round);

    // 最後の1人は回転なしで即確定
    if (candidates.length <= 1) {
      setDisplayAvatar(targetMember.avatar);
      setDisplayName(targetMember.name);
      lockAndNext(targetMember);
      return;
    }

    // --- 回転アニメーション ---
    let elapsed = 0;
    const tick = 60; // 更新間隔

    const runTick = () => {
      // ランダム表示
      const random = candidates[Math.floor(Math.random() * candidates.length)];
      if (random) {
        setDisplayAvatar(random.avatar);
        setDisplayName("..."); 
      }

      elapsed += tick;

      if (elapsed >= TIME_SPIN) {
        // 時間が来たら正解を表示してロックへ
        setDisplayAvatar(targetMember.avatar);
        setDisplayName(targetMember.name);
        lockAndNext(targetMember);
      } else {
        // 次のフレームへ
        setTimeout(runTick, tick);
      }
    };

    runTick();
  };

  // 確定表示 -> 次のラウンドへ
  const lockAndNext = (member: any) => {
    setPhaseSafe('locked');

    setTimeout(() => {
      // リストに追加
      setConfirmedList(prev => {
        if (prev.find(m => m.id === member.id)) return prev;
        return [...prev, member];
      });

      // ラウンドを進める
      roundRef.current += 1;
      setCurrentRound(roundRef.current);

      // 次の回転へ戻る
      setPhaseSafe('spinning');
      
      // 次のループを開始 (非同期で再帰呼び出し)
      setTimeout(spinLoop, 50);

    }, TIME_LOCK);
  };

  // 終了シーケンス (リスト確認 -> GameStart)
  const startFinishSequence = () => {
    setTimeout(() => {
      setPhaseSafe('gamestart');
    }, TIME_LIST_WAIT);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }} 
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl p-4 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-black to-black animate-pulse"></div>
      
      {/* GAME START Animation */}
      <AnimatePresence>
        {phase === 'gamestart' && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
            className="absolute inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md"
          >
            <div className="relative transform rotate-[-5deg]">
              <div className="absolute inset-0 bg-cyan-500 blur-[80px] opacity-60 animate-pulse"></div>
              <h1 className="relative text-7xl md:text-9xl font-black italic tracking-tighter text-white drop-shadow-[0_0_30px_rgba(6,182,212,0.8)] border-y-8 border-cyan-500 py-6 px-12 bg-black">
                GAME<br/><span className="text-cyan-400">START</span>
              </h1>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ルーレット画面 */}
      {phase !== 'gamestart' && phase !== 'init' && (
        <>
          <div className="relative z-10 mb-4 text-center flex-none h-16">
            {phase !== 'finished' ? (
              <>
                <h2 className="text-cyan-500 font-mono tracking-[0.5em] text-xs animate-pulse mb-2">DECIDING ORDER</h2>
                <div className="text-4xl font-black text-white italic tracking-tighter">
                    <span className="text-yellow-500 mr-2">#{currentRound + 1}</span>PLAYER
                </div>
              </>
            ) : (
              <h2 className="text-yellow-500 font-black tracking-widest text-3xl animate-bounce mt-4">ORDER FIXED!</h2>
            )}
          </div>

          {phase !== 'finished' && (
            <div className="relative z-10 flex flex-col items-center justify-center flex-none mb-6">
              <motion.div 
                key={phase === 'locked' ? 'locked' : 'spinning'}
                animate={phase === 'locked' ? { scale: [1, 1.1, 1], borderColor: '#eab308', boxShadow: "0 0 50px rgba(234, 179, 8, 0.5)" } : { scale: 1, borderColor: 'rgba(6,182,212,0.3)' }}
                className="relative w-32 h-32 md:w-40 md:h-40 rounded-full border-4 flex items-center justify-center overflow-hidden bg-black transition-colors duration-200"
              >
                <div className="text-6xl md:text-7xl select-none">{displayAvatar}</div>
              </motion.div>
              
              <div className="h-10 mt-2 flex items-center justify-center">
                {phase === 'locked' ? (
                  <motion.div initial={{y:10, opacity:0}} animate={{y:0, opacity:1}} className="text-xl font-black text-white">{displayName}</motion.div>
                ) : (
                  <div className="text-xs text-gray-500 font-mono tracking-widest animate-pulse">SPINNING...</div>
                )}
              </div>
            </div>
          )}

          <motion.div 
            animate={phase === 'finished' ? { scale: 1.1, y: -20 } : { scale: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 w-full max-w-md bg-white/5 border border-white/10 rounded-xl p-4 flex-1 overflow-hidden flex flex-col shadow-xl"
          >
            <h3 className="text-xs text-gray-400 font-mono tracking-widest mb-2 border-b border-white/10 pb-1 flex-none">TURN ORDER LIST</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              <AnimatePresence>
                {confirmedList.map((member, index) => (
                  <motion.div 
                    key={member.id}
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${index === 0 ? 'bg-gradient-to-r from-yellow-900/40 to-black border-yellow-500/50' : 'bg-black/40 border-white/10'}`}
                  >
                    <div className={`w-8 h-8 flex items-center justify-center rounded font-black text-sm ${index === 0 ? 'bg-yellow-500 text-black shadow-[0_0_10px_orange]' : 'bg-gray-700 text-gray-300'}`}>
                      {index + 1}
                    </div>
                    <div className="text-xl">{member.avatar}</div>
                    <div className={`font-bold ${index === 0 ? 'text-yellow-200' : 'text-gray-300'}`}>{member.name}</div>
                    {index === 0 && <span className="ml-auto text-[10px] text-yellow-500 font-mono border border-yellow-500/30 px-2 py-0.5 rounded">LEADER</span>}
                  </motion.div>
                ))}
                
                {phase !== 'finished' && [...Array(Math.max(0, finalMembers.length - confirmedList.length))].map((_, i) => (
                    <div key={`empty-${i}`} className="h-12 border border-white/5 rounded-lg border-dashed bg-white/5 opacity-20"></div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
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
      } else {
        if (!isMounting.current) {
          setRoomClosed(true);
        }
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const { offlineUsers, isHostMissing } = usePresence(roomId, userId, roomData, addToast);

  // --- 自動復帰ロジック ---
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

  // オフラインゲスト自動削除
  useEffect(() => {
    if (!isHost || offlineUsers.size === 0 || !members.length) return;
    const kickOfflineUsers = async () => {
      const activeMembers = members.filter(m => !offlineUsers.has(m.id));
      if (activeMembers.length !== members.length) {
        try {
          const roomRef = doc(db, "rooms", roomId);
          await updateDoc(roomRef, { members: activeMembers });
        } catch (error) { console.error("Auto kick failed", error); }
      }
    };
    kickOfflineUsers();
  }, [isHost, offlineUsers, members, roomId]);

  const handleShare = async () => {
    const url = `${window.location.origin}/?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
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
      // シャッフルして順番を確定
      const shuffledMembers = shuffleArray(members);

      const membersWithChallenge = shuffledMembers.map(m => {
        if (deck.length === 0) deck = shuffleArray(pool);
        const challenge = deck.pop();
        return { ...m, challenge: challenge };
      });

      const roomRef = doc(db, "rooms", roomId);
      
      // STEP 1: ルーレット開始
      await updateDoc(roomRef, { 
        members: membersWithChallenge, 
        themePool: pool, 
        deck: deck,      
        status: 'roulette', 
        currentTurnIndex: 0, 
        turnCount: 1
      });

      // ★ 演出時間はホスト側でも十分な余裕を持つ
      const playerCount = members.length;
      const rouletteTime = (Math.max(0, playerCount - 1) * (TIME_SPIN + TIME_LOCK)) + TIME_LOCK;
      const totalWaitTime = rouletteTime + TIME_LIST_WAIT + TIME_GAME_START + 2000; // バッファ+2秒

      // STEP 2: アニメーション終了後にゲーム開始へ
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

  // ★ ロビー表示用にホストを先頭にソート
  const displayMembers = [...members].sort((a, b) => {
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    return 0; 
  });

  return (
    <div className="w-full h-screen flex flex-col items-center relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none transition-colors duration-1000">
        <div className={`absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] blur-[120px] rounded-full mix-blend-screen opacity-40 animate-pulse ${gameMode === 'free' ? 'bg-blue-900' : 'bg-cyan-900'}`}></div>
      </div>
      <Toast messages={messages} onRemove={removeToast} />
      
      {/* ルーレットオーバーレイ */}
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
        
        {/* Members (Sort済みの displayMembers を使用) */}
        <div className="flex-1 overflow-y-auto mb-8 pr-2 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {displayMembers.map((member, index) => (
                <motion.div key={member.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }} transition={{ delay: index * 0.1 }} className={`backdrop-blur-sm border rounded-xl p-4 flex items-center gap-4 transition-all duration-300 ${member.isReady ? 'bg-cyan-900/30 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-black/40 border-white/10'}`}>
                  <div className={`w-12 h-12 rounded-full border flex items-center justify-center text-2xl ${member.isReady ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_10px_cyan]' : 'bg-white/5 border-white/20'}`}>{member.avatar}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-lg tracking-wider ${member.isReady ? 'text-white' : 'text-gray-400'}`}>{member.name}</span>
                      {member.isHost && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-500/30">HOST</span>}
                    </div>
                    <p className={`text-xs font-mono tracking-widest ${member.isReady ? 'text-cyan-400 font-bold' : 'text-white/30'}`}>{member.isReady ? 'READY!' : 'WAITING...'}</p>
                  </div>
                </motion.div>
              ))}
              {[...Array(Math.max(0, 4 - displayMembers.length))].map((_, i) => (
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
      
      {/* Modals */}
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
    </div>
  );
};