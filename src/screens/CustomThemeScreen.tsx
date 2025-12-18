// src/screens/CustomThemeScreen.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const DEFAULT_THEMES = [
  { id: 'd1', title: "英語禁止で歌え！", criteria: "90点以上" },
  { id: 'd2', title: "サビだけ裏声で！", criteria: "完走すること" },
  { id: 'd3', title: "ずっと真顔で歌え！", criteria: "85点以上" },
];

type ThemeItem = {
  id: string;
  title: string;
  criteria: string;
  isCustom: boolean; 
};

export const CustomThemeScreen = () => {
  const navigate = useNavigate();
  const [inputTitle, setInputTitle] = useState('');
  const [inputCriteria, setInputCriteria] = useState('');
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  
  // 複数選択用のState (IDの配列)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 削除確認モーダルの表示
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('shibari_custom_themes');
    if (stored) {
      setThemes(JSON.parse(stored));
    } else {
      const initialData = DEFAULT_THEMES.map(t => ({ ...t, isCustom: false }));
      setThemes(initialData);
    }
  }, []);

  const handleAdd = () => {
    if (!inputTitle.trim() || !inputCriteria.trim()) return;
    const newTheme: ThemeItem = {
      id: Date.now().toString(),
      title: inputTitle,
      criteria: inputCriteria,
      isCustom: true
    };
    const newThemes = [newTheme, ...themes];
    setThemes(newThemes);
    localStorage.setItem('shibari_custom_themes', JSON.stringify(newThemes));
    setInputTitle('');
    setInputCriteria('');
  };

  // 選択の切り替え（トグル）
  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(itemId => itemId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // 実際に削除を実行
  const executeDelete = () => {
    const newThemes = themes.filter(t => !selectedIds.includes(t.id));
    setThemes(newThemes);
    localStorage.setItem('shibari_custom_themes', JSON.stringify(newThemes));
    setSelectedIds([]); // 選択解除
    setShowDeleteModal(false); // モーダル閉じる
  };

  return (
    <div className="w-full h-screen text-white flex flex-col items-center relative overflow-hidden">
      <div className="w-full max-w-7xl flex flex-col h-full px-4 py-8 md:py-12 relative z-10">
        
        {/* ヘッダー */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              EDIT THEMES
            </h1>
            <div className="h-[2px] w-24 bg-cyan-500 mt-2 shadow-[0_0_10px_cyan]"></div>
          </div>
          <button 
            onClick={() => {
              if (window.confirm('全て初期状態に戻しますか？')) {
                setThemes(DEFAULT_THEMES.map(t => ({ ...t, isCustom: false })));
                localStorage.removeItem('shibari_custom_themes');
                setSelectedIds([]);
              }
            }}
            className="text-[10px] md:text-xs text-white/40 hover:text-red-400 transition-colors tracking-widest border border-white/10 px-3 py-1 rounded hover:bg-white/5"
          >
            RESET DEFAULT
          </button>
        </div>

        {/* 入力エリア */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 mb-8 shadow-lg">
          <div className="flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-[3] w-full group">
              <label className="text-[10px] font-bold text-cyan-400 tracking-widest block mb-2 opacity-70">NEW MISSION</label>
              <input type="text" value={inputTitle} onChange={(e) => setInputTitle(e.target.value)} placeholder="Ex: 英語禁止で歌え！" className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-lg font-bold text-white focus:border-cyan-500 focus:bg-black/40 focus:outline-none transition-all placeholder:text-white/10" />
            </div>
            <div className="flex-[2] w-full group">
              <label className="text-[10px] font-bold text-red-400 tracking-widest block mb-2 opacity-70">CONDITION</label>
              <input type="text" value={inputCriteria} onChange={(e) => setInputCriteria(e.target.value)} placeholder="Ex: 85点以上" className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-lg font-bold text-white focus:border-red-500 focus:bg-black/40 focus:outline-none transition-all placeholder:text-white/10" />
            </div>
            <button onClick={handleAdd} disabled={!inputTitle || !inputCriteria} className="w-full md:w-auto px-8 py-3 rounded-lg border border-cyan-500/50 text-cyan-400 font-black tracking-widest hover:bg-cyan-500 hover:text-white hover:shadow-[0_0_20px_cyan] transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cyan-400 disabled:cursor-not-allowed h-[52px]">ADD</button>
          </div>
        </div>

        {/* 選択中のアクションバー（浮いているボタン） */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-24 md:bottom-32 left-0 right-0 z-30 flex justify-center pointer-events-none"
            >
              <button 
                onClick={() => setShowDeleteModal(true)}
                className="pointer-events-auto bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-full font-black tracking-widest shadow-[0_0_30px_rgba(220,38,38,0.5)] flex items-center gap-3 transition-transform hover:scale-105 active:scale-95"
              >
                <span>DELETE SELECTED</span>
                <span className="bg-white text-red-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">{selectedIds.length}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* リストエリア */}
        <div className="flex-1 overflow-y-auto pr-2 pb-20 custom-scrollbar">
          <p className="text-xs text-gray-500 font-mono mb-2 text-right">
            {selectedIds.length === 0 ? "TAP CARD TO SELECT" : `${selectedIds.length} ITEMS SELECTED`}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                      h-full backdrop-blur-sm border rounded-xl p-5 transition-all duration-200 flex flex-col justify-between relative overflow-hidden
                      ${isSelected 
                        ? 'bg-cyan-900/30 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10'}
                    `}>
                      {/* 選択時のチェックマーク演出 */}
                      <div className={`
                        absolute top-3 right-3 w-6 h-6 rounded border transition-all flex items-center justify-center
                        ${isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-white/20 group-hover:border-white/40'}
                      `}>
                        {isSelected && <span className="text-black font-bold text-sm">✓</span>}
                      </div>

                      <div className="pr-8">
                        <h3 className={`font-bold text-lg leading-tight mb-2 transition-colors ${isSelected ? 'text-cyan-200' : 'text-white'}`}>
                          {theme.title}
                        </h3>
                        <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-cyan-400' : 'bg-red-500'}`}></span>
                          {theme.criteria}
                        </p>
                      </div>

                      {theme.isCustom && !isSelected && (
                         <div className="absolute bottom-3 right-3">
                           <span className="text-[9px] font-bold text-cyan-500/50 border border-cyan-500/10 px-1.5 py-0.5 rounded tracking-widest">CUSTOM</span>
                         </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            
            {themes.length === 0 && (
              <div className="col-span-full text-center py-20 opacity-50">
                <p className="text-4xl mb-4">📝</p>
                <p className="font-mono text-sm tracking-widest">NO THEMES REGISTERED</p>
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="absolute bottom-12 left-0 w-full flex justify-center pointer-events-none">
          <button onClick={() => navigate('/')} className="pointer-events-auto text-gray-500 hover:text-white transition-colors text-xs font-bold tracking-widest flex items-center gap-2 px-6 py-3"><span>←</span> BACK TO TITLE</button>
        </div>
      </div>

      {/* 削除確認モーダル */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowDeleteModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden p-1">
              <div className="bg-gradient-to-b from-red-900/20 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">🗑️</div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest mb-2">DELETE {selectedIds.length} ITEMS?</h2>
                  <p className="text-gray-400 text-sm font-mono">
                    選択したお題を削除しますか？<br/>
                    この操作は元に戻せません。
                  </p>
                </div>
                <div className="flex w-full gap-3 mt-2">
                  <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors">CANCEL</button>
                  <button onClick={executeDelete} className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]">DELETE ALL</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};