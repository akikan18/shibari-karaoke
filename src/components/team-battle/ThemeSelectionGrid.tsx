import React from 'react';
import { motion } from 'framer-motion';
import { ThemeCard, cardTitle, cardCriteria } from '../../game/team-battle/theme';

type ThemeSelectionGridProps = {
  candidates: ThemeCard[];
  onSelect: (card: ThemeCard, index: number) => void;
  disabled?: boolean;
};

export const ThemeSelectionGrid = ({ candidates, onSelect, disabled = false }: ThemeSelectionGridProps) => {
  return (
    <div className="w-full flex-1 overflow-y-auto min-h-0 custom-scrollbar px-1 pb-2 md:overflow-visible md:h-auto">
      <div className="flex flex-col md:grid md:grid-cols-3 gap-2 md:gap-4 w-full">
        {candidates.map((cand, idx) => (
          <motion.button
            key={`${cardTitle(cand)}-${idx}`}
            whileHover={{ scale: 1.05, borderColor: '#facc15' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(cand, idx)}
            disabled={disabled}
            className="bg-black/80 backdrop-blur-md border border-white/20 hover:bg-yellow-900/40 p-4 md:p-6 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-2 transition-colors min-h-[100px] md:min-h-[160px] shrink-0 disabled:opacity-50"
          >
            <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">
              OPTION {idx + 1}
            </div>
            <h3 className="font-bold text-white text-base md:text-xl leading-tight break-all">{cardTitle(cand)}</h3>
            <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5">{cardCriteria(cand)}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
};
