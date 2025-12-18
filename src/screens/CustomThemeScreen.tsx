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
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // モーダル管理
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // 入力用State
  const [inputTitle, setInputTitle] = useState('');
  const [inputCriteria, setInputCriteria] = useState('');

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
    
    // リセットして閉じる
    setInputTitle('');
    setInputCriteria('');
    setShowAddModal(false);
  };

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(itemId => itemId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const executeDelete = () => {
    const newThemes = themes.filter(t => !selectedIds.includes(t.id));
    setThemes(newThemes);
    localStorage.setItem('shibari_custom_themes', JSON.stringify(newThemes));
    setSelectedIds([]);
    setShowDeleteModal(false);
  };

  return (
    // 背景色を指定せず(transparent)、Layoutの背景が見えるようにする
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
            onClick={() => {
              if (window.confirm('全て初期状態に戻しますか？')) {
                setThemes(DEFAULT_THEMES.map(t => ({ ...t, isCustom: false })));
                localStorage.removeItem('shibari_custom_themes');
                setSelectedIds([]);
              }
            }}
            className="text-[10px] md:text-xs text-white/40 hover:text-red-400 transition-colors tracking-widest border border-white/10 px-3 py-1 rounded hover:bg-white/5"
          >
            RESET
          </button>
        </div>

        {/* 追加ボタン (ここをクリックで入力モーダルが開く) */}
        <button 
          onClick={() => setShowAddModal(true)}
          className="w-full md:w-auto mb-6 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/50 text-cyan-300 px-6 py-4 rounded-xl font-black tracking-widest shadow-[0_0_15px_rgba(6,182,212,0.2)] flex items-center justify-center gap-2 transition-all hover:scale-[1.01] shrink-0"
        >
          <span className="text-xl leading-none">＋</span> ADD NEW MISSION
        </button>

        {/* リストエリア */}
        {/* 下部に十分な余白(pb-32)を持たせて、固定ボタンと被らないようにする */}
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

      {/* 戻るボタン (最下部固定) */}
      <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
        <button 
          onClick={() => navigate('/')} 
          className="pointer-events-auto text-gray-400 hover:text-white transition-colors text-xs font-bold tracking-widest flex items-center gap-2 px-6 py-3 bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg"
        >
          <span>←</span> BACK TO TITLE
        </button>
      </div>


      {/* --- モーダルエリア --- */}

      {/* 追加モーダル */}
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

      {/* 削除確認モーダル */}
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

    </div>
  );
};