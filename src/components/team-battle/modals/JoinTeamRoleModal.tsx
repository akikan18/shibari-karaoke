import React from 'react';
import { motion } from 'framer-motion';
import { ALL_ROLES, RoleId, TeamId } from '../../../game/team-battle/roles';

type JoinTeamRoleModalProps = {
  isOpen: boolean;
  step: 'team' | 'role';
  busy: boolean;
  teamCounts: { A: number; B: number };
  usedRoleIds: Set<RoleId>;
  onPickTeam: (t: TeamId) => void;
  onPickRole: (r: RoleId) => void;
  onBack: () => void;
};

export const JoinTeamRoleModal = ({
  isOpen,
  step,
  busy,
  teamCounts,
  usedRoleIds,
  onPickTeam,
  onPickRole,
  onBack,
}: JoinTeamRoleModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative w-full max-w-3xl rounded-2xl border border-white/15 bg-[#0f172a] p-1 overflow-hidden">
        <div className="rounded-xl p-6 md:p-8 bg-gradient-to-b from-white/5 to-black/40">
          {step === 'team' ? (
            <>
              <h2 className="text-xl md:text-2xl font-black tracking-widest text-cyan-300 italic">SELECT TEAM</h2>
              <p className="text-xs text-white/50 font-mono mt-2">途中参加のため、まずチームを選んでください</p>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <button disabled={busy} onClick={() => onPickTeam('A')} className="p-5 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 transition-all text-left">
                  <div className="text-sm font-black tracking-widest">TEAM A</div>
                  <div className="text-[10px] font-mono text-white/50 mt-1">PLAYERS: {teamCounts.A}</div>
                </button>

                <button disabled={busy} onClick={() => onPickTeam('B')} className="p-5 rounded-2xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all text-left">
                  <div className="text-sm font-black tracking-widest">TEAM B</div>
                  <div className="text-[10px] font-mono text-white/50 mt-1">PLAYERS: {teamCounts.B}</div>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-black tracking-widest text-yellow-300 italic">SELECT ROLE</h2>
                  <p className="text-xs text-white/50 font-mono mt-2">既存プレイヤーが使用中のロールは選択できません</p>
                </div>
                <button disabled={busy} onClick={onBack} className="px-3 py-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 text-xs">
                  BACK
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
                {ALL_ROLES.map((r) => {
                  const used = usedRoleIds.has(r.id);
                  return (
                    <button
                      key={r.id}
                      disabled={busy || used}
                      onClick={() => onPickRole(r.id)}
                      className={`p-4 rounded-xl border transition-all text-left ${
                        used ? 'border-white/5 bg-black/20 opacity-50 cursor-not-allowed' : 'border-white/10 bg-black/30 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">{r.sigil}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-black truncate">{r.name}</div>
                            {used && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-red-900/50 border border-red-500/30 text-red-300">USED</span>}
                          </div>
                          <div className="text-[10px] font-mono tracking-widest text-white/40">TYPE: {r.type}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {busy && <div className="mt-4 text-[10px] text-cyan-300 font-mono tracking-widest animate-pulse">PROCESSING...</div>}
        </div>
      </motion.div>
    </div>
  );
};
