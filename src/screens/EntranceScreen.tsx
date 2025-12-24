import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';

// --- Firebase Imports ---
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, runTransaction } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AVATARS = ['🎤', '🎸', '🎹', '🥁', '🎷', '🎧', '👑', '🎩', '🐶', '🐱', '🦁', '🐼', '🐯', '👽', '👻', '🤖'];

// --- Enhanced Animation Config ---
// 背景のグリッドやオーブの動き
const bgVariants = {
  animate: {
    backgroundPosition: ['0% 0%', '100% 100%'],
    transition: { duration: 20, repeat: Infinity, repeatType: "reverse" as const, ease: "linear" }
  }
};

const titleContainerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

const charVariants = {
  hidden: { y: 100, opacity: 0, rotateX: -90 },
  show: { y: 0, opacity: 1, rotateX: 0, transition: { type: "spring", damping: 12, stiffness: 200 } }
};

const cardVariants = {
  hidden: { scale: 0.8, opacity: 0, y: 50 },
  show: { scale: 1, opacity: 1, y: 0, transition: { type: "spring", duration: 0.8, bounce: 0.4, delay: 0.6 } }
};

// ビジュアライザー風のバーアニメーション
const barVariants = {
  initial: { scaleY: 0.1, opacity: 0.3 },
  animate: (i: number) => ({
    scaleY: [0.1, 1, 0.3, 0.8, 0.1],
    opacity: [0.3, 0.8, 0.5, 1, 0.3],
    transition: {
      duration: 1.2,
      repeat: Infinity,
      ease: "easeInOut",
      delay: i * 0.1,
      repeatType: "mirror" as const
    }
  })
};

export const EntranceScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // UI State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [showMidGameModal, setShowMidGameModal] = useState(false);
  const [reconnectData, setReconnectData] = useState<any>(null);

  // ★追加：途中参加の部屋モード保持
  const [midGameRoomMode, setMidGameRoomMode] = useState<string | null>(null);

  // Navigation
  const [targetPath, setTargetPath] = useState<string>('');
  const [isHostMode, setIsHostMode] = useState(false);

  // User Data
  const [userName, setUserName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [roomIdInput, setRoomIdInput] = useState('');

  const hasProcessedInvite = useRef(false);

  // --- Logic Section (既存機能維持) ---
  useEffect(() => {
    const checkStatus = async () => {
      const roomParam = searchParams.get('room');

      // 1. ローカル情報の確認
      const stored = localStorage.getItem('shibari_user_info');
      if (stored) {
        const userInfo = JSON.parse(stored);
        try {
          const roomRef = doc(db, "rooms", userInfo.roomId);
          const roomSnap = await getDoc(roomRef);

          if (roomSnap.exists()) {
            const data = roomSnap.data();
            const isMember = data.members?.some((m: any) => m.id === userInfo.userId);
            const isSameRoom = roomParam ? (roomParam === userInfo.roomId) : true;

            if (isMember && isSameRoom) {
              setReconnectData({ ...userInfo, status: data.status, mode: data.mode });
              setShowReconnectModal(true);
              return;
            } else {
              if (isSameRoom) localStorage.removeItem('shibari_user_info');
            }
          } else {
            localStorage.removeItem('shibari_user_info');
          }
        } catch (e) {
          console.error("Reconnect check failed", e);
        }
      }

      // 2. 招待URLの処理
      if (roomParam && !hasProcessedInvite.current) {
        hasProcessedInvite.current = true;
        setRoomIdInput(roomParam);

        setIsProcessing(true);
        try {
          await new Promise(r => setTimeout(r, 500));
          const roomRef = doc(db, "rooms", roomParam);
          const roomSnap = await getDoc(roomRef);

          if (roomSnap.exists()) {
            const data = roomSnap.data();
            if (data.status === 'playing') {
              setMidGameRoomMode(data.mode || null);
              setShowMidGameModal(true);
            } else {
              setTargetPath('/game-setup');
              setIsHostMode(false);
              setShowProfileModal(true);
            }
          } else {
            setErrorMsg("招待されたルームが見つかりません。\nIDが間違っているか、解散された可能性があります。");
          }
        } catch (e) {
          console.error(e);
          setErrorMsg("通信エラーが発生しました。\nネットワーク接続を確認してください。");
        } finally {
          setIsProcessing(false);
        }
      }
    };

    checkStatus();
  }, [searchParams]);

  const handleReconnect = () => {
    if (!reconnectData) return;
    const status = reconnectData.status;
    const mode = reconnectData.mode;
    const isTeam = mode === 'team';

    if (status === 'playing') {
      if (mode === 'free') navigate('/free');
      else if (isTeam) navigate('/game-play-team');
      else navigate('/game-play');
      return;
    }
    if (status === 'finished') {
      if (isTeam) navigate('/team-result');
      else navigate('/result');
      return;
    }
    if (status === 'drafting') {
      if (isTeam) navigate('/team-draft');
      else navigate('/game-setup');
      return;
    }
    if (reconnectData.isHost) navigate('/menu');
    else navigate('/game-setup');
  };

  const cancelReconnect = () => {
    localStorage.removeItem('shibari_user_info');
    setShowReconnectModal(false);
  };

  const generateRoomId = () => Math.floor(1000 + Math.random() * 9000).toString();

  const handleRoomIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^[0-9]*$/.test(val) && val.length <= 4) {
      setRoomIdInput(val);
    }
  };

  const handleStartClick = async (e: React.MouseEvent, path: string, isHost: boolean) => {
    e.preventDefault();

    if (isHost) {
      setIsProcessing(true);
      try {
        const themesRef = doc(db, "system", "themes");
        const snap = await getDoc(themesRef);
        if (!snap.exists() || !snap.data().list || snap.data().list.length < 5) {
          setErrorMsg("お題が不足しています。\n「MANAGE TOPICS」から\n最低5個のお題を作成してください。");
          setIsProcessing(false);
          return;
        }
      } catch (err) {
        setErrorMsg("通信エラー: お題データの確認に失敗しました");
        setIsProcessing(false);
        return;
      }
      setIsProcessing(false);

      setTargetPath(path);
      setIsHostMode(isHost);
      setShowProfileModal(true);
      return;
    }

    if (!roomIdInput.trim() || roomIdInput.length !== 4) {
      setErrorMsg("ルームIDは4桁の数字を入力してください");
      return;
    }

    setIsProcessing(true);
    try {
      const roomRef = doc(db, "rooms", roomIdInput);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        setErrorMsg("部屋が見つかりません。\nIDを確認してください。");
        setIsProcessing(false);
        return;
      }

      const data = roomSnap.data();
      if (data.status === 'playing') {
        setMidGameRoomMode(data.mode || null);
        setShowMidGameModal(true);
        setIsProcessing(false);
        return;
      }

      setTargetPath(path);
      setIsHostMode(false);
      setShowProfileModal(true);

    } catch (e) {
      setErrorMsg("通信エラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmMidGameJoin = () => {
    setShowMidGameModal(false);
    const isTeam = midGameRoomMode === 'team';
    setTargetPath(isTeam ? '/game-play-team' : '/game-setup');
    setIsHostMode(false);
    setShowProfileModal(true);
  };

  const handleConfirmProfile = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const userCredential = await signInAnonymously(auth);
      const userId = userCredential.user.uid;
      let finalRoomId = roomIdInput;

      if (isHostMode) {
        let isCreated = false;
        let retryCount = 0;
        while (!isCreated && retryCount < 5) {
          finalRoomId = generateRoomId();
          const roomRef = doc(db, "rooms", finalRoomId);
          try {
            await runTransaction(db, async (transaction) => {
              const roomDoc = await transaction.get(roomRef);
              if (roomDoc.exists()) throw new Error("DuplicateID");

              const hostMember = {
                id: userId,
                name: userName,
                avatar: selectedAvatar,
                isHost: true,
                isReady: true,
                joinedAt: Date.now()
              };

              transaction.set(roomRef, {
                roomId: finalRoomId,
                hostId: userId,
                status: 'waiting',
                mode: 'standard',
                createdAt: serverTimestamp(),
                lastActive: serverTimestamp(),
                members: [hostMember],
                heartbeats: { [userId]: serverTimestamp() }
              });
            });
            isCreated = true;
          } catch (e: any) {
            if (e.message === "DuplicateID") retryCount++;
            else throw e;
          }
        }
        if (!isCreated) throw new Error("空き部屋が見つかりませんでした。");
      } else {
        const roomRef = doc(db, "rooms", finalRoomId);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const data = roomSnap.data();
          const existingMember = data.members?.find((m: any) => m.id === userId);

          if (existingMember) {
            const updatedMembers = data.members.map((m: any) => {
              if (m.id === userId) {
                return { ...m, name: userName, avatar: selectedAvatar, joinedAt: Date.now() };
              }
              return m;
            });
            await updateDoc(roomRef, {
              members: updatedMembers,
              [`heartbeats.${userId}`]: serverTimestamp()
            });
          } else {
            const newMember = {
              id: userId,
              name: userName,
              avatar: selectedAvatar,
              isHost: false,
              isReady: false,
              joinedAt: Date.now()
            };
            await updateDoc(roomRef, {
              members: arrayUnion(newMember),
              [`heartbeats.${userId}`]: serverTimestamp()
            });
          }
        }
      }

      const userInfo = {
        userId: userId,
        name: userName,
        avatar: selectedAvatar,
        isHost: isHostMode,
        roomId: finalRoomId
      };
      localStorage.setItem('shibari_user_info', JSON.stringify(userInfo));

      navigate(targetPath);
    } catch (error) {
      console.error("Error:", error);
      setErrorMsg("エラーが発生しました。\nもう一度お試しください。");
    } finally {
      setIsProcessing(false);
    }
  };


  // --- JSX: New Design ---
  return (
    <div className="w-full min-h-screen bg-slate-950 text-white overflow-hidden relative flex flex-col items-center justify-center py-10">
      
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        {/* Animated Gradient Grid */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-150 contrast-150"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,27,0.8)_2px,transparent_2px),linear-gradient(90deg,rgba(18,18,27,0.8)_2px,transparent_2px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] opacity-30"></div>
        
        {/* Floating Orbs */}
        <motion.div 
          animate={{ x: [0, 50, -50, 0], y: [0, -30, 20, 0], scale: [1, 1.2, 0.9, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute top-[10%] left-[20%] w-96 h-96 bg-purple-600/30 blur-[120px] rounded-full mix-blend-screen"
        />
        <motion.div 
          animate={{ x: [0, -30, 40, 0], y: [0, 40, -20, 0], scale: [1, 1.1, 0.8, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear", delay: 2 }}
          className="absolute bottom-[20%] right-[10%] w-[500px] h-[500px] bg-cyan-600/20 blur-[130px] rounded-full mix-blend-screen"
        />
      </div>

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-12 px-4">
        
        {/* Main Title Area */}
        <motion.div variants={titleContainerVariants} initial="hidden" animate="show" className="text-center relative">
            {/* Visualizer Bars Behind Title */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-full max-w-lg flex justify-center gap-2 h-40 items-end -z-10 opacity-40">
                {[...Array(12)].map((_, i) => (
                    <motion.div key={i} custom={i} variants={barVariants} initial="initial" animate="animate" className="w-2 md:w-4 bg-gradient-to-t from-cyan-500 to-transparent rounded-t-full origin-bottom" />
                ))}
            </div>

            <div className="flex flex-col items-center leading-none">
                {/* Outline Text "SHIBARI" */}
                <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-transparent select-none relative" style={{ WebkitTextStroke: '2px rgba(255,255,255,0.3)' }}>
                    {Array.from("SHIBARI").map((char, i) => (
                        <motion.span key={i} variants={charVariants} className="inline-block hover:text-cyan-400/20 transition-colors duration-300">{char}</motion.span>
                    ))}
                </h1>
                
                {/* Glow Text "KARAOKE" */}
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    transition={{ delay: 0.5, duration: 1, type: "spring" }}
                    className="relative -mt-4 md:-mt-8"
                >
                    <h2 className="text-4xl md:text-6xl font-black text-white tracking-[0.2em] md:tracking-[0.4em] drop-shadow-[0_0_15px_rgba(6,182,212,0.8)] bg-gradient-to-b from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent">
                        KARAOKE
                    </h2>
                    <div className="absolute -inset-4 bg-cyan-500/20 blur-xl rounded-full -z-10 animate-pulse"></div>
                </motion.div>
            </div>
        </motion.div>

        {/* Interaction Area */}
        <motion.div variants={cardVariants} initial="hidden" animate="show" className="w-full max-w-sm relative">
          {/* Glass Card */}
          <div className="relative overflow-hidden rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_0_50px_-10px_rgba(0,0,0,0.5)] group transition-all duration-300 hover:border-cyan-500/30">
            {/* Scanning Line Effect */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-[shimmer_2s_infinite]"></div>
            
            <div className="p-8 flex flex-col gap-6">
                
                {/* Room ID Input */}
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-cyan-500 tracking-[0.2em] uppercase pl-1">Join Room</label>
                    <div className="relative group/input">
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="ID"
                            value={roomIdInput}
                            onChange={handleRoomIdChange}
                            className="w-full bg-white/5 border border-white/10 rounded-lg text-4xl font-mono font-bold text-center text-white placeholder:text-white/10 focus:outline-none focus:border-cyan-400 focus:bg-cyan-900/10 focus:shadow-[0_0_20px_rgba(6,182,212,0.2)] transition-all h-20 tracking-[0.5em]"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_red]" style={{ opacity: roomIdInput.length === 4 ? 1 : 0 }}></div>
                    </div>
                </div>

                {/* Connect Button */}
                <button
                    type="button"
                    onClick={(e) => handleStartClick(e, '/game-setup', false)}
                    disabled={isProcessing}
                    className="w-full h-14 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-400 hover:to-blue-500 text-white font-bold tracking-[0.2em] text-lg shadow-lg shadow-cyan-900/40 hover:shadow-cyan-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden relative"
                >
                    <span className="relative z-10 flex items-center justify-center gap-3">
                        {isProcessing ? "SYSTEM CHECK..." : "CONNECT"}
                    </span>
                </button>

                {/* Host Button (Divider) */}
                <div className="relative flex items-center justify-center py-2">
                    <div className="h-[1px] bg-white/10 w-full absolute"></div>
                    <span className="bg-[#0b101e] px-2 text-[10px] text-gray-500 relative font-mono">OR</span>
                </div>

                <button
                    type="button"
                    onClick={(e) => handleStartClick(e, '/menu', true)}
                    className="w-full py-3 rounded border border-white/5 hover:bg-white/5 text-gray-400 hover:text-cyan-300 text-xs font-bold tracking-widest transition-all uppercase flex items-center justify-center gap-2 group/host"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-600 group-hover/host:bg-cyan-400 transition-colors"></span>
                    Create New Room
                </button>
            </div>
          </div>
        </motion.div>

        {/* Manage Topics Button */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 1 } }} className="relative z-50">
          <button
            onClick={() => navigate('/custom')}
            className="flex items-center gap-3 px-6 py-2 rounded-full border border-white/5 bg-black/20 backdrop-blur-md text-gray-500 text-[10px] font-bold tracking-[0.2em] hover:bg-white/10 hover:text-white hover:border-white/20 transition-all hover:scale-105"
          >
            <span className="text-lg">⚙️</span> SYSTEM CONFIG
          </button>
        </motion.div>
      </div>

      {/* --- Modals (Visual Updates Only) --- */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/80 backdrop-blur-lg" onClick={() => !isProcessing && setShowProfileModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-cyan-500/30 rounded-2xl shadow-[0_0_60px_-10px_rgba(6,182,212,0.3)] overflow-hidden p-1 z-50">
              <div className="bg-slate-900/80 p-8 rounded-xl flex flex-col gap-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500"></div>
                <div className="text-center">
                  <h3 className="text-2xl font-black text-white tracking-[0.3em] uppercase italic">Identity</h3>
                  <p className="text-[10px] text-cyan-400/60 font-mono mt-2 tracking-widest">SELECT AVATAR & NAME</p>
                </div>

                <div className="flex flex-col items-center gap-6">
                  <div className="relative group">
                     <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-full blur opacity-40 group-hover:opacity-70 transition-opacity"></div>
                     <div className="w-28 h-28 rounded-full bg-[#1e293b] flex items-center justify-center text-6xl border-2 border-cyan-500/50 relative z-10 shadow-2xl">
                        {selectedAvatar}
                     </div>
                  </div>
                  {/* ★修正箇所: p-4 を追加して上下左右に余裕を持たせ、見切れを防止 */}
                  <div className="w-full overflow-x-auto p-4 flex gap-3 no-scrollbar">
                    {AVATARS.map((avatar) => (
                      <button
                        type="button"
                        key={avatar}
                        onClick={() => setSelectedAvatar(avatar)}
                        className={`flex-none w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${
                          selectedAvatar === avatar
                            ? 'bg-cyan-500 text-black scale-110 shadow-[0_0_15px_cyan]'
                            : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-cyan-500 tracking-widest uppercase pl-1">Codename</label>
                    <input
                        type="text"
                        placeholder="ENTER NAME"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        maxLength={10}
                        className="w-full bg-black/30 border border-white/10 rounded px-4 py-3 text-white font-bold text-center tracking-widest text-lg focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                </div>

                <button
                  type="button"
                  onClick={handleConfirmProfile}
                  disabled={!userName.trim() || isProcessing}
                  className="btn h-14 w-full bg-white text-black font-black tracking-[0.3em] hover:bg-cyan-50 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 rounded-lg shadow-lg hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] border-0"
                >
                  {isProcessing ? "INITIALIZING..." : "READY"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {errorMsg && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setErrorMsg(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-red-950/90 border border-red-500 rounded-xl p-8 z-[101] text-center shadow-[0_0_50px_rgba(220,38,38,0.4)]">
                <div className="text-5xl mb-4 animate-bounce">⚠️</div>
                <h3 className="text-xl font-black text-red-500 tracking-widest mb-2">SYSTEM ERROR</h3>
                <p className="text-sm text-white/80 mb-6 whitespace-pre-wrap">{errorMsg}</p>
                <button onClick={() => setErrorMsg(null)} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded tracking-wider text-xs w-full">DISMISS</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReconnectModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-[#0f172a] border border-cyan-400 rounded-xl p-8 z-[101] text-center shadow-[0_0_40px_rgba(6,182,212,0.2)]">
                <div className="text-5xl mb-4 animate-spin-slow">🔄</div>
                <h2 className="text-lg font-black text-cyan-400 tracking-widest mb-2">RESUME SESSION</h2>
                <p className="text-gray-400 text-xs font-mono mb-6">前回のセッションが残っています。<br/>復帰しますか？</p>
                <div className="flex gap-3">
                  <button onClick={cancelReconnect} className="flex-1 py-3 rounded border border-white/10 hover:bg-white/5 text-gray-400 font-bold text-xs tracking-widest">ABORT</button>
                  <button onClick={handleReconnect} className="flex-1 py-3 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs tracking-widest shadow-lg shadow-cyan-900/50">RESUME</button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMidGameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowMidGameModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-[#0f172a] border border-yellow-500 rounded-xl p-8 z-[101] text-center shadow-[0_0_40px_rgba(234,179,8,0.2)]">
                <div className="text-5xl mb-4 animate-pulse">🎮</div>
                <h2 className="text-lg font-black text-yellow-500 tracking-widest mb-2">GAME ACTIVE</h2>
                <p className="text-gray-400 text-xs font-mono mb-6">進行中のゲームに参加します。<br/>準備はいいですか？</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowMidGameModal(false)} className="flex-1 py-3 rounded border border-white/10 hover:bg-white/5 text-gray-400 font-bold text-xs tracking-widest">CANCEL</button>
                  <button onClick={confirmMidGameJoin} className="flex-1 py-3 rounded bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-xs tracking-widest shadow-lg shadow-yellow-900/50">JOIN</button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};