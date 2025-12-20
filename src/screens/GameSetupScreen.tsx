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

        if (data.status === 'playing') {
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

  // ★通知はすべてこのフック内で行われるため、ここでの追加ロジックは不要
  const { offlineUsers, isHostMissing } = usePresence(roomId, userId, roomData, addToast);

  // --- 自動復帰ロジック (Self-Healing) ---
  useEffect(() => {
    if (isHost || !roomId || !userId || !roomData || roomClosed) return;
    const amIMember = members.some(m => m.id === userId);

    if (!amIMember && !isMounting.current) {
       console.log("Detect: Removed from member list. Attempting to rejoin...");
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

  // オフラインゲスト自動削除 (ホストのみ)
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

  // ... (以下、handleShare, toggleReady, handleStart などの関数は変更なし)
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
      const membersWithChallenge = members.map(m => {
        if (deck.length === 0) deck = shuffleArray(pool);
        const challenge = deck.pop();
        return { ...m, challenge: challenge };
      });
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, { 
        members: membersWithChallenge, themePool: pool, deck: deck,     
        status: 'playing', currentTurnIndex: 0, turnCount: 1
      });
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

  return (
    <div className="w-full h-screen flex flex-col items-center relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none transition-colors duration-1000">
        <div className={`absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] blur-[120px] rounded-full mix-blend-screen opacity-40 animate-pulse ${gameMode === 'free' ? 'bg-blue-900' : 'bg-cyan-900'}`}></div>
      </div>
      <Toast messages={messages} onRemove={removeToast} />
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
            <AnimatePresence>
              {members.map((member, index) => (
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
              {[...Array(Math.max(0, 4 - members.length))].map((_, i) => (
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
      {/* Modals（省略なしでそのまま維持） */}
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