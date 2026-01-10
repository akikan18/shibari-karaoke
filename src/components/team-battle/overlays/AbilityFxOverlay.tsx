import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TeamId } from '../../../game/team-battle/roles';

export type AbilityFx = null | {
  timestamp: number;
  kind: 'SKILL' | 'ULT';
  actorName: string;
  roleName: string;
  team?: TeamId;
  title?: string;
  subtitle?: string;
};

type AbilityFxOverlayProps = {
  fx: AbilityFx;
  onDone: () => void;
};

export const AbilityFxOverlay = ({ fx, onDone }: AbilityFxOverlayProps) => {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const ts = fx?.timestamp ?? 0;

  useEffect(() => {
    if (!fx || !ts) return;
    const timer = setTimeout(() => {
      onDoneRef.current?.();
    }, 1400);
    return () => clearTimeout(timer);
  }, [ts, fx]);

  if (!fx) return null;

  const isUlt = fx.kind === 'ULT';
  const color = isUlt ? '#f59e0b' : '#06b6d4';
  const shadow = isUlt ? 'rgba(245,158,11,0.55)' : 'rgba(6,182,212,0.55)';

  return (
    <div className="fixed inset-0 z-[170] pointer-events-none flex items-center justify-center">
      <motion.div key={`fx-bg-${fx.timestamp}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/85" />
      <motion.div
        key={`fx-burst-${fx.timestamp}`}
        initial={{ scale: 0.7, opacity: 0, filter: 'blur(10px)' }}
        animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 1.05, filter: 'blur(8px)' }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-5xl px-4"
      >
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.25], opacity: [0, 0.35, 0] }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute inset-0 rounded-[999px]"
          style={{ border: `2px solid ${color}66`, boxShadow: `0 0 70px ${shadow}` }}
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute -inset-6"
          style={{
            background:
              `radial-gradient(circle at 20% 30%, ${color}55 0%, transparent 40%),` +
              `radial-gradient(circle at 80% 40%, ${color}33 0%, transparent 45%),` +
              `radial-gradient(circle at 50% 75%, ${color}44 0%, transparent 50%)`,
            filter: 'blur(18px)',
          }}
        />
        <div className="relative mx-auto rounded-2xl border border-white/15 bg-black/40 backdrop-blur-md py-10 md:py-14 px-6 md:px-10 text-center overflow-hidden">
          <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(135deg, ${color}33, transparent)` }} />
          <div className="relative z-10">
            <div className="text-[10px] md:text-xs font-mono tracking-[0.3em] text-white/70">
              {fx.team ? `TEAM ${fx.team} ・ ` : ''}
              {fx.kind} ACTIVATED
            </div>
            <div className="mt-2 text-[clamp(2rem,6vw,5rem)] font-black italic tracking-tight" style={{ color, textShadow: `0 0 28px ${shadow}` }}>
              {fx.kind}
            </div>
            <div className="mt-2 text-white/90 font-black tracking-widest text-base md:text-2xl">{fx.actorName}</div>
            <div className="mt-1 text-white/60 font-mono text-xs md:text-sm tracking-widest">{fx.roleName}</div>
            {(fx.title || fx.subtitle) && (
              <div className="mt-3 text-[11px] md:text-sm text-white/70 font-mono tracking-widest">
                {fx.title && <div>{fx.title}</div>}
                {fx.subtitle && <div className="opacity-80">{fx.subtitle}</div>}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
