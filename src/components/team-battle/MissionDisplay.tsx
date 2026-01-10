import React from 'react';
import { motion } from 'framer-motion';

type MissionDisplayProps = {
  title: string;
  criteria: string;
  stateText?: string;
};

export const MissionDisplay = React.memo(({ title, criteria, stateText }: MissionDisplayProps) => {
  const displayTitle = stateText || title;

  const getTitleStyle = (text: string) => {
    const len = (text || '').length;
    if (len > 50) return 'text-[clamp(0.9rem,3.5vw,1.5rem)]';
    if (len > 30) return 'text-[clamp(1.1rem,4.5vw,2rem)]';
    if (len > 15) return 'text-[clamp(1.4rem,6vw,3rem)]';
    return 'text-[clamp(2rem,8vw,5rem)]';
  };

  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.05, opacity: 0 }} transition={{ type: 'spring', duration: 0.5 }} className="relative z-10 w-full max-w-6xl flex flex-col items-center gap-2 md:gap-4 text-center px-2">
      <div className="w-full flex flex-col items-center mt-1 md:mt-2 px-2 overflow-visible">
        <div className="inline-block px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono tracking-[0.2em] text-[8px] md:text-xs mb-1 md:mb-2 font-bold">
          CURRENT THEME
        </div>

        <div className="w-full px-1">
          <h1 className={`font-black text-white drop-shadow-[0_0_20px_rgba(0,255,255,0.35)] leading-tight w-full whitespace-pre-wrap break-words text-center [text-wrap:balance] ${getTitleStyle(displayTitle)}`}>
            {displayTitle}
          </h1>
        </div>
      </div>

      <div className="w-full flex justify-center mt-2 md:mt-4">
        <div className="w-auto max-w-full bg-gradient-to-br from-red-900/40 to-black/40 border border-red-500/50 px-4 py-2 md:px-10 md:py-6 rounded-xl backdrop-blur-md shadow-[0_0_30px_rgba(220,38,38,0.2)] flex flex-col items-center gap-0.5">
          <p className="text-red-300 font-mono tracking-[0.2em] text-[8px] md:text-xs uppercase opacity-90 font-bold whitespace-nowrap">Clear Condition</p>
          <p className="font-black text-white tracking-widest text-[clamp(1.2rem,4vw,3rem)] md:text-[3rem] whitespace-pre-wrap break-words">{criteria}</p>
        </div>
      </div>
    </motion.div>
  );
});

MissionDisplay.displayName = 'MissionDisplay';
