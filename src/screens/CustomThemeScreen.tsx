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
  
  // ★追加: 選択中のアイテムID（削除ボタン表示用）
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // 親要素へのイベント伝播を止める
    const newThemes = themes.filter(t => t.id !== id);
    setThemes(newThemes);
    localStorage.setItem('shibari_custom_themes', JSON.stringify(newThemes));
    setSelectedId(null); // 削除後は選択解除
  };

  return (
    // ★背景タップで選択解除
    <div 
      className="w-full h-screen text-white flex flex-col items-center relative overflow-hidden"
      onClick={() => setSelectedId(null)}
    >
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
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('カスタムしたお題を全て消去し、初期状態に戻しますか？')) {
                setThemes(DEFAULT_THEMES.map(t => ({ ...t, isCustom: false })));
                localStorage.removeItem('shibari_custom_themes');
              }
            }}
            className="text-[10px] md:text-xs text-white/40 hover:text-red-400 transition-colors tracking-widest border border-white/10 px-3 py-1 rounded hover:bg-white/5"
          >
            RESET DEFAULT
          </button>
        </div>

        {/* 入力エリア */}
        <div 
          className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 mb-10 shadow-lg"
          onClick={(e) => e.stopPropagation()} // 入力欄タップでは選択解除しない
        >
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

        {/* リストエリア */}
        <div className="flex-1 overflow-y-auto pr-2 pb-20 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {themes.map((theme) => (
                <motion.div
                  key={theme.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    // 既に選択中なら解除、違えば選択
                    setSelectedId(selectedId === theme.id ? null : theme.id);
                  }}
                >
                  <div className={`
                    h-full backdrop-blur-sm border rounded-xl p-5 transition-all duration-300 flex flex-col justify-between
                    ${selectedId === theme.id 
                      ? 'bg-white/10 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' 
                      : 'bg-white/5 border-white/10 hover:border-white/30'}
                  `}>
                    <div>
                      <h3 className="font-bold text-white text-lg leading-tight mb-2">{theme.title}</h3>
                      <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>{theme.criteria}
                      </p>
                    </div>
                    {theme.isCustom && (
                      <div className="absolute top-3 right-3">
                         <span className="text-[9px] font-bold text-cyan-500/70 border border-cyan-500/20 px-1.5 py-0.5 rounded tracking-widest">CUSTOM</span>
                      </div>
                    )}

                    {/* ★DELETEボタン: 選択中のみ表示 */}
                    <AnimatePresence>
                      {selectedId === theme.id && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute bottom-3 right-3"
                        >
                          <button 
                            onClick={(e) => handleDelete(e, theme.id)}
                            className="bg-red-600 hover:bg-red-500 text-white text-xs font-black tracking-widest px-4 py-2 rounded shadow-lg shadow-red-900/50 active:scale-95 transition-all"
                          >
                            DELETE
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
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
    </div>
  );
};