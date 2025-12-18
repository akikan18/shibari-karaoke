// src/screens/FreeModeScreen.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// デフォルトのお題リスト
const DEFAULT_CHALLENGES = [
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

export const FreeModeScreen = () => {
  const navigate = useNavigate();
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [currentChallenge, setCurrentChallenge] = useState<{ title: string; criteria: string } | null>(null);
  
  // 表示用のお題リスト
  const [pool, setPool] = useState(DEFAULT_CHALLENGES);

  useEffect(() => {
    const stored = localStorage.getItem('shibari_custom_themes');
    if (stored) {
      const customThemes = JSON.parse(stored);
      const formattedCustom = customThemes.map((t: any) => ({
        title: t.title,
        criteria: t.criteria
      }));
      setPool([...DEFAULT_CHALLENGES, ...formattedCustom]);
    }
  }, []);

  const handleSpin = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setCurrentChallenge(null);

    if (navigator.vibrate) navigator.vibrate(50);

    let count = 0;
    const maxCount = 20; 
    const interval = setInterval(() => {
      const randomPick = pool[Math.floor(Math.random() * pool.length)];
      setCurrentChallenge(randomPick);
      count++;

      if (count >= maxCount) {
        clearInterval(interval);
        const finalPick = pool[Math.floor(Math.random() * pool.length)];
        setCurrentChallenge(finalPick);
        setIsSpinning(false);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    }, 50);
  };

  return (
    <div className="w-full h-[90vh] flex flex-col items-center relative overflow-hidden text-white">
      
      {/* 背景エフェクト (GamePlayScreenに合わせる) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <div className="w-[80vw] h-[80vw] border border-cyan-500/20 rounded-full animate-[spin_30s_linear_infinite]"></div>
        <div className="absolute w-[60vw] h-[60vw] border border-purple-500/20 rounded-full animate-[spin_20s_linear_infinite_reverse]"></div>
      </div>

      {/* ヘッダーエリア */}
      <div className="flex-none pt-8 pb-4 text-center z-10">
         <div className="inline-block px-4 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-mono tracking-widest text-gray-300 mb-2">
           FREE MODE
         </div>
         <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-400 drop-shadow-lg">
           INSTANT SHIBARI
         </h1>
      </div>

      {/* メインエリア (GamePlayScreen同様、中央にドーンと配置) */}
      <div className="flex-1 w-full flex flex-col items-center justify-center p-4 relative z-10">
        <AnimatePresence mode="wait">
          {currentChallenge ? (
            <motion.div
              key={currentChallenge.title + isSpinning}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-full max-w-6xl flex flex-col items-center gap-6 text-center"
            >
              {/* お題タイトル */}
              <div className="w-full">
                <p className="text-cyan-400 font-mono tracking-[0.3em] text-xs md:text-sm font-bold mb-4 opacity-80">
                  CURRENT MISSION
                </p>
                <h2 className={`
                  font-black text-white leading-tight break-words drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]
                  ${isSpinning ? 'blur-sm scale-95 opacity-70' : ''}
                  text-[clamp(2.5rem,6vw,6rem)]
                `}>
                  {currentChallenge.title}
                </h2>
              </div>

              {/* クリア条件 (GamePlayScreenの赤いボックス風) */}
              {!isSpinning && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-8"
                >
                  <div className="inline-flex flex-col items-center justify-center px-10 py-6 rounded-2xl bg-gradient-to-br from-red-900/40 to-black/40 border-2 border-red-500/50 backdrop-blur-md shadow-[0_0_40px_rgba(220,38,38,0.2)]">
                    <p className="text-red-300 font-mono tracking-[0.3em] text-xs uppercase opacity-90 font-bold mb-1">
                      Clear Condition
                    </p>
                    <p className="font-black text-white tracking-widest text-2xl md:text-4xl">
                      {currentChallenge.criteria}
                    </p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            // 初期状態
            <div className="text-center opacity-40">
              <div className="text-8xl mb-4 animate-bounce">🎲</div>
              <p className="font-mono text-xl tracking-widest">PRESS SPIN TO START</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* フッターエリア (ボタン配置) */}
      <div className="flex-none pb-12 w-full flex flex-col items-center gap-6 z-10 px-4">
        
        {/* SPINボタン (GamePlayScreenのCLEARボタンのような巨大で押しやすいデザイン) */}
        <button
          onClick={handleSpin}
          disabled={isSpinning}
          className={`
            relative group overflow-hidden w-full max-w-lg py-6 md:py-8 rounded-2xl font-black text-3xl md:text-4xl tracking-widest transition-all shadow-2xl
            ${isSpinning 
              ? 'bg-gray-800 text-gray-600 border border-gray-700 cursor-not-allowed scale-95' 
              : 'bg-white text-black hover:scale-105 hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] active:scale-95'}
          `}
        >
          <span className="relative z-10">{isSpinning ? "ROLLING..." : "SPIN !"}</span>
          {/* 光の反射エフェクト */}
          {!isSpinning && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"></div>
          )}
        </button>

        {/* 戻るボタン */}
        <button 
          onClick={() => navigate('/menu')}
          className="text-gray-500 hover:text-white transition-colors text-sm tracking-widest font-bold flex items-center gap-2"
        >
          <span>←</span> BACK TO MENU
        </button>
      </div>

    </div>
  );
};