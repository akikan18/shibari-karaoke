import React from 'react';
import { motion } from 'framer-motion';

export type TargetModalState = null | {
  title: string;
  mode: 'ally' | 'enemy';
  action: 'coach_skill' | 'coach_ult' | 'saboteur_skill' | 'oracle_skill' | 'hype_skill';
};

type TargetModalProps = {
  isOpen: boolean;
  title: string;
  busy: boolean;
  targets: any[];
  onClose: () => void;
  onPick: (id: string) => void;
};

export const TargetModal = ({
  isOpen,
  title,
  busy,
  targets,
  onClose,
  onPick,
}: TargetModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !busy && onClose()} />
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0f172a] p-1 overflow-hidden">
        <div className="rounded-xl p-5 bg-gradient-to-b from-white/5 to-black/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-black tracking-wider">{title}</div>
            <button className="px-3 py-1 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 text-xs" onClick={onClose} disabled={busy}>
              CLOSE
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {targets.map((m: any) => (
              <button key={m.id} disabled={busy} onClick={() => onPick(m.id)} className="p-3 rounded-xl border border-white/10 bg-black/30 hover:bg-white/10 text-left transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">{m.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{m.name}</div>
                    <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">
                      TEAM {m.team} ・ ROLE {m.role?.name || '—'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {targets.length === 0 && <div className="text-[12px] text-white/50 font-mono tracking-widest">NO VALID TARGET</div>}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
