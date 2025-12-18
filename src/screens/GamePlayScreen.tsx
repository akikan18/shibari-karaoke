import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- データ定義 ---
type Challenge = {
  title: string;
  criteria: string;
};

const CHALLENGES: Challenge[] = [
  { title: "英語禁止で歌え！", criteria: "90点以上" },
  { title: "サビだけ裏声で！", criteria: "完走すること" },
  { title: "ずっと真顔で歌え！", criteria: "85点以上" },
  { title: "歌詞の「君」を「俺」に変えて！", criteria: "ミス3回以内" },
  { title: "ミュージカル風に！", criteria: "表現力90点以上" },
  { title: "こぶしを効かせまくれ！", criteria: "こぶし10回以上" },
  { title: "マイクを逆さまに持って！", criteria: "80点以上" },
  { title: "片足立ちで歌え！", criteria: "88点以上" },
  { title: "ビブラート禁止！", criteria: "ビブラート0回" },
  { title: "ラップ調で歌え！", criteria: "完走すること" },
  { title: "採点画面を見ずに歌え！", criteria: "85点以上" },
  { title: "1オクターブ上で歌え！", criteria: "完走すること" },
];

const MEMBERS = ["YAMADA", "SUZUKI", "TANAKA", "SATO", "ITO", "NAKAMURA"];

const getRandomChallenge = () => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];

type PlayerState = {
  name: string;
  challenge: Challenge;
};

export const GamePlayScreen = () => {
  const navigate = useNavigate();
  const [turn, setTurn] = useState(1);
  const [queue, setQueue] = useState<PlayerState[]>([]);
   
  // モーダルの表示状態管理
  const [showFinishModal, setShowFinishModal] = useState(false);

  // 初期化
  useEffect(() => {
    const initialQueue = MEMBERS.map(name => ({
      name: name,
      challenge: getRandomChallenge()
    }));
    setQueue(initialQueue);
  }, []);

  const handleNextTurn = (result: 'CLEAR' | 'FAILED') => {
    setQueue((prevQueue) => {
      const finishedPlayer = { ...prevQueue[0] };
      const nextQueue = prevQueue.slice(1);
      finishedPlayer.challenge = getRandomChallenge();
      nextQueue.push(finishedPlayer);
      return nextQueue;
    });
    setTurn((prev) => prev + 1);
  };

  // 終了ボタンクリック時（モーダルを開く）
  const handleFinishClick = () => {
    setShowFinishModal(true);
  };

  // 本当に終了して遷移する
  const confirmFinish = () => {
    navigate('/result');
  };

  // 背景色を削除 (bg-[#0f172a] -> transparent)
  if (queue.length === 0) return <div className="h-screen w-full flex items-center justify-center text-white">LOADING...</div>;

  const currentPlayer = queue[0];

  return (
    // 全体コンテナ: 背景色bg-[#0f172a]を削除し、Layoutの背景が見えるように修正
    <div className="w-full h-[100dvh] text-white overflow-hidden flex flex-col md:flex-row relative">
       
      {/* ==========================================
          LEFT AREA (Main Stage & Controls)
      ========================================== */}
      <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
        
        {/* Header */}
        <div className="flex-none h-20 flex justify-between items-center px-6 md:px-8 border-b border-white/10 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex-none w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-2xl shadow-[0_0_15px_cyan] border border-white/20">
              🎤
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                <p className="text-[10px] text-cyan-400 font-mono tracking-widest font-bold">NOW SINGING</p>
              </div>
              <motion.p 
                key={currentPlayer.name}
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }}
                className="text-white font-black leading-none truncate drop-shadow-md text-[clamp(1.5rem,3vw,3rem)]"
              >
                {currentPlayer.name}
              </motion.p>
            </div>
          </div>
          <div className="text-right flex-none pl-4">
            <div className="bg-white/5 px-3 py-1 rounded-lg border border-white/10">
              <p className="text-[10px] text-gray-400 font-mono tracking-widest leading-none mb-0.5">TURN</p>
              <p className="text-xl font-bold text-white/90 font-mono leading-none">#{String(turn).padStart(2, '0')}</p>
            </div>
          </div>
        </div>

        {/* Main Stage */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 relative w-full">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-[80%] h-[80%] border border-cyan-500/20 rounded-full animate-[spin_20s_linear_infinite] max-h-[500px] max-w-[500px]"></div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentPlayer.name + turn}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-2 md:gap-6 text-center"
            >
              <div className="w-full flex flex-col items-center">
                <div className="inline-block px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono tracking-[0.3em] text-[10px] md:text-xs mb-2 md:mb-4 font-bold">
                  CURRENT MISSION
                </div>
                <h1 className="font-black text-white drop-shadow-[0_0_30px_rgba(0,255,255,0.4)] leading-tight w-full whitespace-nowrap text-[clamp(20px,4vw,5rem)]">
                  {currentPlayer.challenge.title}
                </h1>
              </div>

              <div className="w-full flex justify-center mt-2 md:mt-4">
                <div className="w-auto max-w-full bg-gradient-to-br from-red-900/40 to-black/40 border-2 border-red-500/50 px-6 py-4 md:px-10 md:py-6 rounded-2xl backdrop-blur-md shadow-[0_0_40px_rgba(220,38,38,0.2)] flex flex-col items-center gap-1">
                  <p className="text-red-300 font-mono tracking-[0.3em] text-[10px] md:text-xs uppercase opacity-90 font-bold whitespace-nowrap">
                    Clear Condition
                  </p>
                  <p className="font-black text-white tracking-widest whitespace-nowrap text-[clamp(1.2rem,3vw,3rem)]">
                    {currentPlayer.challenge.criteria}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="flex-none px-4 pt-4 pb-8 md:px-6 md:pt-6 md:pb-12 bg-gradient-to-t from-black/80 to-transparent z-20 w-full">
          <div className="flex gap-3 md:gap-6 w-full max-w-5xl mx-auto h-20 md:h-24">
            <button 
              onClick={() => handleNextTurn('FAILED')}
              className="flex-1 rounded-xl md:rounded-2xl bg-[#1e293b]/80 backdrop-blur-sm border-2 border-[#334155] text-gray-400 hover:bg-[#334155] hover:text-white font-black text-xl md:text-2xl tracking-widest active:scale-95 transition-all flex flex-col items-center justify-center gap-1 group"
            >
              FAILED
              <span className="text-[10px] font-normal opacity-50 group-hover:opacity-100">失敗...</span>
            </button>

            <button 
              onClick={() => handleNextTurn('CLEAR')}
              className="flex-[2] rounded-xl md:rounded-2xl bg-gradient-to-r from-cyan-600/90 to-blue-600/90 backdrop-blur-sm border-0 text-white font-black text-2xl md:text-4xl italic tracking-widest shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_50px_rgba(6,182,212,0.6)] hover:scale-[1.02] active:scale-95 transition-all relative overflow-hidden group flex flex-col items-center justify-center gap-1"
            >
              <span className="relative z-10">CLEAR!!</span>
              <span className="relative z-10 text-[10px] md:text-sm font-bold text-cyan-100 tracking-normal opacity-80">成功！次の人へ</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 ease-in-out"></div>
            </button>
          </div>
        </div>
      </div>

      {/* ==========================================
          RIGHT AREA (Queue Sidebar)
      ========================================== */}
      {/* 背景を少し透過させてLayoutが見えるように調整 (bg-[#020617]/90 -> bg-black/60) */}
      <div className="hidden md:flex w-[300px] lg:w-[360px] flex-none bg-black/60 backdrop-blur-xl border-l border-white/10 flex-col relative z-20 shadow-2xl">
        <div className="p-4 md:p-6 border-b border-white/10 bg-white/5 flex-none">
          <h3 className="text-xs md:text-sm font-bold text-white tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>
            RESERVATION LIST
          </h3>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">
            WAITING: {queue.length - 1} MEMBERS
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
          {queue.slice(1).map((player, index) => (
            <motion.div
              layout 
              key={player.name} 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3 }}
              // カード背景も少し透過
              className="bg-black/40 border border-white/10 p-3 rounded-xl relative overflow-hidden group hover:border-cyan-500/30 transition-colors shrink-0"
            >
               <div className="absolute top-0 right-0 bg-white/10 px-2 py-1 rounded-bl-lg text-[10px] font-mono text-gray-400">
                 NEXT #{index + 1}
               </div>
               <div className="flex items-center gap-2 mb-2">
                 <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center text-xs">
                   👤
                 </div>
                 <span className="font-bold text-sm text-gray-200">{player.name}</span>
               </div>
               <div className="bg-black/40 rounded-lg p-2 border-l-2 border-cyan-500/50">
                 <p className="text-cyan-200 text-xs font-bold leading-snug break-words">{player.challenge.title}</p>
                 <div className="h-[1px] w-full bg-white/10 my-1"></div>
                 <p className="text-[10px] text-gray-400 font-mono">条件: <span className="text-gray-300">{player.challenge.criteria}</span></p>
               </div>
               {index === queue.length - 2 && (
                 <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-cyan-900/50 rounded text-[9px] text-cyan-300 border border-cyan-500/20 font-mono">
                   NEW
                 </div>
               )}
            </motion.div>
          ))}
          <div className="h-4"></div>
        </div>

        <div className="p-4 pb-8 md:pb-10 border-t border-white/10 bg-black/40 flex-none">
          <button 
            onClick={handleFinishClick}
            className="w-full py-3 md:py-4 rounded-xl border-2 border-red-500/30 text-red-400 font-bold tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2 group text-sm"
          >
            GAME FINISH
            <span className="text-[10px] opacity-60 ml-1 block md:inline">(結果へ)</span>
          </button>
        </div>
      </div>

      {/* モバイル用簡易リスト */}
      <div className="md:hidden w-full bg-black/60 backdrop-blur-md border-t border-white/10 p-4 pb-8 overflow-x-auto whitespace-nowrap flex gap-3 flex-none h-40 items-center">
         {queue.slice(1).map((player, index) => (
           <div key={player.name} className="inline-block w-40 bg-black/40 border border-white/10 rounded-lg p-3 flex-none h-full overflow-hidden">
             <div className="text-[10px] text-gray-500 mb-1">NEXT #{index + 1}</div>
             <div className="font-bold text-xs text-white mb-1 truncate">{player.name}</div>
             <div className="text-[10px] text-cyan-400 whitespace-normal line-clamp-2 leading-tight">{player.challenge.title}</div>
           </div>
         ))}
         <div className="inline-block align-top h-full">
            <button 
              onClick={handleFinishClick}
              className="h-full px-4 rounded-lg border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-900/50 flex items-center"
            >
              FINISH
            </button>
         </div>
      </div>


      {/* ==========================================
          FINISH CONFIRMATION MODAL (Popup)
      ========================================== */}
      <AnimatePresence>
        {showFinishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* 背景の黒いオーバーレイ (Blur付き) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowFinishModal(false)} // 背景クリックで閉じる
            ></motion.div>

            {/* モーダル本体 */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", bounce: 0.3 }}
              className="relative w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1"
            >
              {/* ガラス光沢 */}
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
              
              <div className="bg-black/40 rounded-xl p-8 flex flex-col items-center text-center gap-6">
                
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">
                  🏁
                </div>

                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest mb-2">FINISH GAME?</h2>
                  <p className="text-gray-400 text-sm font-mono">
                    ゲームを終了して結果発表へ移動しますか？<br/>
                    この操作は取り消せません。
                  </p>
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

    </div>
  );
};