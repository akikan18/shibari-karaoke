import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, setDoc, getDoc } from 'firebase/firestore';

type ThemeItem = {
  id: string;
  title: string;
  criteria: string;
  isCustom: boolean; 
};

// アラート表示用の型
type AlertInfo = {
  type: 'success' | 'error';
  title: string;
  message: string;
} | null;

export const CustomThemeScreen = () => {
  const navigate = useNavigate();
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // --- モーダル管理 State ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // リセット用モーダル State
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [alertInfo, setAlertInfo] = useState<AlertInfo>(null);
  
  // 入力用 State
  const [inputTitle, setInputTitle] = useState('');
  const [inputCriteria, setInputCriteria] = useState('');
  const [inputPassword, setInputPassword] = useState(''); // パスワード入力用

  // Firestoreからリアルタイム取得
  useEffect(() => {
    const themesRef = doc(db, "system", "themes");
    const unsubscribe = onSnapshot(themesRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.list && Array.isArray(data.list)) {
          setThemes(data.list);
        } else {
          setThemes([]);
        }
      } else {
        setThemes([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // 追加処理
  const handleAdd = async () => {
    if (!inputTitle.trim() || !inputCriteria.trim()) return;
    
    const newTheme: ThemeItem = {
      id: Date.now().toString(),
      title: inputTitle,
      criteria: inputCriteria,
      isCustom: true
    };

    try {
      const themesRef = doc(db, "system", "themes");
      const docSnap = await getDoc(themesRef);
      const currentList = docSnap.exists() ? (docSnap.data().list || []) : [];
      const newList = [newTheme, ...currentList];
      await setDoc(themesRef, { list: newList }, { merge: true });
      
      setInputTitle('');
      setInputCriteria('');
      setShowAddModal(false);
    } catch (error) {
      console.error("Error adding theme:", error);
      setAlertInfo({ type: 'error', title: 'ERROR', message: '追加に失敗しました' });
    }
  };

  // 選択処理
  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(itemId => itemId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // 削除実行
  const executeDelete = async () => {
    try {
      const themesRef = doc(db, "system", "themes");
      const docSnap = await getDoc(themesRef);
      if (docSnap.exists()) {
        const currentList = docSnap.data().list || [];
        const newList = currentList.filter((t: any) => !selectedIds.includes(t.id));
        await updateDoc(themesRef, { list: newList });
      }
      setSelectedIds([]);
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting themes:", error);
      setAlertInfo({ type: 'error', title: 'ERROR', message: '削除に失敗しました' });
    }
  };

  // --- リセットフロー ---

  // 1. リセットボタンクリック -> 確認モーダル表示
  const startResetProcess = () => {
    setShowResetConfirmModal(true);
  };

  // 2. 確認モーダルでYES -> パスワードモーダルへ
  const proceedToPassword = () => {
    setShowResetConfirmModal(false);
    setInputPassword('');
    setShowPasswordModal(true);
  };

  // 3. パスワード送信 -> 判定して実行
  const submitPassword = async () => {
    if (inputPassword !== 'password') {
      setShowPasswordModal(false);
      setAlertInfo({ type: 'error', title: 'ACCESS DENIED', message: 'パスワードが間違っています。' });
      return;
    }

    try {
      const themesRef = doc(db, "system", "themes");
      await updateDoc(themesRef, { list: [] });
      setSelectedIds([]);
      setShowPasswordModal(false);
      setAlertInfo({ type: 'success', title: 'SUCCESS', message: '全てのお題を削除しました。' });
    } catch (error) {
      console.error("Error resetting themes:", error);
      setShowPasswordModal(false);
      setAlertInfo({ type: 'error', title: 'ERROR', message: 'エラーが発生しました。' });
    }
  };

  return (
    <div className="w-full h-[100dvh] flex flex-col items-center relative overflow-hidden">
      <div className="w-full max-w-7xl flex flex-col h-full px-4 py-6 md:py-12 relative z-10">
        
        {/* ヘッダーエリア */}
        <div className="flex justify-between items-end mb-4 shrink-0">
          <div>
            <h1 className="text-3xl md:text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              EDIT THEMES
            </h1>
            <div className="h-[2px] w-24 bg-cyan-500 mt-2 shadow-[0_0_10px_cyan]"></div>
          </div>
          <button 
            onClick={startResetProcess}
            className="text-[10px] md:text-xs text-white/40 hover:text-red-400 transition-colors tracking-widest border border-white/10 px-3 py-1 rounded hover:bg-white/5"
          >
            RESET
          </button>
        </div>

        {/* 追加ボタン */}
        <button 
          onClick={() => setShowAddModal(true)}
          className="w-full md:w-auto mb-6 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/50 text-cyan-300 px-6 py-4 rounded-xl font-black tracking-widest shadow-[0_0_15px_rgba(6,182,212,0.2)] flex items-center justify-center gap-2 transition-all hover:scale-[1.01] shrink-0"
        >
          <span className="text-xl leading-none">＋</span> ADD NEW MISSION
        </button>

        {/* リストエリア */}
        <div className="flex-1 overflow-y-auto pr-2 pb-32 custom-scrollbar">
          <p className="text-xs text-gray-400 font-mono mb-2 text-right">
            {selectedIds.length === 0 ? "TAP TO SELECT" : `${selectedIds.length} SELECTED`}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {themes.map((theme) => {
                const isSelected = selectedIds.includes(theme.id);
                return (
                  <motion.div
                    key={theme.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => toggleSelection(theme.id)}
                    className="group relative cursor-pointer"
                  >
                    <div className={`
                      min-h-[100px] backdrop-blur-md border rounded-xl p-4 transition-all duration-200 flex flex-col justify-between relative overflow-hidden
                      ${isSelected 
                        ? 'bg-cyan-900/60 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
                        : 'bg-black/40 border-white/10 hover:bg-white/10'}
                    `}>
                      <div className={`
                        absolute top-3 right-3 w-5 h-5 rounded border transition-all flex items-center justify-center
                        ${isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-white/20'}
                      `}>
                        {isSelected && <span className="text-black font-bold text-xs">✓</span>}
                      </div>

                      <div className="pr-6">
                        <h3 className={`font-bold text-lg leading-tight mb-2 transition-colors ${isSelected ? 'text-cyan-200' : 'text-white'}`}>
                          {theme.title}
                        </h3>
                        <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-cyan-400' : 'bg-red-500'}`}></span>
                          {theme.criteria}
                        </p>
                      </div>
                      
                      {theme.isCustom && !isSelected && (
                         <div className="absolute bottom-2 right-2">
                           <span className="text-[9px] font-bold text-cyan-500/50 border border-cyan-500/10 px-1.5 py-0.5 rounded tracking-widest">CUSTOM</span>
                         </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            
            {themes.length === 0 && (
              <div className="col-span-full text-center py-10 opacity-50">
                <p className="font-mono text-sm tracking-widest">NO THEMES REGISTERED</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- 固定配置レイヤー --- */}

      {/* 削除ボタン (選択時のみ出現) */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-0 right-0 z-40 flex justify-center pointer-events-none px-4"
          >
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="pointer-events-auto w-full max-w-md bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-full font-black tracking-widest shadow-[0_0_30px_rgba(220,38,38,0.5)] flex items-center justify-center gap-3 transition-transform hover:scale-105 active:scale-95 border border-red-400/50"
            >
              <span>DELETE SELECTED</span>
              <span className="bg-white text-red-600 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">{selectedIds.length}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 戻るボタン */}
      <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
        <button 
          onClick={() => navigate('/')} 
          className="pointer-events-auto text-gray-400 hover:text-white transition-colors text-xs font-bold tracking-widest flex items-center gap-2 px-6 py-3 bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg"
        >
          <span>←</span> BACK TO TITLE
        </button>
      </div>


      {/* --- モーダルエリア (すべて画面内デザイン) --- */}

      {/* 1. 追加モーダル */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAddModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-lg bg-[#0f172a] border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden p-6">
              <h2 className="text-xl font-black text-white tracking-widest mb-6 flex items-center gap-2">
                <span className="text-cyan-400">＋</span> ADD NEW MISSION
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-cyan-400 tracking-widest block mb-1 opacity-70">MISSION TITLE</label>
                  <input autoFocus type="text" value={inputTitle} onChange={(e) => setInputTitle(e.target.value)} placeholder="Ex: 英語禁止で歌え！" className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-lg font-bold text-white focus:border-cyan-500 focus:outline-none placeholder:text-white/10" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-red-400 tracking-widest block mb-1 opacity-70">CLEAR CONDITION</label>
                  <input type="text" value={inputCriteria} onChange={(e) => setInputCriteria(e.target.value)} placeholder="Ex: 85点以上" className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-lg font-bold text-white focus:border-red-500 focus:outline-none placeholder:text-white/10" />
                </div>
              </div>
              <div className="flex w-full gap-3 mt-8">
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm">CANCEL</button>
                <button onClick={handleAdd} disabled={!inputTitle || !inputCriteria} className="flex-1 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black tracking-widest text-sm shadow-lg shadow-cyan-900/50 disabled:opacity-50">ADD</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. 通常削除確認モーダル */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowDeleteModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-2xl">🗑️</div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-widest mb-2">DELETE {selectedIds.length} ITEMS?</h2>
                  <p className="text-gray-400 text-xs font-mono">この操作は元に戻せません。</p>
                </div>
                <div className="flex w-full gap-3 mt-4">
                  <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm">CANCEL</button>
                  <button onClick={executeDelete} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50">DELETE</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. リセット確認モーダル (WARNING) */}
      <AnimatePresence>
        {showResetConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowResetConfirmModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-red-600 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.4)] overflow-hidden p-1">
              <div className="bg-gradient-to-b from-red-950/80 to-black p-8 flex flex-col items-center text-center gap-6 rounded-xl">
                <div className="text-4xl animate-pulse">⚠️</div>
                <div>
                  <h2 className="text-2xl font-black text-red-500 tracking-widest mb-2">WARNING</h2>
                  <p className="text-white text-sm font-bold leading-relaxed">
                    全てのお題を削除しようとしています。<br/>
                    <span className="text-red-300 text-xs font-mono mt-1 block opacity-80">この操作は全員に反映され、元に戻せません。</span>
                  </p>
                </div>
                <div className="flex w-full gap-3 mt-2">
                  <button onClick={() => setShowResetConfirmModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm">CANCEL</button>
                  <button onClick={proceedToPassword} className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50">PROCEED</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. パスワード入力モーダル */}
      <AnimatePresence>
        {showPasswordModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowPasswordModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-sm bg-[#0f172a] border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-6 z-[101]">
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <h3 className="text-lg font-black text-white tracking-widest mb-1">ADMIN AUTHENTICATION</h3>
                  <p className="text-xs text-gray-400 font-mono">パスワードを入力してください</p>
                </div>
                <input 
                  autoFocus 
                  type="password" 
                  value={inputPassword} 
                  onChange={(e) => setInputPassword(e.target.value)} 
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-lg text-center font-bold text-white focus:border-cyan-500 focus:outline-none tracking-widest"
                  placeholder="••••••••"
                />
                <div className="flex w-full gap-3 mt-2">
                  <button onClick={() => setShowPasswordModal(false)} className="flex-1 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-xs">CANCEL</button>
                  <button onClick={submitPassword} className="flex-1 py-3 rounded-lg bg-white text-black hover:bg-gray-200 font-black tracking-widest text-xs">CONFIRM</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. アラート(結果/エラー)モーダル */}
      <AnimatePresence>
        {alertInfo && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setAlertInfo(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className={`relative w-full max-w-sm bg-[#0f172a] border rounded-2xl shadow-2xl overflow-hidden p-1 ${alertInfo.type === 'error' ? 'border-red-500/50 shadow-red-900/20' : 'border-cyan-500/50 shadow-cyan-900/20'}`}>
               <div className={`p-6 rounded-xl flex flex-col items-center text-center gap-4 ${alertInfo.type === 'error' ? 'bg-red-900/10' : 'bg-cyan-900/10'}`}>
                  <div className="text-3xl">{alertInfo.type === 'error' ? '🚫' : '✅'}</div>
                  <div>
                    <h3 className={`text-lg font-black tracking-widest ${alertInfo.type === 'error' ? 'text-red-400' : 'text-cyan-400'}`}>{alertInfo.title}</h3>
                    <p className="text-sm text-gray-300 mt-1">{alertInfo.message}</p>
                  </div>
                  <button onClick={() => setAlertInfo(null)} className="mt-2 w-full py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold tracking-widest text-xs">CLOSE</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};