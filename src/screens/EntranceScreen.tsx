import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';

// --- Firebase Imports ---
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, runTransaction } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AVATARS = ['🎤', '🎸', '🎹', '🥁', '🎷', '🎧', '👑', '🎩', '🐶', '🐱', '🦁', '🐼', '🐯', '👽', '👻', '🤖'];

// --- Animation Config (省略なし) ---
const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.3, delayChildren: 0.5 } } };
const titleItemVariants = { hidden: { y: 50, opacity: 0, filter: 'blur(10px)' }, show: { y: 0, opacity: 1, filter: 'blur(0px)', transition: { type: "spring", stiffness: 100 } } };
const lineVariants = { hidden: { scaleX: 0, opacity: 0 }, show: { scaleX: 1, opacity: 0.6, transition: { duration: 0.8, ease: "circOut" } } };
const cardVariants = { hidden: { y: 100, opacity: 0, rotateX: 20 }, show: { y: 0, opacity: 1, rotateX: 0, transition: { type: "spring", bounce: 0.3, duration: 1, delay: 0.8 } } };

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

  // Navigation
  const [targetPath, setTargetPath] = useState<string>(''); 
  const [isHostMode, setIsHostMode] = useState(false); 

  // User Data
  const [userName, setUserName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [roomIdInput, setRoomIdInput] = useState('');

  // --- 0. URLパラメータチェック & 自動接続 ---
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && /^[0-9]{4}$/.test(roomParam)) {
      setRoomIdInput(roomParam);
      
      const autoCheck = async () => {
         setIsProcessing(true);
         try {
             const roomRef = doc(db, "rooms", roomParam);
             const roomSnap = await getDoc(roomRef);
             if (roomSnap.exists()) {
                const data = roomSnap.data();
                if (data.status === 'playing') {
                   setShowMidGameModal(true);
                } else {
                   // 自動的にゲスト参加としてモーダルを開く
                   setTargetPath('/game-setup');
                   setIsHostMode(false);
                   setShowProfileModal(true);
                }
             }
         } catch (e) {
             console.error(e);
         } finally {
             setIsProcessing(false);
         }
      };
      autoCheck();
    }
  }, [searchParams]);

  // --- 1. 再接続チェック ---
  useEffect(() => {
    const checkReconnection = async () => {
      const stored = localStorage.getItem('shibari_user_info');
      if (stored) {
        const userInfo = JSON.parse(stored);
        try {
          const roomRef = doc(db, "rooms", userInfo.roomId);
          const roomSnap = await getDoc(roomRef);
          if (roomSnap.exists()) {
            const data = roomSnap.data();
            const isMember = data.members?.some((m: any) => m.id === userInfo.userId);
            if (isMember) {
              setReconnectData({ ...userInfo, status: data.status, mode: data.mode });
              setShowReconnectModal(true);
            } else {
              localStorage.removeItem('shibari_user_info');
            }
          } else {
            localStorage.removeItem('shibari_user_info');
          }
        } catch (e) {
          console.error("Reconnect check failed", e);
        }
      }
    };
    checkReconnection();
  }, []);

  const handleReconnect = () => {
    if (!reconnectData) return;
    if (reconnectData.status === 'playing') {
      if (reconnectData.mode === 'free') navigate('/free');
      else navigate('/game-play');
    } else if (reconnectData.status === 'finished') {
      navigate('/result');
    } else {
      if (reconnectData.isHost) navigate('/menu');
      else navigate('/game-setup');
    }
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

  // --- 2. 接続開始 (事前チェック) ---
  const handleStartClick = async (e: React.MouseEvent, path: string, isHost: boolean) => {
    e.preventDefault();
    
    // ホストの場合
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

    // ゲストの場合
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
    setTargetPath('/game-setup'); 
    setIsHostMode(false);
    setShowProfileModal(true);
  };

  // --- 3. プロフィール確定 & 参加 ---
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
        // --- HOST ---
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
        // --- GUEST ---
        const roomRef = doc(db, "rooms", finalRoomId);
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

  return (
    <div className="w-full min-h-[80vh] text-white overflow-hidden relative flex flex-col items-center justify-center py-10">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/20 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-900/20 blur-[120px] rounded-full mix-blend-screen"></div>
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="show" className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-10">
        <div className="text-center flex flex-col items-center">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white drop-shadow-2xl overflow-hidden leading-none">
            <motion.span variants={titleItemVariants} className="block bg-gradient-to-br from-white via-cyan-100 to-cyan-300 bg-clip-text text-transparent py-2">SHIBARI</motion.span>
            <motion.span variants={titleItemVariants} className="block text-white/90">KARAOKE</motion.span>
          </h1>
          <div className="flex items-center justify-center gap-4 mt-8 w-full max-w-lg">
            <motion.div variants={lineVariants} className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-cyan-400 origin-right"></motion.div>
            <motion.p variants={titleItemVariants} className="text-sm font-bold tracking-[0.4em] text-cyan-200 uppercase whitespace-nowrap">System initializing...</motion.p>
            <motion.div variants={lineVariants} className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-cyan-400 origin-left"></motion.div>
          </div>
        </div>

        <motion.div variants={cardVariants} className="w-full max-w-md relative group perspective-1000">
          <div className="relative overflow-hidden rounded-3xl bg-white/5 backdrop-blur-3xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-cyan-500/30">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
            <div className="p-8 flex flex-col gap-6 relative z-10">
              <div className="form-control group/input">
                <label className="label pl-1"><span className="label-text font-bold text-cyan-200/80 text-xs tracking-widest uppercase">Room ID</span></label>
                <input type="text" inputMode="numeric" placeholder="0000" value={roomIdInput} onChange={handleRoomIdChange} className="input w-full bg-black/20 border-0 border-b-2 border-white/10 text-3xl font-bold text-center text-white placeholder:text-white/5 focus:outline-none focus:border-cyan-400 focus:bg-black/30 transition-all h-16 rounded-lg font-mono tracking-widest" />
              </div>
              <button type="button" onClick={(e) => handleStartClick(e, '/game-setup', false)} disabled={isProcessing} className="btn btn-lg h-16 border-0 bg-gradient-to-r from-cyan-700 to-blue-700 text-white text-xl font-bold tracking-widest hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-900/20 hover:-translate-y-1 transition-all rounded-xl relative overflow-hidden group/btn disabled:opacity-50">
                <span className="relative z-10 flex items-center justify-center gap-2">{isProcessing ? "CHECKING..." : "CONNECT"} {!isProcessing && <span className="text-cyan-300 group-hover/btn:translate-x-1 transition-transform">→</span>}</span>
              </button>
              <motion.div variants={titleItemVariants} className="text-center pt-2">
                <button type="button" onClick={(e) => handleStartClick(e, '/menu', true)} className="text-sm text-gray-500 hover:text-cyan-300 transition-colors duration-200 tracking-wider uppercase font-bold px-4 py-2 hover:bg-white/5 rounded">// Create New Room (Host)</button>
              </motion.div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={titleItemVariants} className="mt-4 relative z-50">
          <button onClick={() => navigate('/custom')} className="flex items-center gap-2 px-6 py-3 rounded-full border border-white/10 bg-black/40 backdrop-blur-md text-gray-400 text-xs font-bold tracking-widest hover:bg-white/10 hover:text-white hover:border-cyan-500/50 transition-all group cursor-pointer shadow-lg">
            <span className="group-hover:text-cyan-400">⚙️</span> MANAGE TOPICS
          </button>
        </motion.div>
      </motion.div>

      {/* --- Modals (Reconnect / MidGame / Profile / Error) は省略なしでそのまま維持 --- */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !isProcessing && setShowProfileModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-1 z-50">
              <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/50 p-6 md:p-8 rounded-xl flex flex-col gap-6">
                <div className="text-center"><h3 className="text-xl font-black text-white tracking-widest uppercase">Who are you?</h3><p className="text-xs text-gray-400 font-mono mt-1">プロフィールを設定してください</p></div>
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-5xl shadow-[0_0_20px_cyan] border-4 border-white/20 relative">{selectedAvatar}<div className="absolute bottom-0 right-0 bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full">EDIT</div></div>
                  <div className="w-full overflow-x-auto pb-2 flex gap-2 no-scrollbar">{AVATARS.map((avatar) => (<button type="button" key={avatar} onClick={() => setSelectedAvatar(avatar)} className={`flex-none w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all border ${selectedAvatar === avatar ? 'bg-white text-black border-cyan-500 scale-110' : 'bg-white/5 text-white border-white/10 hover:bg-white/20'}`}>{avatar}</button>))}</div>
                </div>
                <div className="form-control w-full"><label className="label"><span className="label-text text-cyan-400 font-bold text-xs tracking-widest">NICKNAME</span></label><input type="text" placeholder="ENTER YOUR NAME" value={userName} onChange={(e) => setUserName(e.target.value)} maxLength={10} autoFocus className="input w-full bg-black/40 border border-white/20 focus:border-cyan-400 text-white font-bold text-center tracking-wider text-lg h-14" /></div>
                <button type="button" onClick={handleConfirmProfile} disabled={!userName.trim() || isProcessing} className="btn btn-lg w-full bg-gradient-to-r from-cyan-600 to-blue-600 border-0 text-white font-black tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg shadow-cyan-500/20">{isProcessing ? "PROCESSING..." : "GO !"}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {errorMsg && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setErrorMsg(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-sm bg-[#0f172a] border border-red-500/50 rounded-2xl shadow-[0_0_30px_rgba(220,38,38,0.3)] overflow-hidden p-1 z-[101]">
               <div className="bg-gradient-to-b from-red-900/20 to-black p-6 rounded-xl flex flex-col items-center text-center gap-4">
                  <div className="text-3xl">⚠️</div>
                  <h3 className="text-lg font-black text-red-400 tracking-widest">ERROR</h3>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{errorMsg}</p>
                  <button onClick={() => setErrorMsg(null)} className="mt-2 w-full py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold tracking-widest text-xs transition-colors">CLOSE</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Reconnect & MidGame モーダルはそのまま維持 */}
      <AnimatePresence>
        {showReconnectModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-[#0f172a] border border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.3)] p-1 z-[101]">
               <div className="bg-gradient-to-b from-cyan-900/20 to-black p-8 flex flex-col items-center text-center gap-4">
                  <div className="text-4xl">🔄</div>
                  <div><h2 className="text-xl font-black text-cyan-400 tracking-widest">RECONNECT?</h2><p className="text-gray-400 text-sm font-mono mt-2">参加中のゲームが見つかりました。<br/>再接続しますか？</p></div>
                  <div className="flex w-full gap-2 mt-4"><button onClick={cancelReconnect} className="flex-1 py-3 rounded-lg bg-white/5 border border-white/10 text-gray-400 font-bold tracking-widest text-xs">NO</button><button onClick={handleReconnect} className="flex-1 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-widest text-xs shadow-lg shadow-cyan-900/50">YES</button></div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMidGameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowMidGameModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-[#0f172a] border border-yellow-500/50 rounded-2xl shadow-[0_0_50px_rgba(234,179,8,0.3)] p-1 z-[101]">
               <div className="bg-gradient-to-b from-yellow-900/20 to-black p-8 flex flex-col items-center text-center gap-4">
                  <div className="text-4xl">🎮</div>
                  <div><h2 className="text-xl font-black text-yellow-400 tracking-widest">GAME IN PROGRESS</h2><p className="text-gray-400 text-sm font-mono mt-2">現在ゲームが進行中です。<br/>新規プレイヤーとして途中参加しますか？</p></div>
                  <div className="flex w-full gap-2 mt-4"><button onClick={() => setShowMidGameModal(false)} className="flex-1 py-3 rounded-lg bg-white/5 border border-white/10 text-gray-400 font-bold tracking-widest text-xs">CANCEL</button><button onClick={confirmMidGameJoin} className="flex-1 py-3 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-bold tracking-widest text-xs shadow-lg shadow-yellow-900/50">JOIN</button></div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};