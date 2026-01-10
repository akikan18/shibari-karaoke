import { LogEntry, ScoreChange, LogKind } from './types';

// =========================
// Config
// =========================
export const BASE_SUCCESS = 1000;
export const BASE_FAIL = 0;
export const MAX_LOGS = 80;
export const MAX_LOG_ENTRIES = 220;

// =========================
// Utility Functions
// =========================
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const capLogs = (logs: string[]) => logs.slice(Math.max(0, logs.length - MAX_LOGS));
export const capEntries = (entries: LogEntry[]) => entries.slice(Math.max(0, entries.length - MAX_LOG_ENTRIES));
export const fmt = (n: number) => (n >= 0 ? `+${n.toLocaleString()}` : `${n.toLocaleString()}`);

// =========================
// Log Formatting
// =========================
export const fmtChangeLine = (c: ScoreChange) => {
  const arrow = '→';
  return `${c.scope} ${c.target}: ${c.from.toLocaleString()} ${arrow} ${c.to.toLocaleString()} (${fmt(c.delta)}) [${c.reason}]`;
};

export const iconOf = (k: LogKind) => {
  if (k === 'RESULT') return '🎤';
  if (k === 'SKILL') return '✨';
  if (k === 'ULT') return '💥';
  if (k === 'TURN') return '⏭️';
  return '🧾';
};

export const kindColorClass = (k: LogKind) => {
  if (k === 'RESULT') return 'border-cyan-500/30 bg-cyan-500/10';
  if (k === 'SKILL') return 'border-blue-500/30 bg-blue-500/10';
  if (k === 'ULT') return 'border-yellow-500/30 bg-yellow-500/10';
  if (k === 'TURN') return 'border-white/10 bg-white/5';
  return 'border-white/10 bg-black/30';
};

export const formatTime = (ts: number) => {
  try {
    const d = new Date(ts);
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    const ss = `${d.getSeconds()}`.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '';
  }
};
