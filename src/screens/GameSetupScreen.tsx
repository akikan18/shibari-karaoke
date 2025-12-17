// src/screens/GameSetupScreen.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

// 初期メンバー（自分以外）
const initialOthers = [
  { id: 2, name: 'Yamada', isReady: true, avatar: '👑' },
  { id: 3, name: 'Suzuki', isReady: true, avatar: '🎤' },
  { id: 4, name: 'Tanaka', isReady: true, avatar: '🥁' },
];

export const GameSetupScreen = () => {
  const navigate = useNavigate();
  
  // ロード状態管理
  const [isLoading, setIsLoading] = useState(true);

  // 自分の情報
  const [myInfo, setMyInfo] = useState({ name: 'You', avatar: '👤', isHost: false });
  const [members, setMembers] = useState<any[]>([]);
  
  // 自分のReady状態
  const [myReadyStatus, setMyReadyStatus] = useState(false);

  // 部屋の状態
  const [roomStatus, setRoomStatus] = useState<'WAITING' | 'SELECTING' | 'SELECTED'>('WAITING');
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  // 1. 起動時にローカルストレージからユーザー情報を取得
  useEffect(() => {
    const stored = localStorage.getItem('shibari_user_info');
    if (stored) {
      const parsed = JSON.parse(stored);
      setMyInfo(parsed);
      
      // ホストなら初期状態を SELECTED にする簡易ロジック
      if (parsed.isHost) {
        setRoomStatus('SELECTED');
        setSelectedMode("SHIBARI KARAOKE");
      } else {
        setRoomStatus('SELECTING'); // ゲストは選択待ち
      }

      // メンバーリスト構築
      setMembers([
        { id: 1, name: parsed.name, isReady: false, avatar: parsed.avatar },
        ...initialOthers
      ]);
      
      setIsLoading(false); // 読み込み完了
    } else {
      // 情報がない場合はエントランスへ
      navigate('/');
    }
  }, [navigate]);


  // 2. Guestの場合、ホストの選択を待つ演出
  useEffect(() => {
    if (!isLoading && !myInfo.isHost && roomStatus === 'SELECTING') {
      const timer = setTimeout(() => {
        setSelectedMode("SHIBARI KARAOKE");
        setRoomStatus('SELECTED');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [roomStatus, myInfo.isHost, isLoading]);


  // 3. 自分のReady状態同期
  useEffect(() => {
    setMembers(prev => prev.map(m => m.id === 1 ? { ...m, isReady: myReadyStatus } : m));
  }, [myReadyStatus]);

  
  // 読み込み中は何も表示しない
  if (isLoading) return <div className="bg-[#0f172a] h-screen w-full"></div>;

  return (
    <div className="w-full max-w-5xl flex flex-col gap-8 h-[85vh] relative">
      
      {/* ヘッダー */}
      <motion.div 
        layout
        className="flex flex-col md:flex-row items-center justify-between bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-lg relative overflow-hidden"
      >
        {roomStatus === 'SELECTING' && (
          <div className="absolute inset-0 bg-cyan-900/10 animate-pulse pointer-events-none"></div>
        )}

        <div className="flex flex-col items-center md:items-start z-10">
          <p className="text-cyan-400 text-xs font-bold tracking-[0.3em] uppercase mb-1">Room ID</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-widest font-mono">
            8891
          </h2>
        </div>

        {/* ステータス表示 */}
        <div className="flex flex-col items-center md:items-end mt-4 md:mt-0 z-10">
          <AnimatePresence mode="wait">
            {roomStatus === 'SELECTING' && (
              <motion.div 
                key="selecting"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-end"
              >
                <div className="flex items-center gap-3 mb-1">
                  <div className="loading loading-spinner loading-sm text-cyan-400"></div>
                  <p className="text-cyan-400 font-bold tracking-widest text-sm animate-pulse">
                    HOST IS SELECTING MODE...
                  </p>
                </div>
                <p className="text-[10px] text-gray-400 font-mono">ホストが次のゲームを選んでいます</p>
              </motion.div>
            )}

            {roomStatus === 'SELECTED' && (
              <motion.div 
                key="selected"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-end"
              >
                <p className="text-[10px] text-gray-400 font-mono tracking-widest mb-1">NEXT GAME MODE</p>
                <p className="text-2xl font-black text-white italic tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                  {selectedMode}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>


      {/* メンバーリスト */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <AnimatePresence>
            {members.map((member, index) => (
              <motion.div
                key={member.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative group"
              >
                <div className={`
                  backdrop-blur-md border p-6 rounded-xl flex flex-col items-center gap-4 transition-all duration-300
                  ${member.id === 1 ? 'bg-cyan-900/20 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'bg-black/40 border-white/10'}
                `}>
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-800 to-black border-2 border-white/10 flex items-center justify-center text-4xl shadow-inner relative">
                    {member.avatar}
                    {member.isReady && (
                      <div className="absolute -bottom-1 -right-1 bg-cyan-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow-[0_0_10px_cyan]">
                        READY
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <h3 className="text-lg font-bold text-white tracking-wider truncate max-w-[150px]">
                      {member.name} {member.id === 1 && "(YOU)"}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono mt-1">
                      {member.id === 1 && myInfo.isHost ? "HOST" : `PLAYER 0${index + 1}`}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>


      {/* フッター操作エリア */}
      <motion.div 
        layout
        className="flex items-center justify-between gap-4 pt-4 border-t border-white/10 bg-[#0f172a]/80 backdrop-blur-sm sticky bottom-0 p-4 -mx-4 rounded-t-2xl z-20"
      >
        <Link to="/" className="btn btn-ghost text-gray-400 hover:text-white">
          ← LEAVE ROOM
        </Link>
        
        <AnimatePresence mode="wait">
          
          {/* A. ゲストの場合: READYボタン */}
          {!myInfo.isHost && (
            <div className="flex gap-4">
              {roomStatus === 'SELECTING' ? (
                <div className="flex items-center gap-3 px-6 py-3 bg-white/5 rounded-lg border border-white/10">
                   <span className="loading loading-dots loading-sm text-cyan-500"></span>
                   <span className="text-gray-300 font-bold tracking-widest text-sm">WAITING FOR HOST</span>
                </div>
              ) : (
                <button 
                  onClick={() => setMyReadyStatus(!myReadyStatus)}
                  className={`
                    btn btn-lg px-8 border-0 font-black tracking-widest transition-all
                    ${myReadyStatus 
                      ? 'bg-transparent border-2 border-cyan-500 text-cyan-400 hover:bg-cyan-900/20' 
                      : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:scale-105 shadow-[0_0_20px_cyan]'}
                  `}
                >
                  {myReadyStatus ? "CANCEL READY" : "READY TO START!"}
                </button>
              )}
            </div>
          )}

          {/* B. ホストの場合: GAME STARTボタン */}
          {myInfo.isHost && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="relative group"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg blur opacity-40 group-hover:opacity-100 transition duration-500 animate-pulse"></div>
              <button 
                onClick={() => navigate('/game-play')}
                className="btn btn-lg px-12 border-0 bg-gradient-to-r from-cyan-600 to-blue-700 text-white font-black text-2xl tracking-widest relative rounded-lg hover:scale-105 transition-transform"
              >
                GAME START
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>

    </div>
  );
};