import React from 'react';
import { motion } from 'framer-motion';

export type ConfirmState =
  | null
  | {
      title: string;
      body: React.ReactNode;
      confirmText?: string;
      cancelText?: string;
      danger?: boolean;
      onConfirm: () => Promise<void> | void;
    };

type ConfirmModalProps = {
  state: ConfirmState;
  busy: boolean;
  onClose: () => void;
};

export const ConfirmModal = ({ state, busy, onClose }: ConfirmModalProps) => {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={() => !busy && onClose()} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0f172a] p-1 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-xl p-6 bg-gradient-to-b from-white/5 to-black/40">
          <div className="text-xl font-black tracking-widest text-white">{state.title}</div>
          <div className="mt-3 text-sm text-white/70 leading-relaxed">{state.body}</div>

          <div className="mt-6 flex gap-3">
            <button
              disabled={busy}
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 font-bold tracking-widest text-xs"
            >
              {state.cancelText || 'CANCEL'}
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                await state.onConfirm();
              }}
              className={`flex-1 py-3 rounded-xl font-black tracking-widest text-xs transition-all ${
                state.danger
                  ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500'
              }`}
            >
              {busy ? 'PROCESSING...' : state.confirmText || 'CONFIRM'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
