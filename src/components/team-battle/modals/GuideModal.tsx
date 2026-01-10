import React from 'react';
import { motion } from 'framer-motion';
import { RoleId, getRoleById } from '../../../game/team-battle/roles';

type GuideModalProps = {
  open: boolean;
  onClose: () => void;
  members: any[];
  usedRoleIds: Set<RoleId>;
};

export const GuideModal = ({
  open,
  onClose,
  members,
  usedRoleIds,
}: GuideModalProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[255] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        className="relative w-full max-w-4xl rounded-2xl border border-white/15 bg-[#0f172a] p-1 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-xl p-5 md:p-6 bg-gradient-to-b from-white/5 to-black/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl md:text-2xl font-black tracking-widest text-cyan-200">GUIDE</div>
              <div className="text-[11px] font-mono tracking-widest text-white/50 mt-1">参加メンバーのロール説明（途中参加・ゲスト・オフライン含む）</div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center">
              ✕
            </button>
          </div>

          <div className="mt-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1 space-y-3">
            {members.map((m) => {
              const rid: RoleId | undefined = m.role?.id;
              const def = rid ? getRoleById(rid) : null;
              const isGuest = String(m.id).startsWith('guest_');
              const team = m.team || '?';
              const roleName = m.role?.name || (rid ? def?.name : 'NO ROLE');
              const usedBadge = rid && usedRoleIds.has(rid) ? 'USED' : null;

              return (
                <div key={m.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {m.avatar || '🎤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-black truncate">{m.name || 'PLAYER'}</div>
                        {isGuest && <span className="text-[9px] bg-purple-600 text-white px-2 py-0.5 rounded font-black">GUEST</span>}
                        {m.team === 'A' && <span className="text-[9px] bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 px-2 py-0.5 rounded font-black">TEAM A</span>}
                        {m.team === 'B' && <span className="text-[9px] bg-red-500/20 text-red-200 border border-red-500/30 px-2 py-0.5 rounded font-black">TEAM B</span>}
                      </div>
                      <div className="text-[10px] font-mono tracking-widest text-white/50 truncate">
                        ROLE: <span className="text-white/80">{roleName}</span>
                        {usedBadge && <span className="ml-2 text-[9px] px-2 py-0.5 rounded bg-white/5 border border-white/10">IN USE</span>}
                      </div>
                    </div>
                    <div className="flex-none text-[10px] font-mono tracking-widest text-white/40">{team !== '?' ? `TEAM ${team}` : 'TEAM ?'}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[9px] font-mono tracking-widest text-white/40 mb-1">PASSIVE</div>
                      <div className="text-[12px] text-white/75 leading-relaxed">{def?.passive || '未選択 / ロール未決定'}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[9px] font-mono tracking-widest text-white/40 mb-1">SKILL</div>
                      <div className="text-[12px] text-white/75 leading-relaxed">{def?.skill || '—'}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[9px] font-mono tracking-widest text-white/40 mb-1">ULT</div>
                      <div className="text-[12px] text-white/75 leading-relaxed">{def?.ult || '—'}</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {members.length === 0 && <div className="text-[11px] text-white/40 font-mono tracking-widest">NO MEMBERS</div>}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
