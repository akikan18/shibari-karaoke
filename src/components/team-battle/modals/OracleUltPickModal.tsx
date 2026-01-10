import React from 'react';
import { motion } from 'framer-motion';
import { TeamId } from '../../../game/team-battle/roles';
import { ThemeCard, cardTitle, cardCriteria } from '../../../game/team-battle/theme';

export type OracleUltPickItem = {
  targetId: string;
  targetName: string;
  team: TeamId;
  choices: ThemeCard[];
};

export type OracleUltPickState = null | {
  active: true;
  createdAt: number;
  byId: string;
  byName: string;
  targetTeam: TeamId; // enemy team
  idx: number; // current pick index
  items: OracleUltPickItem[];
};

type OracleUltPickModalProps = {
  state: OracleUltPickState;
  busy: boolean;
  canControl: boolean;
  onClose: () => void;
  onPick: (targetId: string, cand: ThemeCard) => void;
};

export const OracleUltPickModal = ({
  state,
  busy,
  canControl,
  onClose,
  onPick,
}: OracleUltPickModalProps) => {
  if (!state) return null;
  const item = state.items?.[state.idx];
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[245] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={() => !busy && onClose()} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-5xl rounded-2xl border border-white/15 bg-[#0f172a] p-1 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-xl p-6 md:p-8 bg-gradient-to-b from-white/5 to-black/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-mono tracking-widest text-yellow-300">ORACLE ULT</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-white mt-1">CHOOSE ENEMY THEME</div>
              <div className="text-[11px] md:text-xs font-mono tracking-widest text-white/50 mt-1">
                {state.byName} が選択中（敵は選択できません） / {state.idx + 1} / {state.items.length}
              </div>
            </div>
            <button
              disabled={busy}
              onClick={onClose}
              className="px-3 py-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-xs font-black tracking-widest"
            >
              CLOSE
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-[10px] font-mono tracking-widest text-white/40">TARGET</div>
            <div className="text-white font-black mt-1">
              {item.targetName} <span className="text-white/50 text-sm font-mono">/ TEAM {item.team}</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {item.choices.map((cand, i) => (
              <button
                key={`${item.targetId}-${i}-${cardTitle(cand)}`}
                disabled={busy || !canControl}
                onClick={() => onPick(item.targetId, cand)}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  busy || !canControl ? 'border-white/10 bg-black/20 opacity-60 cursor-not-allowed' : 'border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 hover:scale-[1.01]'
                }`}
              >
                <div className="text-[9px] font-mono tracking-widest text-yellow-200">OPTION {i + 1}</div>
                <div className="mt-1 text-white font-black break-words">{cardTitle(cand)}</div>
                <div className="mt-1 text-[11px] text-white/60 font-mono break-words">{cardCriteria(cand)}</div>
              </button>
            ))}
          </div>

          {!canControl && (
            <div className="mt-4 text-[10px] font-mono tracking-widest text-red-300 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
              YOU CANNOT CONTROL THIS ORACLE PICK
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
