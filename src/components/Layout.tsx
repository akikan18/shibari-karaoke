// src/components/Layout.tsx
import React from 'react';
import { motion } from 'framer-motion';

type LayoutProps = {
  children: React.ReactNode;
};

// 浮遊する粒子のコンポーネント
const Particle = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ y: 0, opacity: 0 }}
    animate={{ y: -100, opacity: [0, 1, 0] }}
    transition={{ duration: 10, repeat: Infinity, delay, ease: "linear" }}
    className="absolute w-1 h-1 bg-cyan-300/30 rounded-full blur-[1px]"
    style={{ left: `${Math.random() * 100}%`, top: `${50 + Math.random() * 50}%` }}
  />
);

export const Layout = ({ children }: LayoutProps) => {
  return (
    // 全体のテーマ：高級感のあるダークブルーベース
    // flex flex-col を追加して、直下の要素（main）が伸縮できるようにします
    <div className="min-h-screen bg-[#0f172a] text-white font-sans overflow-hidden relative flex flex-col selection:bg-cyan-500/30">
      
      {/* --- 背景演出 --- */}
      <div className="fixed inset-0 pointer-events-none z-0 perspective-1000">
        {/* ベースのグラデーション */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1e293b] via-[#0f172a] to-[#020617]"></div>
        
        {/* ゆっくり動くオーロラ光 */}
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[10%] w-[80vw] h-[80vw] bg-cyan-500/10 blur-[150px] rounded-full mix-blend-screen"
        ></motion.div>
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[-20%] right-[5%] w-[70vw] h-[70vw] bg-blue-600/10 blur-[120px] rounded-full mix-blend-screen"
        ></motion.div>

        {/* 浮遊する粒子（塵）のエフェクト - 20個生成 */}
        {[...Array(20)].map((_, i) => (
          <Particle key={i} delay={i * 0.5} />
        ))}

        {/* 微細なグリッド（質感） */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_100%)]"></div>
      </div>

      {/* --- メインコンテンツ --- */}
      {/* 修正点: 
         1. min-h-screen -> flex-1 (親のflexコンテナに合わせて伸縮)
         2. p-6 を削除 (余白をなくして画面いっぱいに)
         3. items-center justify-center を削除 (子コンポーネント側でレイアウト制御させるため)
            ※もし子要素を常に真ん中に置きたい場合は flex flex-col items-center justify-center を復活させてください
      */}
      <main className="w-full flex-1 relative z-10 flex flex-col">
        {children}
      </main>

    </div>
  );
};