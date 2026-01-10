import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

type ActionOverlayProps = {
  actionLog: any;
  onClose: () => void;
};

export const ActionOverlay = ({ actionLog, onClose }: ActionOverlayProps) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current?.();
    }, 2200);
    return () => clearTimeout(timer);
  }, [actionLog]);

  if (!actionLog) return null;

  const details = actionLog.detail ? String(actionLog.detail).split('\n') : [];
  const limited = details.slice(0, 4);
  const omitted = details.length - limited.length;

  const isSuccess = String(actionLog.title || '').toUpperCase().includes('SUCCESS');
  const headlineColor = isSuccess ? '#22c55e' : '#ef4444';

  return (
    <div className="fixed inset-0 z-[150] pointer-events-none flex items-center justify-center overflow-hidden">
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full bg-gradient-to-r from-black/80 via-black/95 to-black/80 border-y-2 border-white/20 py-6 md:py-9 flex flex-col items-center justify-center relative backdrop-blur-sm"
      >
        <div className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle at 50% 50%, ${headlineColor}22, transparent 60%)` }} />

        <div className="text-[10px] md:text-xs font-mono tracking-[0.4em] text-white/60">TURN RESULT</div>
        <h2 className="text-2xl md:text-5xl font-black italic tracking-widest px-4 text-center mb-3" style={{ color: headlineColor, textShadow: `0 0 18px ${headlineColor}66` }}>
          {actionLog.title}
        </h2>

        <div className="flex flex-col gap-2 items-center w-full px-4">
          {limited.map((line: string, idx: number) => {
            const isNegative = line.includes('(-') || line.includes(' -') || line.includes('(-');
            const isTeam = line.startsWith('TEAM ');
            const colorClasses = isTeam
              ? isNegative
                ? 'text-red-300 border-red-500/30 bg-red-900/20'
                : 'text-cyan-200 border-cyan-500/30 bg-cyan-900/20'
              : 'text-white border-white/10 bg-black/30';

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + idx * 0.05 }}
                className={`text-sm md:text-2xl font-bold px-5 py-2 rounded-full border ${colorClasses}`}
              >
                {line}
              </motion.div>
            );
          })}
          {omitted > 0 && <div className="text-[10px] md:text-xs font-mono tracking-widest text-white/40">+{omitted} more (see LOG)</div>}
        </div>
      </motion.div>
    </div>
  );
};
