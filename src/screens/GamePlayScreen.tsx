import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- Firebase Imports ---
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// --- デフォルトのお題データ ---
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

export const GamePlayScreen = () => {
  const navigate = useNavigate();

  // --- State ---
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [isHost, setIsHost] = useState(false);
  
  // Firestoreからの同期データ
  const [members, setMembers] = useState<any[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [currentChallenge, setCurrentChallenge] = useState({ title: "お題を選出中...", criteria: "..." });
  const [turnCount, setTurnCount] = useState(1);

  // お題リスト
  const [challengeList, setChallengeList] = useState(DEFAULT_CHALLENGES);

  // モーダル
  const [showFinishModal, setShowFinishModal] = useState(false);

  // --- 初期化 & 監視 ---
  useEffect(() => {
    // 1. ユーザー情報取得
    const storedUser = localStorage.getItem('shibari_user_info');
    if (!storedUser) {
      navigate('/');
      return;
    }
    const userInfo = JSON.parse(storedUser);
    setRoomId(userInfo.roomId);
    setUserId(userInfo.userId);
    setIsHost(userInfo.isHost);

    // 2. カスタムお題の読み込み
    const storedThemes = localStorage.getItem('shibari_custom_themes');
    if (storedThemes) {
      const customs = JSON.parse(storedThemes);
      if (customs.length > 0) {
        setChallengeList([...customs, ...DEFAULT_CHALLENGES]);
      }
    }

    // 3. Firestore監視
    const roomRef = doc(db, "rooms", userInfo.roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        setMembers(data.members || []);
        
        if (data.currentTurnIndex !== undefined) setCurrentTurnIndex(data.currentTurnIndex);
        if (data.turnCount !== undefined) setTurnCount(data.turnCount);
        if (data.currentChallenge) setCurrentChallenge(data.currentChallenge);

        if (data.status === 'finished') {
          navigate('/result');
        }

        // 初回起動時（ホストのみ）：お題初期化
        if (userInfo.isHost && !data.currentChallenge && (data.members || []).length > 0) {
          initFirstTurn(roomRef);
        }
      } else {
        navigate('/'); // 部屋がない場合
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // --- ヘルパー: ランダムお題取得 ---
  const getRandomChallenge = () => {
    const randomIndex = Math.floor(Math.random() * challengeList.length);
    return challengeList[randomIndex];
  };

  // --- アクション: 最初のターン初期化 (Host Only) ---
  const initFirstTurn = async (roomRef: any) => {
    const firstChallenge = getRandomChallenge();
    await updateDoc(roomRef, {
      currentTurnIndex: 0,
      turnCount: 1,
      currentChallenge: firstChallenge
    });
  };

  // --- アクション: 次のターンへ (スコア加算ロジック追加) ---
  const handleNextTurn = async (result: 'CLEAR' | 'FAILED') => {
    if (members.length === 0) return;

    // 1. スコア更新計算
    // 現在のメンバーリストをコピーして編集
    const newMembers = [...members];
    const currentPlayer = newMembers[currentTurnIndex];

    if (result === 'CLEAR') {
      // CLEARなら +1000点 (またはランダム等、ルールに合わせて変更可)
      const currentScore = currentPlayer.score || 0;
      currentPlayer.score = currentScore + 1000;
    }
    // FAILEDならスコア変動なし

    // 2. 次の順番計算
    let nextIndex = currentTurnIndex + 1;
    if (nextIndex >= members.length) nextIndex = 0; // ループ

    // 3. 次のお題決定
    const nextChallenge = getRandomChallenge();

    try {
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, {
        members: newMembers, // スコア更新済みのリストを保存
        currentTurnIndex: nextIndex,
        turnCount: turnCount + 1,
        currentChallenge: nextChallenge,
      });
    } catch (error) {
      console.error("Error updating turn:", error);
    }
  };

  // --- アクション: ゲーム終了 ---
  const confirmFinish = async () => {
    try {
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, { status: 'finished' });
    } catch (error) {
      console.error("Error finishing game:", error);
    }
  };


  // --- 描画用データ準備 ---
  if (members.length === 0) return <div className="h-screen w-full flex items-center justify-center text-white">LOADING DATA...</div>;

  const currentPlayer = members[currentTurnIndex] || members[0];
  const isMyTurn = currentPlayer.id === userId;
  const canControl = isHost || isMyTurn;

  return (
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
                key={currentPlayer.id} 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }}
                className="text-white font-black leading-none truncate drop-shadow-md text-[clamp(1.5rem,3vw,3rem)]"
              >
                {currentPlayer.name}
              </motion.p>
            </div>
          </div>
          <div className="text-right flex-none pl-4">
             {/* ★修正: 現在のプレイヤーのスコアを表示 */}
             <div className="mb-1">
                <p className="text-[8px] text-gray-400 font-mono tracking-widest leading-none text-right">CURRENT SCORE</p>
                <motion.p 
                  key={currentPlayer.score || 0}
                  initial={{ scale: 1.2, color: '#22d3ee' }}
                  animate={{ scale: 1, color: '#ffffff' }}
                  className="text-xl font-black font-mono leading-none text-right"
                >
                  {(currentPlayer.score || 0).toLocaleString()}
                </motion.p>
             </div>
            <div className="bg-white/5 px-3 py-1 rounded-lg border border-white/10 inline-block">
              <p className="text-[8px] text-gray-400 font-mono tracking-widest leading-none mb-0.5 text-center">TURN</p>
              <p className="text-lg font-bold text-white/90 font-mono leading-none">#{String(turnCount).padStart(2, '0')}</p>
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
              key={currentChallenge.title + turnCount}
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
                  {currentChallenge.title}
                </h1>
              </div>

              <div className="w-full flex justify-center mt-2 md:mt-4">
                <div className="w-auto max-w-full bg-gradient-to-br from-red-900/40 to-black/40 border-2 border-red-500/50 px-6 py-4 md:px-10 md:py-6 rounded-2xl backdrop-blur-md shadow-[0_0_40px_rgba(220,38,38,0.2)] flex flex-col items-center gap-1">
                  <p className="text-red-300 font-mono tracking-[0.3em] text-[10px] md:text-xs uppercase opacity-90 font-bold whitespace-nowrap">
                    Clear Condition
                  </p>
                  <p className="font-black text-white tracking-widest whitespace-nowrap text-[clamp(1.2rem,3vw,3rem)]">
                    {currentChallenge.criteria}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="flex-none px-4 pt-4 pb-8 md:px-6 md:pt-6 md:pb-12 bg-gradient-to-t from-black/80 to-transparent z-20 w-full">
          <div className="flex gap-3 md:gap-6 w-full max-w-5xl mx-auto h-20 md:h-24">
            
            {canControl ? (
              <>
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
                  <span className="relative z-10 text-[10px] md:text-sm font-bold text-cyan-100 tracking-normal opacity-80">成功 (+1000pts)</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 ease-in-out"></div>
                </button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/40 border border-white/10 rounded-xl md:rounded-2xl backdrop-blur-md">
                <p className="text-gray-400 font-mono tracking-widest animate-pulse">
                  WAITING FOR {currentPlayer.name.toUpperCase()}'S RESULT...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==========================================
          RIGHT AREA (Queue Sidebar)
      ========================================== */}
      <div className="hidden md:flex w-[300px] lg:w-[360px] flex-none bg-black/60 backdrop-blur-xl border-l border-white/10 flex-col relative z-20 shadow-2xl">
        <div className="p-4 md:p-6 border-b border-white/10 bg-white/5 flex-none">
          <h3 className="text-xs md:text-sm font-bold text-white tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>
            MEMBER LIST
          </h3>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">
            TOTAL: {members.length} MEMBERS
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
          {members.map((member, index) => {
            const isCurrent = index === currentTurnIndex;
            
            return (
              <motion.div
                layout 
                key={member.id} 
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={`
                  p-3 rounded-xl relative overflow-hidden group transition-all shrink-0 border
                  ${isCurrent 
                    ? 'bg-cyan-900/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)] order-first' 
                    : 'bg-black/40 border-white/10 hover:border-white/30 order-last'}
                `}
              >
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center text-lg">
                     {member.avatar}
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className={`font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-gray-400'}`}>
                            {member.name}
                        </span>
                         {/* ★修正: リスト内にもスコア表示 */}
                        <span className="text-xs font-mono text-cyan-400 font-bold">
                            {(member.score || 0).toLocaleString()}
                        </span>
                      </div>
                   </div>
                 </div>
              </motion.div>
            );
          })}
          <div className="h-4"></div>
        </div>

        {/* ホストのみ終了ボタン表示 */}
        {isHost && (
          <div className="p-4 pb-8 md:pb-10 border-t border-white/10 bg-black/40 flex-none">
            <button 
              onClick={() => setShowFinishModal(true)}
              className="w-full py-3 md:py-4 rounded-xl border-2 border-red-500/30 text-red-400 font-bold tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2 group text-sm"
            >
              GAME FINISH
              <span className="text-[10px] opacity-60 ml-1 block md:inline">(結果へ)</span>
            </button>
          </div>
        )}
      </div>

      {/* モバイル用簡易リスト */}
      <div className="md:hidden w-full bg-black/60 backdrop-blur-md border-t border-white/10 p-4 pb-8 overflow-x-auto whitespace-nowrap flex gap-3 flex-none h-24 items-center">
         {isHost && (
            <div className="inline-block align-top h-full">
              <button 
                onClick={() => setShowFinishModal(true)}
                className="h-full px-4 rounded-lg border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-900/50 flex items-center"
              >
                FINISH
              </button>
           </div>
         )}
         <div className="text-xs text-gray-500 ml-2">
            NEXT: {members[(currentTurnIndex + 1) % members.length]?.name}
         </div>
      </div>

      {/* 終了確認モーダル */}
      <AnimatePresence>
        {showFinishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowFinishModal(false)}
            ></motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", bounce: 0.3 }}
              className="relative w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1"
            >
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