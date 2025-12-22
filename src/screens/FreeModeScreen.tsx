import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- Firebase ---
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// --- Components & Hooks ---
import { Toast, useToast } from '../components/Toast';
import { usePresence } from '../hooks/usePresence';
import { useWakeLock } from '../hooks/useWakeLock';

export const FreeModeScreen = () => {
const navigate = useNavigate();
const { messages, addToast, removeToast } = useToast();
useWakeLock();

// --- ユーザー & 部屋情報 ---
const [roomId, setRoomId] = useState('');
const [userId, setUserId] = useState('');
const [isHost, setIsHost] = useState(false);
const [roomData, setRoomData] = useState<any>(null);
const [members, setMembers] = useState<any[]>([]);

// --- お題関連 ---
const [pool, setPool] = useState<any[]>([]);
const [currentChallenge, setCurrentChallenge] = useState<{ title: string; criteria: string } | null>(null);

// スピン状態
const [isSpinning, setIsSpinning] = useState(false);

// モーダル制御
const [showBackToLobbyModal, setShowBackToLobbyModal] = useState(false);

// --- 初期化 & 監視 ---
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
const unsubscribeRoom = onSnapshot(roomRef, (docSnap) => {
if (docSnap.exists()) {
const data = docSnap.data();
setRoomData(data);

if (data.members) {
setMembers(data.members);
}

if (data.currentChallenge) {
setCurrentChallenge(data.currentChallenge);
}

if (data.isSpinning !== undefined) {
setIsSpinning(data.isSpinning);
}

if (data.status === 'setup') {
navigate('/game-setup');
}
} else {
navigate('/');
}
});

const fetchThemes = async () => {
try {
const themesRef = doc(db, "system", "themes");
const snap = await getDoc(themesRef);
if (snap.exists() && snap.data().list) {
setPool(snap.data().list);
}
} catch (e) {
console.error(e);
}
};
fetchThemes();

return () => unsubscribeRoom();
}, [navigate]);

// --- usePresence（切断検知 & 通知はこれに任せる） ---
const { offlineUsers, isHostMissing } = usePresence(roomId, userId, roomData, addToast);

// ★修正: ここにあった手動の通知ロジック (prevMembersRef) を削除しました。
// これにより、FreeModeに入った瞬間の重複通知がなくなります。

// --- Spin ロジック ---
const handleSpin = async () => {
if (isSpinning) return;
if (pool.length === 0) {
addToast("エラー：お題がありません");
return;
}

try {
const roomRef = doc(db, "rooms", roomId);
await updateDoc(roomRef, { isSpinning: true });

setTimeout(async () => {
const finalPick = pool[Math.floor(Math.random() * pool.length)];
await updateDoc(roomRef, {
currentChallenge: finalPick,
isSpinning: false
});
}, 2000);

} catch (e) {
console.error("Spin error", e);
setIsSpinning(false);
}
};

// --- ローカル演出 ---
const [displayChallenge, setDisplayChallenge] = useState(currentChallenge);
useEffect(() => {
if (isSpinning && pool.length > 0) {
const interval = setInterval(() => {
const randomPick = pool[Math.floor(Math.random() * pool.length)];
setDisplayChallenge(randomPick);
}, 50);
if (navigator.vibrate) navigator.vibrate(50);
return () => clearInterval(interval);
} else {
setDisplayChallenge(currentChallenge);
}
}, [isSpinning, pool, currentChallenge]);


// --- ロビーに戻る処理 (ホスト専用) ---
const handleBackToLobbyClick = () => {
if (!isHost) return;
setShowBackToLobbyModal(true);
};

const confirmBackToLobby = async () => {
try {
const roomRef = doc(db, "rooms", roomId);

const resetMembers = members.map(m => {
if (m.isHost) {
return { ...m, isReady: true };
}
return { ...m, isReady: false };
});

await updateDoc(roomRef, {
status: 'setup',
currentChallenge: null,
isSpinning: false,
members: resetMembers
});
} catch (error) {
console.error("Back to lobby error:", error);
setShowBackToLobbyModal(false);
}
};

const handleForceLeave = async () => {
localStorage.removeItem('shibari_user_info');
navigate('/');
};

return (
<div className="w-full h-[100dvh] flex flex-col md:flex-row relative overflow-hidden text-white bg-slate-900">
<Toast messages={messages} onRemove={removeToast} />

{/* 背景エフェクト */}
<div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
<div className="w-[80vw] h-[80vw] border border-cyan-500/20 rounded-full animate-[spin_30s_linear_infinite]"></div>
<div className="absolute w-[60vw] h-[60vw] border border-purple-500/20 rounded-full animate-[spin_20s_linear_infinite_reverse]"></div>
</div>

{/* LEFT AREA: メインコンテンツ */}
<div className="flex-1 flex flex-col items-center justify-between relative z-10 h-full overflow-hidden">

{/* ヘッダー */}
<div className="flex-none pt-8 pb-4 text-center px-4">
<div className="inline-block px-4 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-mono tracking-widest text-gray-300 mb-2">
FREE MODE
</div>
<h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-400 drop-shadow-lg py-2 leading-tight px-2">
INSTANT SHIBARI
</h1>
</div>

{/* お題表示エリア */}
<div className="flex-1 w-full flex flex-col items-center justify-center p-4">
<AnimatePresence mode="wait">
{displayChallenge ? (
<motion.div
key={isSpinning ? "spinning" : displayChallenge.title}
initial={{ scale: 0.9, opacity: 0 }}
animate={{ scale: 1, opacity: 1 }}
transition={{ type: "spring", duration: 0.4 }}
className="w-full max-w-4xl flex flex-col items-center gap-6 text-center"
>
{/* お題タイトル */}
<div className="w-full">
<p className="text-cyan-400 font-mono tracking-[0.3em] text-xs md:text-sm font-bold mb-4 opacity-80">
CURRENT MISSION
</p>
<h2 className={`
font-black text-white leading-tight break-words drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]
${isSpinning ? 'blur-[2px] opacity-80 scale-95' : ''}
text-[clamp(2rem,5vw,5rem)] px-4
`}>
{displayChallenge.title}
</h2>
</div>

{/* クリア条件 */}
<motion.div
className={`mt-4 transition-all duration-300 ${isSpinning ? 'opacity-50 blur-sm' : 'opacity-100'}`}
>
<div className="inline-flex flex-col items-center justify-center px-8 py-5 md:px-12 md:py-8 rounded-2xl bg-gradient-to-br from-red-900/40 to-black/40 border-2 border-red-500/50 backdrop-blur-md shadow-[0_0_40px_rgba(220,38,38,0.2)]">
<p className="text-red-300 font-mono tracking-[0.3em] text-[10px] md:text-xs uppercase opacity-90 font-bold mb-1">
Clear Condition
</p>
<p className="font-black text-white tracking-widest text-xl md:text-3xl">
{displayChallenge.criteria}
</p>
</div>
</motion.div>
</motion.div>
) : (
// 初期状態
<div className="text-center opacity-40">
<div className="text-8xl mb-4 animate-bounce">🎲</div>
<p className="font-mono text-xl tracking-widest">
PRESS SPIN TO START
</p>
</div>
)}
</AnimatePresence>
</div>

{/* コントロールエリア */}
<div className="flex-none pb-8 md:pb-12 w-full flex flex-col items-center gap-6 px-4">

{/* SPINボタン */}
<button
onClick={handleSpin}
disabled={isSpinning}
className={`
relative group overflow-hidden w-full max-w-lg py-6 md:py-8 rounded-2xl font-black text-3xl md:text-4xl tracking-widest transition-all shadow-2xl
${isSpinning
? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed scale-95'
: 'bg-white text-black hover:scale-105 hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] active:scale-95'}
`}
>
<span className="relative z-10">{isSpinning ? "ROLLING..." : "SPIN !"}</span>
{!isSpinning && (
<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"></div>
)}
</button>

{/* 戻るボタン (ホストのみ) */}
{isHost && (
<button
onClick={handleBackToLobbyClick}
className="text-gray-500 hover:text-white transition-colors text-sm tracking-widest font-bold flex items-center gap-2"
>
<span>←</span> BACK TO LOBBY
</button>
)}
</div>
</div>

{/* RIGHT AREA: メンバーリスト */}
<div className="hidden md:flex w-[260px] flex-none bg-black/40 backdrop-blur-lg border-l border-white/10 flex-col z-20">
<div className="p-4 border-b border-white/10">
<h3 className="text-xs font-bold text-gray-400 tracking-widest flex items-center gap-2">
MEMBERS <span className="text-cyan-500">({members.length})</span>
</h3>
</div>
<div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
{members.map((member) => {
const isOffline = offlineUsers.has(member.id);
const isMe = member.id === userId;
return (
<div key={member.id} className={`p-3 rounded-lg border flex items-center gap-3 transition-all ${isMe ? 'bg-cyan-900/20 border-cyan-500/50' : 'bg-white/5 border-white/5'} ${isOffline ? 'opacity-50 grayscale' : ''}`}>
<div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-sm border border-white/10">
{member.avatar || '😎'}
</div>
<div className="min-w-0">
<div className="text-sm font-bold text-white truncate">{member.name} {isMe && <span className="text-[10px] text-cyan-400">(YOU)</span>}</div>
{member.isHost && <div className="text-[10px] text-yellow-500 font-mono leading-none mt-0.5">HOST</div>}
{isOffline && <div className="text-[10px] text-red-400 font-mono leading-none mt-0.5">OFFLINE</div>}
</div>
</div>
);
})}
</div>
</div>

{/* Mobile用メンバーアイコンリスト */}
<div className="md:hidden absolute top-4 left-4 z-30 flex -space-x-2 overflow-hidden pointer-events-none">
{members.slice(0, 5).map((m) => (
<div key={m.id} className={`w-8 h-8 rounded-full border-2 border-slate-900 bg-gray-700 flex items-center justify-center text-xs ${offlineUsers.has(m.id) ? 'grayscale opacity-50' : ''}`}>
{m.avatar || '😎'}
</div>
))}
{members.length > 5 && (
<div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-gray-800 flex items-center justify-center text-[10px] text-white">
+{members.length - 5}
</div>
)}
</div>

{/* ロビーに戻る確認モーダル */}
<AnimatePresence>
{showBackToLobbyModal && (
<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowBackToLobbyModal(false)} />
<motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden p-1">
<div className="bg-gradient-to-b from-cyan-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
<div className="w-16 h-16 rounded-full bg-cyan-900/30 border border-cyan-500/30 flex items-center justify-center text-3xl">🏠</div>
<div>
<h2 className="text-2xl font-black text-white tracking-widest mb-2">BACK TO LOBBY?</h2>
<p className="text-gray-400 text-sm font-mono">
ゲームを終了してロビーに戻りますか？
</p>
</div>
<div className="flex w-full gap-3 mt-2">
<button onClick={() => setShowBackToLobbyModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors">CANCEL</button>
<button onClick={confirmBackToLobby} className="flex-1 py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black tracking-widest text-sm shadow-lg shadow-cyan-900/50 transition-all hover:scale-[1.02]">GO LOBBY</button>
</div>
</div>
</motion.div>
</div>
)}
</AnimatePresence>

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