import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// --- Firebase Imports ---
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } } };
const itemVariants = { hidden: { y: 20, opacity: 0, scale: 0.95 }, show: { y: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 100 } } };

export const MenuScreen = () => {
  const navigate = useNavigate();
  const [showExitModal, setShowExitModal] = useState(false);
  const [roomId, setRoomId] = useState<string>("----");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('shibari_user_info');
    if (stored) {
      const { roomId } = JSON.parse(stored);
      setRoomId(roomId);
    } else {
      navigate('/');
    }
  }, [navigate]);

  // mode: 'standard' | 'team' | 'free'
  const handleSelectMode = async (mode: 'standard' | 'team' | 'free') => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, { mode: mode });
      navigate('/game-setup');
    } catch (error) {
      console.error("Error updating mode:", error);
      setIsProcessing(false);
    }
  };

  const handleExitConfirm = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const roomRef = doc(db, "rooms", roomId);
      await deleteDoc(roomRef);
      localStorage.removeItem('shibari_user_info');
      navigate('/');
    } catch (error) {
      console.error("Error deleting room:", error);
      navigate('/');
    }
  };

  return (
    <div className="w-full min-h-[80vh] flex flex-col items-center relative pb-10">
      
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 w-full flex justify-center md:justify-end md:top-10 md:right-12 z-20 pointer-events-none"
      >
        <div className="flex flex-col items-center md:items-end bg-black/50 backdrop-blur md:bg-transparent px-4 py-2 rounded-full md:p-0 border border-white/10 md:border-none">
          <p className="text-[8px] md:text-[10px] font-bold text-cyan-400 tracking-widest opacity-70">ROOM ID</p>
          <p className="text-2xl md:text-3xl font-black text-white font-mono tracking-widest drop-shadow-[0_0_10px_cyan]">
            {roomId}
          </p>
        </div>
      </motion.div>

      <motion.div variants={containerVariants} initial="hidden" animate="show" className="w-full max-w-6xl flex flex-col gap-8 items-center mt-24 md:mt-12 px-4">
        <motion.div variants={itemVariants} className="text-center mb-4">
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-widest uppercase drop-shadow-lg">Select Game Mode</h2>
          <div className="h-[2px] w-24 bg-cyan-500 mx-auto mt-4 shadow-[0_0_10px_cyan]"></div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          
          {/* STANDARD */}
          <MenuCard 
            onClick={() => handleSelectMode('standard')}
            title="STANDARD"
            subtitle="個人戦バトル"
            description="全員がライバル。お題をクリアしてスコアを競うクラシックモード。"
            color="cyan"
            icon={<span className="text-4xl">👑</span>}
          />

          {/* TEAM BATTLE (New) */}
          <MenuCard 
            onClick={() => handleSelectMode('team')}
            title="TEAM BATTLE"
            subtitle="チーム対抗戦"
            description="2チームに分かれて対決。固有ロールとスキルを駆使して勝利を掴め。"
            color="red" // 赤系のデザイン
            icon={<span className="text-4xl">⚔️</span>}
          />

          {/* FREE MODE */}
          <MenuCard 
            onClick={() => handleSelectMode('free')}
            title="FREE MODE"
            subtitle="単発お題ガチャ"
            description="スコアや勝敗を気にせず、ランダムにお題を出して遊びたい時に。"
            color="blue"
            icon={<span className="text-4xl">🧪</span>}
          />
        </div>

        <motion.div variants={itemVariants} className="mt-8">
          <button onClick={() => setShowExitModal(true)} className="btn btn-ghost text-white/50 hover:text-white transition-colors tracking-widest text-xs">← BACK TO ENTRANCE (DISBAND ROOM)</button>
        </motion.div>
      </motion.div>

      {/* Exit Modal (Same as before) */}
      <AnimatePresence>
        {showExitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowExitModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1">
              <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">🔚</div>
                <div><h2 className="text-2xl font-black text-white tracking-widest mb-2">DISBAND ROOM?</h2><p className="text-gray-400 text-sm font-mono">ルームを解散してタイトル画面に戻りますか？</p></div>
                <div className="flex w-full gap-3 mt-2">
                  <button onClick={() => setShowExitModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors">CANCEL</button>
                  <button onClick={handleExitConfirm} className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]">YES, DISBAND</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MenuCard = ({ onClick, title, subtitle, description, icon, color }: any) => {
  const colorClasses: Record<string, string> = { 
    cyan: "group-hover:border-cyan-500/50 group-hover:shadow-[0_0_50px_rgba(6,182,212,0.2)]", 
    blue: "group-hover:border-blue-500/50 group-hover:shadow-[0_0_50px_rgba(59,130,246,0.2)]",
    red:  "group-hover:border-red-500/50 group-hover:shadow-[0_0_50px_rgba(239,68,68,0.2)]" 
  };
  const iconColors: Record<string, string> = { 
    cyan: "text-cyan-400 group-hover:text-cyan-300", 
    blue: "text-blue-400 group-hover:text-blue-300",
    red:  "text-red-400 group-hover:text-red-300" 
  };
  const gradientColors: Record<string, string> = {
    cyan: "group-hover:from-cyan-500/10 group-hover:to-cyan-500/5",
    blue: "group-hover:from-blue-500/10 group-hover:to-blue-500/5",
    red:  "group-hover:from-red-500/10 group-hover:to-red-500/5"
  };
  const barColors: Record<string, string> = {
    cyan: "via-cyan-500", blue: "via-blue-500", red: "via-red-500"
  };

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -5 }} className="h-full">
      <div onClick={onClick} className={`block h-full relative group perspective-1000 cursor-pointer`}>
        <div className={`relative h-full overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 transition-all duration-500 p-6 flex flex-col items-center text-center gap-4 ${colorClasses[color]}`}>
          <div className={`absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-transparent ${gradientColors[color]} transition-all duration-500`}></div>
          <div className={`p-4 rounded-full bg-black/30 border border-white/5 shadow-inner transition-colors duration-300 ${iconColors[color]}`}>{icon}</div>
          <div className="relative z-10">
            <h3 className="text-2xl font-black italic tracking-wider text-white mb-1">{title}</h3>
            <p className={`text-xs font-bold uppercase tracking-widest mb-3 opacity-70 ${iconColors[color]}`}>{subtitle}</p>
            <p className="text-sm text-gray-400 leading-relaxed group-hover:text-gray-200 transition-colors">{description}</p>
          </div>
          <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent ${barColors[color]} to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500`}></div>
        </div>
      </div>
    </motion.div>
  );
};