import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- Firebase ---
import { doc, onSnapshot, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// --- Components & Hooks ---
import { Toast, useToast } from '../components/Toast';
import { usePresence } from '../hooks/usePresence';
import { useWakeLock } from '../hooks/useWakeLock';

// =========================
// Config
// =========================
const BASE_SUCCESS = 1000;
const BASE_FAIL = 0;

const MAX_LOGS = 80;
const MAX_LOG_ENTRIES = 160;

// 100刻み丸め
const roundToStep = (v: number, step = 100) => Math.round(v / step) * step;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const capLogs = (logs: string[]) => logs.slice(Math.max(0, logs.length - MAX_LOGS));
const capEntries = (entries: LogEntry[]) => entries.slice(Math.max(0, entries.length - MAX_LOG_ENTRIES));
const fmt = (n: number) => (n >= 0 ? `+${n.toLocaleString()}` : `${n.toLocaleString()}`);

// =========================
// Theme Card
// =========================
type ThemeCard = string | { title: string; criteria?: string };

const cardTitle = (c: ThemeCard | null | undefined) => {
  if (!c) return '...';
  return typeof c === 'string' ? c : c.title || '...';
};

const cardCriteria = (c: ThemeCard | null | undefined) => {
  if (!c) return '...';
  return typeof c === 'string' ? '—' : c.criteria || '—';
};

const DEFAULT_THEME_POOL: ThemeCard[] = [
  { title: 'FREE THEME', criteria: '好きな曲でOK' },
  { title: 'J-POP', criteria: 'J-POP を歌う' },
  { title: 'アニソン', criteria: 'アニメ関連曲を歌う' },
  { title: 'バラード', criteria: 'バラード系を歌う' },
  { title: 'ロック', criteria: 'ロック系を歌う' },
  { title: '盛り上げ', criteria: '場を盛り上げる曲' },
  { title: '昭和', criteria: '昭和の曲' },
  { title: '平成', criteria: '平成の曲' },
  { title: '令和', criteria: '令和の曲' },
  { title: '英語曲', criteria: '英語の曲' },
];

const shuffle = <T,>(arr: T[]) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const normalizeThemePool = (poolLike: any): ThemeCard[] => {
  const pool = Array.isArray(poolLike) ? poolLike : [];
  const normalized: ThemeCard[] = pool
    .map((x: any) => {
      if (!x) return null;
      if (typeof x === 'string') return { title: x, criteria: '—' } as ThemeCard;
      if (typeof x === 'object') {
        const title = x.title ?? x.name ?? '';
        const criteria = x.criteria ?? x.condition ?? x.clear ?? '—';
        if (!title) return null;
        return { title, criteria } as ThemeCard;
      }
      return null;
    })
    .filter(Boolean) as ThemeCard[];

  return normalized.length > 0 ? normalized : DEFAULT_THEME_POOL;
};

const drawFromDeck = <T,>(deckLike: any, pool: T[], n: number) => {
  let d: T[] = Array.isArray(deckLike) ? (deckLike as T[]).slice() : [];
  const p = pool.slice();

  const reshuffle = () => shuffle(p);

  if (!d || d.length === 0) d = reshuffle();

  const picks: T[] = [];
  for (let i = 0; i < n; i++) {
    if (d.length === 0) d = reshuffle();
    const item = d.pop();
    if (item !== undefined) picks.push(item);
  }

  if (n === 1) return { nextDeck: d, picked: picks[0] ?? null, choices: null as T[] | null };
  return { nextDeck: d, picked: null as T | null, choices: picks };
};

// =========================
// Roles
// =========================
type TeamId = 'A' | 'B';

type RoleId =
  | 'maestro'
  | 'showman'
  | 'ironwall'
  | 'coach'
  | 'oracle'
  | 'mimic'
  | 'hype'
  | 'saboteur'
  | 'underdog'
  | 'gambler';

type RoleDef = {
  id: RoleId;
  name: string;
  type: 'ATK' | 'DEF' | 'SUP' | 'TEC';
  sigil: string;
  passive: string;
  skill: string;
  ult: string;
};

const ROLE_DEFS: RoleDef[] = [
  {
    id: 'maestro',
    name: 'THE MAESTRO',
    type: 'ATK',
    sigil: '⬢',
    passive: '成功でCOMBO+1(最大5)。成功ボーナス+250×COMBO。失敗でCOMBO消滅＆-1000。',
    // ★変更
    skill: 'SKILL: (3回) このターン「成功なら追加でCOMBO+2 / 失敗なら-500」',
    ult: 'ULT: (1回) COMBO×800をチーム付与しCOMBO消費。味方次成功+500(1回)',
  },
  {
    id: 'showman',
    name: 'SHOWMAN',
    type: 'ATK',
    sigil: '◆',
    // ★変更
    passive: 'PASSIVE：成功時、常時 +500。失敗は基本0。',
    skill: 'SKILL: (3回) ENCORE：成功時さらに+1200。失敗しても0。',
    ult: 'ULT: (1回) SPOTLIGHT：成功なら敵チーム-2000 / 失敗なら自分-1000(例外)',
  },
  {
    id: 'ironwall',
    name: 'IRON WALL',
    type: 'DEF',
    sigil: '▣',
    passive: 'チームが受ける「マイナス効果」を30%軽減（失敗0は対象外）。',
    skill: 'SKILL: (3回) INTERCEPT：指定味方の次マイナスを0。代わりに自分が半分受ける。',
    ult: 'ULT: (1回) BARRIER：次に自分の番が来るまで、チームへのマイナス効果を無効化。',
  },
  {
    id: 'coach',
    name: 'THE COACH',
    type: 'SUP',
    sigil: '✚',
    passive: '味方ターン開始時、チーム+150（歌唱結果に依存しない）。',
    skill: 'SKILL: (3回) TIMEOUT：指定味方にSAFE付与。次の失敗でもチーム+300。',
    ult: 'ULT: (1回) MORALE：チーム+2500。弱いデバフ解除。',
  },
  {
    id: 'oracle',
    name: 'ORACLE',
    type: 'TEC',
    sigil: '⟁',
    passive: '自分のターンはお題3択。',
    skill: 'SKILL: (3回) REROLL：自分or味方のお題を引き直し（3択維持）。',
    // ★イベント廃止に伴い変更（イベント参照を消す）
    ult: 'ULT: (1回) FATE SHIFT：味方チームの「次成功ボーナス +1500」（1回）',
  },
  {
    id: 'mimic',
    name: 'MIMIC',
    type: 'TEC',
    sigil: '◈',
    passive: '直前の味方成功の獲得点30%を、自分成功時に上乗せ。',
    skill: 'SKILL: (3回) ECHO：直前のスコア変動を50%コピー（成功/失敗問わず）。',
    ult: 'ULT: (1回) STEAL ROLE：敵のスキル相当効果を1回コピーして発動。',
  },
  {
    id: 'hype',
    name: 'HYPE ENGINE',
    type: 'SUP',
    sigil: '✦',
    passive: '自分ターン開始時、チーム+400（結果に依存しない）。',
    // ★変更
    skill: 'SKILL: (3回) 選んだ味方の「次の成功時 +2000」(1回)',
    // ★変更
    ult: 'ULT: (1回) 以降3ターン、味方全員の成功スコア +500',
  },
  {
    id: 'saboteur',
    name: 'SABOTEUR',
    type: 'TEC',
    sigil: '☒',
    passive: '自分成功で敵チーム-300。',
    // ★変更
    skill: 'SKILL: (3回) 敵1人指定：その敵が成功時 +0 / 失敗時 -800（1回）',
    // ★変更（イベント廃止でも「最悪の出来事」効果として実装）
    ult: 'ULT: (1回) BLACKOUT：敵チームに「最悪の出来事」を強制（次の敵ターン -2000）',
  },
  {
    id: 'underdog',
    name: 'UNDERDOG',
    type: 'DEF',
    sigil: '⬟',
    // ★変更
    passive: 'PASSIVE：負けている時、自分のターン開始時に +500。',
    // ★変更
    skill: 'SKILL: (3回) 現在の点差の20%を相手から奪う（最大2000）。',
    // ★変更
    ult: 'ULT: (1回) 劣勢時限定：チームに +2000。失敗時は -500（このターン）',
  },
  {
    id: 'gambler',
    name: 'GAMBLER',
    type: 'TEC',
    sigil: '🎲',
    // ★変更
    passive: 'PASSIVE：成功時に -500〜1500 の追加ボーナスを抽選（500刻み）。',
    skill: 'SKILL: (3回) DOUBLE DOWN：成功×2 / 失敗-2000(例外)',
    // ★変更
    ult: 'ULT: (1回) 表なら +4000 ／ 裏なら -1000。',
  },
];

const roleDef = (id?: RoleId) => ROLE_DEFS.find((r) => r.id === id);

// =========================
// Logs (structured)
// =========================
type LogKind = 'SYSTEM' | 'TURN' | 'RESULT' | 'SKILL' | 'ULT';
type LogEntry = {
  ts: number;
  kind: LogKind;
  actorName?: string;
  actorId?: string;
  team?: TeamId;
  title: string;
  lines: string[];
};

const iconOf = (k: LogKind) => {
  if (k === 'RESULT') return '🎤';
  if (k === 'SKILL') return '✨';
  if (k === 'ULT') return '💥';
  if (k === 'TURN') return '⏭️';
  return '🧾';
};

const kindColorClass = (k: LogKind) => {
  if (k === 'RESULT') return 'border-cyan-500/30 bg-cyan-500/10';
  if (k === 'SKILL') return 'border-blue-500/30 bg-blue-500/10';
  if (k === 'ULT') return 'border-yellow-500/30 bg-yellow-500/10';
  if (k === 'TURN') return 'border-white/10 bg-white/5';
  return 'border-white/10 bg-black/30';
};

const formatTime = (ts: number) => {
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

// =========================
// Turn Order Helpers
// =========================
const sortByTurn = (a: any, b: any) => (a.turnOrder ?? 9999) - (b.turnOrder ?? 9999);

const computeTeamScores = (mems: any[]) => {
  const A = mems.filter((m) => m.team === 'A').reduce((s, m) => s + (m.score ?? 0), 0);
  const B = mems.filter((m) => m.team === 'B').reduce((s, m) => s + (m.score ?? 0), 0);
  return { A, B };
};

const isReadyForTurn = (m: any) => (m?.team === 'A' || m?.team === 'B') && !!m?.role?.id;

const findNextReadyIndex = (mems: any[], fromIndex: number) => {
  const n = mems.length;
  if (n === 0) return 0;
  for (let offset = 1; offset <= n; offset++) {
    const i = (fromIndex + offset) % n;
    if (isReadyForTurn(mems[i])) return i;
  }
  return fromIndex;
};

const findFirstReadyIndex = (mems: any[]) => {
  const n = mems.length;
  for (let i = 0; i < n; i++) if (isReadyForTurn(mems[i])) return i;
  return 0;
};

// =========================
// Start-of-turn Auras
// =========================
const computeStartAuras = (mems: any[], nextSinger: any, teamScores: { A: number; B: number }) => {
  const t: TeamId = nextSinger?.team;
  const et: TeamId = t === 'A' ? 'B' : 'A';
  let add = 0;

  // coach passive
  if (mems.some((m) => m.team === t && m.role?.id === 'coach')) add += 150;
  // hype passive
  if (nextSinger?.role?.id === 'hype') add += 400;
  // underdog passive ★変更：+500
  if (nextSinger?.role?.id === 'underdog') {
    if ((teamScores[t] ?? 0) < (teamScores[et] ?? 0)) add += 500;
  }

  if (add !== 0) {
    return { teamScores: { ...teamScores, [t]: (teamScores[t] ?? 0) + add }, auraAdd: add };
  }
  return { teamScores, auraAdd: 0 };
};

// =========================
// Overlay: Turn Result (auto close)
// =========================
const ActionOverlay = ({ actionLog, onClose }: { actionLog: any; onClose: () => void }) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current?.();
    }, 2600);
    return () => clearTimeout(timer);
  }, [actionLog]);

  if (!actionLog) return null;

  const details = actionLog.detail ? String(actionLog.detail).split('\n') : [];
  const limited = details.slice(0, 8);
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
        className="w-full bg-gradient-to-r from-black/80 via-black/95 to-black/80 border-y-2 border-white/20 py-6 md:py-10 flex flex-col items-center justify-center relative backdrop-blur-sm"
      >
        <div className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle at 50% 50%, ${headlineColor}22, transparent 60%)` }} />

        <div className="text-[10px] md:text-xs font-mono tracking-[0.4em] text-white/60">TURN RESULT</div>
        <h2
          className="text-2xl md:text-5xl font-black italic tracking-widest px-4 text-center mb-3"
          style={{ color: headlineColor, textShadow: `0 0 18px ${headlineColor}66` }}
        >
          {actionLog.title}
        </h2>

        <div className="flex flex-col gap-2 items-center w-full px-4">
          {limited.map((line: string, idx: number) => {
            const isNegative = line.includes('-');
            const isTeam = line.startsWith('TEAM ');
            const isNote = line.startsWith('NOTE ');
            const isAbility = line.startsWith('SKILL ') || line.startsWith('ULT ') || line.startsWith('BLACKOUT') || line.startsWith('SABOTAGE');

            const colorClasses =
              isAbility
                ? 'text-yellow-200 border-yellow-500/30 bg-yellow-900/20'
                : isNote
                ? 'text-gray-300 border-white/10 bg-white/5'
                : isNegative
                ? 'text-red-400 border-red-500/30 bg-red-900/20'
                : isTeam
                ? 'text-cyan-300 border-cyan-500/30 bg-cyan-900/20'
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

// =========================
// Overlay: SKILL/ULT (auto close)
// =========================
type AbilityFx = null | {
  timestamp: number;
  kind: 'SKILL' | 'ULT';
  actorName: string;
  roleName: string;
  team?: TeamId;
  title?: string;
  subtitle?: string;
};

const AbilityFxOverlay = ({ fx, onDone }: { fx: AbilityFx; onDone: () => void }) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts]);

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

// =========================
// Generic Confirm Modal
// =========================
type ConfirmState =
  | null
  | {
      title: string;
      body: React.ReactNode;
      confirmText?: string;
      cancelText?: string;
      danger?: boolean;
      onConfirm: () => Promise<void> | void;
    };

const ConfirmModal = ({ state, busy, onClose }: { state: ConfirmState; busy: boolean; onClose: () => void }) => {
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

// =========================
// Join Wizard (mid-join team/role)
// =========================
const JoinTeamRoleModal = ({
  isOpen,
  step,
  busy,
  teamCounts,
  usedRoleIds,
  onPickTeam,
  onPickRole,
  onBack,
}: {
  isOpen: boolean;
  step: 'team' | 'role';
  busy: boolean;
  teamCounts: { A: number; B: number };
  usedRoleIds: Set<RoleId>;
  onPickTeam: (t: TeamId) => void;
  onPickRole: (r: RoleId) => void;
  onBack: () => void;
}) => {
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
                {ROLE_DEFS.map((r) => {
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

// =========================
// Target Modal (ability target choose)
// =========================
type TargetModalState = null | {
  title: string;
  mode: 'ally' | 'enemy';
  action:
    | 'ironwall_intercept'
    | 'coach_timeout'
    | 'saboteur_sabotage'
    | 'oracle_reroll'
    | 'mimic_steal'
    | 'hype_boost';
};

const TargetModal = ({
  isOpen,
  title,
  busy,
  targets,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  title: string;
  busy: boolean;
  targets: any[];
  onClose: () => void;
  onPick: (id: string) => void;
}) => {
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
                    <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">TEAM {m.team} ・ {m.role?.name || '—'}</div>
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

// =========================
// Mission Display
// =========================
const MissionDisplay = React.memo(({ title, criteria, stateText }: any) => {
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

// =========================
// Main Screen
// =========================
export const GamePlayTeamScreen = () => {
  const navigate = useNavigate();
  const { messages, addToast, removeToast } = useToast();
  useWakeLock();

  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [isHost, setIsHost] = useState(false);

  const [roomData, setRoomData] = useState<any>(null);

  const [members, setMembers] = useState<any[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [turnSerial, setTurnSerial] = useState(0);

  const [teamScores, setTeamScores] = useState<{ A: number; B: number }>({ A: 0, B: 0 });
  const [teamBuffs, setTeamBuffs] = useState<any>({ A: {}, B: {} });

  const [logs, setLogs] = useState<string[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  const [turnAbilityUsed, setTurnAbilityUsed] = useState(false);

  // UI
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);
  const [showRoleInfo, setShowRoleInfo] = useState(false);

  const [busy, setBusy] = useState(false);
  const [targetModal, setTargetModal] = useState<TargetModalState>(null);

  const [proxyTarget, setProxyTarget] = useState<any>(null);
  const [joinStep, setJoinStep] = useState<'team' | 'role' | null>(null);

  // Selection confirmations
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  // Overlay (turn result)
  const [activeActionLog, setActiveActionLog] = useState<any>(null);
  const lastLogTimestampRef = useRef<number>(0);

  // Overlay (skill/ult)
  const [abilityFx, setAbilityFx] = useState<AbilityFx>(null);
  const lastFxTimestampRef = useRef<number>(0);

  const clearAbilityFx = useCallback(() => setAbilityFx(null), []);
  const clearActionLog = useCallback(() => setActiveActionLog(null), []);

  // init lock
  const initLockRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('shibari_user_info');
    if (!stored) {
      navigate('/');
      return;
    }
    const ui = JSON.parse(stored);
    setRoomId(ui.roomId);
    setUserId(ui.userId);
    setIsHost(!!ui.isHost);

    const unsub = onSnapshot(doc(db, 'rooms', ui.roomId), (snap) => {
      if (!snap.exists()) {
        navigate('/');
        return;
      }
      const data: any = snap.data();
      setRoomData(data);

      const mems = (data.members || []).slice().sort(sortByTurn);
      setMembers(mems);

      setCurrentTurnIndex(data.currentTurnIndex ?? 0);
      setTurnSerial(data.turnSerial ?? 0);

      setTeamScores(data.teamScores || computeTeamScores(mems));
      setTeamBuffs(data.teamBuffs || { A: {}, B: {} });

      setLogs(data.logs || []);
      setLogEntries(Array.isArray(data.logEntries) ? data.logEntries : []);
      setTurnAbilityUsed(!!data.turnAbilityUsed);

      if (data.lastLog?.timestamp && data.lastLog.timestamp !== lastLogTimestampRef.current) {
        lastLogTimestampRef.current = data.lastLog.timestamp;
        setActiveActionLog(data.lastLog);
      }

      if (data.abilityFx?.timestamp && data.abilityFx.timestamp !== lastFxTimestampRef.current) {
        lastFxTimestampRef.current = data.abilityFx.timestamp;
        setAbilityFx(data.abilityFx);
      }

      if (data.status === 'finished') {
        navigate('/team-result');
      }
    });

    return () => unsub();
  }, [navigate]);

  const sortedMembers = useMemo(() => members.slice().sort(sortByTurn), [members]);
  const safeIndex = Math.min(currentTurnIndex, Math.max(0, sortedMembers.length - 1));
  const currentSinger = sortedMembers[safeIndex] || null;
  const myMember = sortedMembers.find((m) => m.id === userId) || null;

  const isGuestTurn = !!currentSinger?.id?.startsWith?.('guest_');

  // Presence
  const { offlineUsers, isHostMissing } = usePresence(roomId, userId, roomData, addToast);

  // next singer (skip unready)
  const nextSingerIndex = useMemo(() => {
    if (!sortedMembers.length) return 0;
    return findNextReadyIndex(sortedMembers, safeIndex);
  }, [sortedMembers, safeIndex]);
  const nextSinger = sortedMembers[nextSingerIndex] || null;

  // Host missing leave
  const handleForceLeave = async () => {
    try {
      if (!roomId || !userId) {
        localStorage.removeItem('shibari_user_info');
        navigate('/');
        return;
      }
      const roomRef = doc(db, 'rooms', roomId);
      const newMembers = sortedMembers.filter((m) => m.id !== userId);
      await updateDoc(roomRef, { members: newMembers });
    } catch (e) {
      console.error(e);
    } finally {
      localStorage.removeItem('shibari_user_info');
      navigate('/');
    }
  };

  // ===== Join Wizard trigger (mid-join) =====
  useEffect(() => {
    if (!roomData) return;
    if (roomData.status !== 'playing') return;
    if (roomData.mode !== 'team') return;
    if (!myMember) return;

    const teamOk = myMember.team === 'A' || myMember.team === 'B';
    const roleOk = !!myMember.role?.id;

    if (!teamOk) {
      setJoinStep('team');
      return;
    }
    if (!roleOk) {
      setJoinStep('role');
      return;
    }

    setJoinStep(null);
  }, [roomData?.status, roomData?.mode, myMember?.team, myMember?.role?.id]);

 
 const teamCounts = useMemo(() => {
    return {
      A: sortedMembers.filter((m) => m.team === 'A').length,
      B: sortedMembers.filter((m) => m.team === 'B').length,
    };
  }, [sortedMembers]);

  const usedRoleIds = useMemo(() => {
    const s = new Set<RoleId>();
    for (const m of sortedMembers) {
      if (!isReadyForTurn(m)) continue;
      const rid = m.role?.id as RoleId | undefined;
      if (rid) s.add(rid);
    }
    return s;
  }, [sortedMembers]);

  // =========================
  // Init (host) — event関連は完全削除
  // =========================
  useEffect(() => {
    if (!roomId || !roomData || !isHost) return;
    if (roomData.status !== 'playing' || roomData.mode !== 'team') return;

    const mems = (roomData.members || []).slice();
    const hasMissingTurnOrder = mems.some((m: any) => m.turnOrder === undefined || m.turnOrder === null);
    const hasReadyMissingChallenge = mems.some((m: any) => isReadyForTurn(m) && !m.challenge && !(m.candidates && m.candidates.length > 0));

    const sorted = mems.slice().sort(sortByTurn);
    const idxMember = sorted[roomData.currentTurnIndex ?? 0];
    const currentIdxBad = idxMember && !isReadyForTurn(idxMember);

    const needsInit = !roomData.teamBuffs || roomData.turnAbilityUsed === undefined || !roomData.teamScores || hasMissingTurnOrder || hasReadyMissingChallenge || currentIdxBad;

    if (!needsInit) return;
    if (initLockRef.current) return;

    initGameIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomData, isHost]);

  const initGameIfNeeded = async () => {
    if (!roomId) return;
    initLockRef.current = true;

    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const data: any = snap.data();
        if (data.status !== 'playing' || data.mode !== 'team') return;

        let mems = (data.members || []).slice().sort(sortByTurn);

        // defaults
        mems = mems.map((m: any) => ({
          ...m,
          score: m.score ?? 0,
          combo: m.combo ?? 0,
          buffs: m.buffs ?? {},
          debuffs: m.debuffs ?? {},
          candidates: Array.isArray(m.candidates) ? m.candidates : null,
          challenge: m.challenge ?? null,
          role: m.role
            ? {
                ...m.role,
                // ★スキル回数 3回
                skillUses: m.role.skillUses ?? 3,
                ultUses: m.role.ultUses ?? 1,
              }
            : null,
        }));

        // assign turnOrder if missing
        let maxOrder = mems.reduce((mx: number, m: any) => (typeof m.turnOrder === 'number' ? Math.max(mx, m.turnOrder) : mx), -1);
        let changed = false;
        mems = mems.map((m: any) => {
          if (m.turnOrder === undefined || m.turnOrder === null) {
            maxOrder += 1;
            changed = true;
            return { ...m, turnOrder: maxOrder };
          }
          return m;
        });

        // theme pool & deck
        const pool = normalizeThemePool(data.themePool);
        let deck: ThemeCard[] = Array.isArray(data.deck) && data.deck.length > 0 ? data.deck : shuffle(pool);

        // deal challenge for ready members missing it
        for (let i = 0; i < mems.length; i++) {
          const m = mems[i];
          if (!isReadyForTurn(m)) continue;
          if (m.challenge || (m.candidates && m.candidates.length > 0)) continue;

          const want3 = m.role?.id === 'oracle';
          const d = drawFromDeck<ThemeCard>(deck, pool, want3 ? 3 : 1);
          deck = d.nextDeck;

          if (want3) {
            const choices = d.choices || [];
            mems[i] = { ...m, candidates: choices, challenge: choices[0] ?? { title: 'FREE THEME', criteria: '—' } };
          } else {
            mems[i] = { ...m, candidates: null, challenge: d.picked ?? { title: 'FREE THEME', criteria: '—' } };
          }
          changed = true;
        }

        // currentTurnIndex must point to ready member
        let idx = data.currentTurnIndex ?? 0;
        if (idx >= mems.length) {
          idx = 0;
          changed = true;
        }

        const sorted2 = mems.slice().sort(sortByTurn);
        if (sorted2.length > 0) {
          const cur = sorted2[idx];
          if (cur && !isReadyForTurn(cur)) {
            idx = findFirstReadyIndex(sorted2);
            changed = true;
          }
        }

        const ts = data.teamScores || computeTeamScores(mems);
        const tb = data.teamBuffs || { A: {}, B: {} };

        const updates: any = {
          members: mems,
          themePool: pool,
          deck,
          teamScores: ts,
          teamBuffs: tb,
          turnAbilityUsed: data.turnAbilityUsed ?? false,
          logEntries: Array.isArray(data.logEntries) ? data.logEntries : [],
        };

        if (changed) {
          updates.currentTurnIndex = idx;
          updates.logs = capLogs([...(data.logs || []), 'INIT FIX: patched missing fields']);
          const e: LogEntry = {
            ts: Date.now(),
            kind: 'SYSTEM',
            title: 'INIT FIX',
            lines: ['patched missing fields (turnOrder/mission/uses/etc)'],
          };
          updates.logEntries = capEntries([...(updates.logEntries || []), e]);
        }

        tx.update(ref, updates);
      });
    } catch (e) {
      console.error('initGameIfNeeded failed', e);
    } finally {
      initLockRef.current = false;
    }
  };

  // =========================
  // Control permissions
  // =========================
  const canControlTurn = isHost || currentSinger?.id === userId;
  const canOperateAbility = currentSinger?.id === userId || (isHost && (isGuestTurn || (currentSinger && offlineUsers.has(currentSinger.id))));

  const canUseSkill = !!currentSinger && !!currentSinger.role && canOperateAbility && !turnAbilityUsed && (currentSinger.role.skillUses ?? 0) > 0;
  const canUseUlt = !!currentSinger && !!currentSinger.role && canOperateAbility && !turnAbilityUsed && (currentSinger.role.ultUses ?? 0) > 0;

  // candidates selection UI (oracle etc)
  const isHostOverrideSelecting = isHost && currentSinger?.candidates?.length > 0 && currentSinger?.id !== userId;
  const displayCandidates: ThemeCard[] | null = isHostOverrideSelecting ? currentSinger.candidates : myMember?.candidates || null;
  const selectionOwner = isHostOverrideSelecting ? currentSinger : myMember;
  const isSelectingMission = !!displayCandidates && displayCandidates.length > 0;

  const isCurrentSingerLocked = !!currentSinger?.candidates && currentSinger.candidates.length > 0;

  const currentChallenge = currentSinger?.challenge || { title: 'お題準備中...', criteria: '...' };

  // ===== Role Info target =====
  const roleInfoTarget = useMemo(() => {
    if (!myMember) return null;
    if (isHost && isGuestTurn) return currentSinger;
    return myMember;
  }, [myMember, isHost, isGuestTurn, currentSinger]);

  // ===== Effects chips =====
  const activeEffects = useMemo(() => {
    const chips: string[] = [];
    const serial = turnSerial ?? 0;

    const addTeam = (t: TeamId) => {
      const tb = teamBuffs?.[t] || {};
      if ((tb.nextSuccessBonus ?? 0) > 0) chips.push(`TEAM ${t} NEXT +${tb.nextSuccessBonus}`);
      if ((tb.roarRemaining ?? 0) > 0) chips.push(`TEAM ${t} ROAR x${tb.roarRemaining}`);
      if ((tb.barrierUntil ?? -1) > serial) chips.push(`TEAM ${t} BARRIER`);
      if ((tb.hypeUltTurns ?? 0) > 0) chips.push(`TEAM ${t} HYPE +500 (${tb.hypeUltTurns}T)`);
      if ((tb.blackoutTurns ?? 0) > 0) chips.push(`TEAM ${t} BLACKOUT (NEXT)`);
    };

    addTeam('A');
    addTeam('B');

    if (currentSinger?.role?.id === 'maestro' && (currentSinger.combo ?? 0) > 0) chips.push(`COMBO x${currentSinger.combo}`);
    if (turnAbilityUsed) chips.push('ABILITY USED');

    const b = currentSinger?.buffs || {};
    const d = currentSinger?.debuffs || {};
    if (b.maestroSkill) chips.push('MAESTRO SKILL ARMED');
    if (b.encore) chips.push('ENCORE');
    if (b.doubleDown) chips.push('DOUBLE DOWN');
    if (b.gamblerUlt) chips.push('GAMBLER ULT ARMED');
    if (b.spotlight) chips.push('SPOTLIGHT');
    if (b.safe) chips.push('SAFE');
    if (b.clutchDebt) chips.push('UNDERDOG ULT (FAIL -500)');
    if (b.echo) chips.push('ECHO');
    if (b.hypeBoost) chips.push('HYPE +2000 (NEXT SUCCESS)');
    if (d.sabotaged) chips.push('SABOTAGED');

    return chips;
  }, [teamBuffs, turnSerial, currentSinger, turnAbilityUsed]);

  // ===== Targets for ability modal =====
  const availableTargets = useMemo(() => {
    if (!targetModal || !currentSinger) return [];
    const t = currentSinger.team;
    const et = t === 'A' ? 'B' : 'A';
    const base = sortedMembers.filter((m) => isReadyForTurn(m));

    if (targetModal.mode === 'ally') return base.filter((m) => m.team === t);
    if (targetModal.mode === 'enemy') return base.filter((m) => m.team === et && !!m.role?.id);
    return [];
  }, [targetModal, sortedMembers, currentSinger]);

  // =========================
  // DESTINY CHOICE confirm
  // =========================
  const requestPickCandidate = (targetMemberId: string, cand: ThemeCard, isProxy: boolean) => {
    const owner = sortedMembers.find((m) => m.id === targetMemberId);
    const ownerName = owner?.name || 'PLAYER';

    setConfirmState({
      title: 'CONFIRM THEME',
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{ownerName}</span> のお題をこれにしますか？
          </div>
          <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10">
            <div className="text-[10px] font-mono tracking-widest text-yellow-200">THEME</div>
            <div className="text-white font-black mt-1">{cardTitle(cand)}</div>
            <div className="text-[11px] text-white/60 font-mono mt-1">{cardCriteria(cand)}</div>
          </div>
        </div>
      ),
      confirmText: 'CONFIRM',
      onConfirm: async () => {
        setConfirmState(null);
        await pickCandidateTx(targetMemberId, cand, isProxy);
      },
    });
  };

  const pickCandidateTx = async (targetMemberId: string, cand: ThemeCard, isProxy: boolean) => {
    if (!roomId || !targetMemberId) return;

    const canPick =
      targetMemberId === userId ||
      (isHost && (targetMemberId.startsWith?.('guest_') || offlineUsers.has(targetMemberId)));

    if (!canPick && !(isHost && isHostOverrideSelecting)) return;

    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const data: any = snap.data();
        const mems = (data.members || []).slice().sort(sortByTurn);

        const idx = mems.findIndex((m: any) => m.id === targetMemberId);
        if (idx === -1) return;

        const target = { ...mems[idx] };
        const cands: ThemeCard[] = Array.isArray(target.candidates) ? target.candidates : [];
        if (cands.length === 0) return;

        const ok = cands.some((x) => cardTitle(x) === cardTitle(cand) && cardCriteria(x) === cardCriteria(cand));
        if (!ok) return;

        target.challenge = cand;
        target.candidates = null;
        mems[idx] = target;

        const newLogs = capLogs([...(data.logs || []), `PICK: ${target.name} -> ${cardTitle(cand)}`]);
        const entry: LogEntry = {
          ts: Date.now(),
          kind: 'SYSTEM',
          actorName: target.name,
          actorId: target.id,
          team: target.team,
          title: 'THEME CONFIRMED',
          lines: [`THEME: ${cardTitle(cand)}`, `COND: ${cardCriteria(cand)}`],
        };

        tx.update(ref, {
          members: mems,
          logs: newLogs,
          logEntries: capEntries([...(Array.isArray(data.logEntries) ? data.logEntries : []), entry]),
        });
      });
    } finally {
      setBusy(false);
      if (isProxy) setProxyTarget(null);
    }
  };

  // =========================
  // Join Wizard actions
  // =========================
  const requestPickTeam = (team: TeamId) => {
    setConfirmState({
      title: 'CONFIRM TEAM',
      body: (
        <div className="space-y-2">
          <div className="text-white/80">
            TEAM <span className="font-black">{team}</span> で参加しますか？
          </div>
          <div className="text-[11px] font-mono tracking-widest text-white/40">後で変更できない想定です</div>
        </div>
      ),
      confirmText: 'JOIN TEAM',
      onConfirm: async () => {
        setConfirmState(null);
        await saveMyTeam(team);
      },
    });
  };

  const requestPickRole = (roleId: RoleId) => {
    const def = ROLE_DEFS.find((r) => r.id === roleId);
    if (!def) return;

    if (usedRoleIds.has(roleId)) {
      addToast('そのロールは使用中です');
      return;
    }

    setConfirmState({
      title: 'CONFIRM ROLE',
      body: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">{def.sigil}</div>
            <div>
              <div className="text-white font-black">{def.name}</div>
              <div className="text-[10px] font-mono tracking-widest text-white/40">TYPE: {def.type}</div>
            </div>
          </div>
          <div className="text-[12px] text-white/70 leading-relaxed space-y-2">
            <div>
              <div className="text-[10px] font-mono tracking-widest text-white/40 mb-1">PASSIVE</div>
              <div>{def.passive}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-widest text-white/40 mb-1">SKILL</div>
              <div>{def.skill}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-widest text-white/40 mb-1">ULT</div>
              <div>{def.ult}</div>
            </div>
          </div>
        </div>
      ),
      confirmText: 'JOIN ROLE',
      onConfirm: async () => {
        setConfirmState(null);
        await saveMyRole(roleId);
      },
    });
  };

  const saveMyTeam = async (team: TeamId) => {
    if (!roomId || !userId) return;
    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const data: any = snap.data();
        const mems = (data.members || []).slice().sort(sortByTurn);
        const idx = mems.findIndex((m: any) => m.id === userId);
        if (idx === -1) return;

        const maxOrder = mems.reduce((mx: number, m: any) => (typeof m.turnOrder === 'number' ? Math.max(mx, m.turnOrder) : mx), -1);
        const updated = { ...(mems[idx] || {}) };
        updated.team = team;
        updated.turnOrder = typeof updated.turnOrder === 'number' ? updated.turnOrder : maxOrder + 1;
        updated.score = updated.score ?? 0;
        updated.combo = updated.combo ?? 0;
        updated.buffs = updated.buffs ?? {};
        updated.debuffs = updated.debuffs ?? {};
        updated.isReady = true;

        mems[idx] = updated;

        const newLogs = capLogs([...(data.logs || []), `MIDJOIN: ${updated.name} picked TEAM ${team}`]);
        const entry: LogEntry = {
          ts: Date.now(),
          kind: 'SYSTEM',
          actorName: updated.name,
          actorId: updated.id,
          team,
          title: 'MIDJOIN TEAM',
          lines: [`TEAM: ${team}`],
        };

        tx.update(ref, {
          members: mems,
          logs: newLogs,
          logEntries: capEntries([...(Array.isArray(data.logEntries) ? data.logEntries : []), entry]),
        });
      });

      setJoinStep('role');
    } catch (e) {
      console.error(e);
      addToast('通信エラー');
    } finally {
      setBusy(false);
    }
  };

  const saveMyRole = async (roleId: RoleId) => {
    if (!roomId || !userId) return;
    const def = ROLE_DEFS.find((r) => r.id === roleId);
    if (!def) return;

    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const data: any = snap.data();
        const mems = (data.members || []).slice().sort(sortByTurn);
        const idx = mems.findIndex((m: any) => m.id === userId);
        if (idx === -1) return;

        // role duplication guard
        const used = new Set<RoleId>();
        for (const m of mems) {
          if (m.id === userId) continue;
          if (!isReadyForTurn(m)) continue;
          const rid = m.role?.id as RoleId | undefined;
          if (rid) used.add(rid);
        }
        if (used.has(def.id)) throw new Error('RoleAlreadyUsed');

        const updated = { ...(mems[idx] || {}) };
        updated.role = { id: def.id, name: def.name, skillUses: 3, ultUses: 1 }; // ★スキル3回
        updated.score = updated.score ?? 0;
        updated.combo = updated.combo ?? 0;
        updated.buffs = updated.buffs ?? {};
        updated.debuffs = updated.debuffs ?? {};
        updated.isReady = true;

        mems[idx] = updated;

        const newLogs = capLogs([...(data.logs || []), `MIDJOIN: ${updated.name} picked ROLE ${def.id}`]);
        const entry: LogEntry = {
          ts: Date.now(),
          kind: 'SYSTEM',
          actorName: updated.name,
          actorId: updated.id,
          team: updated.team,
          title: 'MIDJOIN ROLE',
          lines: [`ROLE: ${def.name}`, `SKILL USES: 3`, `ULT USES: 1`],
        };

        tx.update(ref, {
          members: mems,
          logs: newLogs,
          logEntries: capEntries([...(Array.isArray(data.logEntries) ? data.logEntries : []), entry]),
        });
      });

      setJoinStep(null);
    } catch (e: any) {
      console.error(e);
      if (String(e?.message || '').includes('RoleAlreadyUsed')) addToast('そのロールは既に使用中です');
      else addToast('通信エラー');
    } finally {
      setBusy(false);
    }
  };

  // =========================
  // Ability Requests
  // =========================
  const requestUseSkill = () => {
    if (!currentSinger?.role) return;
    if (!canUseSkill) return;

    const rid: RoleId = currentSinger.role.id;

    if (rid === 'ironwall') return setTargetModal({ title: 'INTERCEPT: 味方を選択', mode: 'ally', action: 'ironwall_intercept' });
    if (rid === 'coach') return setTargetModal({ title: 'TIMEOUT: 味方を選択', mode: 'ally', action: 'coach_timeout' });
    if (rid === 'saboteur') return setTargetModal({ title: 'SABOTAGE: 敵を選択', mode: 'enemy', action: 'saboteur_sabotage' });
    if (rid === 'oracle') return setTargetModal({ title: 'REROLL: 味方を選択', mode: 'ally', action: 'oracle_reroll' });
    if (rid === 'hype') return setTargetModal({ title: 'HYPE BOOST: 味方を選択', mode: 'ally', action: 'hype_boost' });

    const def = roleDef(rid);
    setConfirmState({
      title: 'CONFIRM SKILL',
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{def?.name || 'ROLE'}</span> の <span className="font-black text-cyan-300">SKILL</span> を発動しますか？
          </div>
          <div className="text-[12px] text-white/70 leading-relaxed">{def?.skill}</div>
          <div className="text-[10px] font-mono tracking-widest text-white/40">USES LEFT: {currentSinger.role.skillUses ?? 0}</div>
        </div>
      ),
      confirmText: 'ACTIVATE',
      onConfirm: async () => {
        setConfirmState(null);
        await applyAbility({ kind: 'skill' });
      },
    });
  };

  const requestUseUlt = () => {
    if (!currentSinger?.role) return;
    if (!canUseUlt) return;

    const rid: RoleId = currentSinger.role.id;

    if (rid === 'mimic') return setTargetModal({ title: 'STEAL ROLE: 敵ロールを選択', mode: 'enemy', action: 'mimic_steal' });

    const def = roleDef(rid);
    setConfirmState({
      title: 'CONFIRM ULT',
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{def?.name || 'ROLE'}</span> の <span className="font-black text-yellow-300">ULT</span> を発動しますか？
          </div>
          <div className="text-[12px] text-white/70 leading-relaxed">{def?.ult}</div>
          <div className="text-[10px] font-mono tracking-widest text-white/40">USES LEFT: {currentSinger.role.ultUses ?? 0}</div>
        </div>
      ),
      confirmText: 'ACTIVATE',
      onConfirm: async () => {
        setConfirmState(null);
        await applyAbility({ kind: 'ult' });
      },
    });
  };

  const requestConfirmTarget = (action: NonNullable<TargetModalState>['action'], targetId: string) => {
    if (!currentSinger?.role) return;
    const rid: RoleId = currentSinger.role.id;
    const target = sortedMembers.find((m) => m.id === targetId);
    if (!target) return;

    const kind = action === 'mimic_steal' ? 'ult' : 'skill';
    const title = kind === 'ult' ? 'CONFIRM ULT TARGET' : 'CONFIRM SKILL TARGET';

    const def = roleDef(rid);

    const actionText =
      action === 'ironwall_intercept' ? 'INTERCEPT'
      : action === 'coach_timeout' ? 'TIMEOUT'
      : action === 'saboteur_sabotage' ? 'SABOTAGE'
      : action === 'oracle_reroll' ? 'REROLL'
      : action === 'hype_boost' ? 'HYPE BOOST'
      : 'STEAL ROLE';

    setConfirmState({
      title,
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{def?.name || 'ROLE'}</span> の <span className="font-black">{actionText}</span> を
            <span className="font-black text-cyan-200"> {target.name}</span> に使いますか？
          </div>
          <div className="p-3 rounded-xl border border-white/10 bg-black/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">{target.avatar}</div>
              <div className="min-w-0">
                <div className="font-black truncate text-white">{target.name}</div>
                <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">
                  TEAM {target.team} ・ {target.role?.name || '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      confirmText: 'ACTIVATE',
      onConfirm: async () => {
        setConfirmState(null);
        if (action === 'mimic_steal') {
          const stolen: RoleId | undefined = target?.role?.id;
          if (!stolen) return;
          await applyAbility({ kind: 'ult', stolenRoleId: stolen });
          return;
        }
        await applyAbility({ kind, targetId });
      },
    });
  };

  // =========================
  // Ability Apply (transaction)
  // =========================
  const applyAbility = async (opts: { kind: 'skill' | 'ult'; targetId?: string; stolenRoleId?: RoleId }) => {
    if (!roomId || !currentSinger) return;

    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const data: any = snap.data();
        const mems = (data.members || [])
          .map((m: any) => ({
            ...m,
            score: m.score ?? 0,
            combo: m.combo ?? 0,
            buffs: m.buffs ?? {},
            debuffs: m.debuffs ?? {},
            role: m.role ? { ...m.role, skillUses: m.role.skillUses ?? 3, ultUses: m.role.ultUses ?? 1 } : null,
            candidates: Array.isArray(m.candidates) ? m.candidates : null,
            challenge: m.challenge ?? null,
          }))
          .slice()
          .sort(sortByTurn);

        let idx = data.currentTurnIndex ?? 0;
        if (idx >= mems.length) idx = 0;
        if (mems.length > 0 && !isReadyForTurn(mems[idx])) idx = findFirstReadyIndex(mems);

        const singer = mems[idx];
        if (!singer) return;

        if (data.turnAbilityUsed) return;

        const canOperate =
          singer.id === userId ||
          (isHost && (String(singer.id).startsWith('guest_') || offlineUsers.has(singer.id)));
        if (!canOperate) return;

        const r: RoleId | undefined = singer.role?.id;
        if (!r) return;

        const kind = opts.kind;

        if (kind === 'skill') {
          if ((singer.role.skillUses ?? 0) <= 0) return;
          singer.role.skillUses -= 1;
        } else {
          if ((singer.role.ultUses ?? 0) <= 0) return;
          singer.role.ultUses -= 1;
        }

        const teamBuffsTx = data.teamBuffs || { A: {}, B: {} };
        const t: TeamId = singer.team;
        const et: TeamId = t === 'A' ? 'B' : 'A';

        let teamScoresTx = data.teamScores || computeTeamScores(mems);

        const pushLines: string[] = [];
        const entries: LogEntry[] = Array.isArray(data.logEntries) ? data.logEntries : [];

        // ---- SKILL ----
        if (kind === 'skill') {
          if (r === 'maestro') {
            singer.buffs.maestroSkill = true;
            pushLines.push(`SKILL MAESTRO: armed (success COMBO+2 / fail -500)`);
          } else if (r === 'showman') {
            singer.buffs.encore = true;
            pushLines.push(`SKILL SHOWMAN: ENCORE armed (+1200 on success)`);
          } else if (r === 'gambler') {
            singer.buffs.doubleDown = true;
            pushLines.push(`SKILL GAMBLER: DOUBLE DOWN armed (success x2 / fail -2000)`);
          } else if (r === 'underdog') {
            // ★変更：点差の20%奪う（最大2000）
            const diff = Math.abs((teamScoresTx.A ?? 0) - (teamScoresTx.B ?? 0));
            const steal = clamp(roundToStep(diff * 0.2, 100), 0, 2000);
            teamScoresTx = {
              ...teamScoresTx,
              [t]: (teamScoresTx[t] ?? 0) + steal,
              [et]: (teamScoresTx[et] ?? 0) - steal,
            };
            pushLines.push(`SKILL UNDERDOG: steal ${steal} from TEAM ${et}`);
          } else if (r === 'hype') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.hypeBoost = { value: 2000, by: singer.id };
            pushLines.push(`SKILL HYPE: ${target.name} next success +2000`);
          } else if (r === 'mimic') {
            singer.buffs.echo = true;
            pushLines.push(`SKILL MIMIC: ECHO armed (copy 50% last turn delta)`);
          } else if (r === 'ironwall') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.intercept = { by: singer.id };
            pushLines.push(`SKILL IRONWALL: INTERCEPT -> ${target.name}`);
          } else if (r === 'coach') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.safe = true;
            pushLines.push(`SKILL COACH: TIMEOUT -> ${target.name} (SAFE)`);
          } else if (r === 'saboteur') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== et) return;
            target.debuffs.sabotaged = { by: singer.id };
            pushLines.push(`SKILL SABOTEUR: sabotaged -> ${target.name} (success +0 / fail -800)`);
          } else if (r === 'oracle') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const targetIdx = mems.findIndex((m: any) => m.id === targetId);
            if (targetIdx === -1) return;

            const target = { ...mems[targetIdx] };
            if (target.team !== t) return;

            const pool = normalizeThemePool(data.themePool);
            let deck: ThemeCard[] = Array.isArray(data.deck) && data.deck.length > 0 ? data.deck : shuffle(pool);

            const keepThree = target.role?.id === 'oracle' || (Array.isArray(target.candidates) && target.candidates.length > 0);
            const d = drawFromDeck<ThemeCard>(deck, pool, keepThree ? 3 : 1);
            deck = d.nextDeck;

            if (keepThree) {
              const choices = d.choices || [];
              target.candidates = choices;
              target.challenge = choices[0] ?? { title: 'FREE THEME', criteria: '—' };
            } else {
              target.candidates = null;
              target.challenge = d.picked ?? { title: 'FREE THEME', criteria: '—' };
            }

            mems[targetIdx] = target;

            tx.update(ref, { deck });
            pushLines.push(`SKILL ORACLE: REROLL -> ${target.name}`);
          }
        }

        // ---- ULT ----
        if (kind === 'ult') {
          if (r === 'maestro') {
            const combo = singer.combo ?? 0;
            const gain = combo * 800;
            teamScoresTx = { ...teamScoresTx, [t]: (teamScoresTx[t] ?? 0) + gain };
            singer.combo = 0;
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), nextSuccessBonus: (teamBuffsTx[t]?.nextSuccessBonus ?? 0) + 500 };
            pushLines.push(`ULT MAESTRO: FINALE team +${gain}, next success +500`);
          } else if (r === 'showman') {
            singer.buffs.spotlight = true;
            pushLines.push(`ULT SHOWMAN: SPOTLIGHT armed (success enemy -2000 / fail self -1000)`);
          } else if (r === 'ironwall') {
            const serial = data.turnSerial ?? 0;
            const readyCount = mems.filter((m: any) => isReadyForTurn(m)).length || mems.length || 6;
            const expire = serial + readyCount;
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), barrierUntil: expire, barrierOwner: singer.id };
            pushLines.push(`ULT IRONWALL: BARRIER active`);
          } else if (r === 'coach') {
            teamScoresTx = { ...teamScoresTx, [t]: (teamScoresTx[t] ?? 0) + 2500 };
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), blackoutTurns: 0 };
            pushLines.push(`ULT COACH: MORALE team +2500 (cleanse light debuffs)`);
          } else if (r === 'oracle') {
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), nextSuccessBonus: (teamBuffsTx[t]?.nextSuccessBonus ?? 0) + 1500 };
            pushLines.push(`ULT ORACLE: FATE SHIFT next success +1500`);
          } else if (r === 'mimic') {
            const stolen = opts.stolenRoleId;
            if (!stolen) return;
            singer.buffs.stolenSkill = stolen;
            pushLines.push(`ULT MIMIC: STEAL ROLE -> ${stolen}`);
          } else if (r === 'hype') {
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), hypeUltTurns: 3 };
            pushLines.push(`ULT HYPE: allies success +500 for 3 turns`);
          } else if (r === 'saboteur') {
            // ★「最悪の出来事」: 次の敵ターン -2000
            teamBuffsTx[et] = { ...(teamBuffsTx[et] || {}), blackoutTurns: 1 };
            pushLines.push(`ULT SABOTEUR: BLACKOUT -> TEAM ${et} next turn -2000`);
          } else if (r === 'underdog') {
            const losing = (teamScoresTx[t] ?? 0) < (teamScoresTx[et] ?? 0);
            if (!losing) return; // 劣勢時限定
            teamScoresTx = { ...teamScoresTx, [t]: (teamScoresTx[t] ?? 0) + 2000 };
            singer.buffs.clutchDebt = true; // このターン失敗時 -500
            pushLines.push(`ULT UNDERDOG: team +2000 (if fail -500 this turn)`);
          } else if (r === 'gambler') {
            singer.buffs.gamblerUlt = true;
            pushLines.push(`ULT GAMBLER: coinflip armed (+4000 / -1000)`);
          }
        }

        const fx: AbilityFx = {
          timestamp: Date.now(),
          kind: kind === 'ult' ? 'ULT' : 'SKILL',
          actorName: singer.name,
          roleName: singer.role?.name || 'ROLE',
          team: singer.team,
          title: pushLines[0] || undefined,
        };

        const entry: LogEntry = {
          ts: Date.now(),
          kind: kind === 'ult' ? 'ULT' : 'SKILL',
          actorName: singer.name,
          actorId: singer.id,
          team: singer.team,
          title: `${kind === 'ult' ? 'ULT' : 'SKILL'} ACTIVATED`,
          lines: [singer.role?.name || 'ROLE', ...pushLines],
        };

        const newLogs = capLogs([...(data.logs || []), ...pushLines.map((x) => `ABILITY: ${x}`)]);
        const newEntries = capEntries([...entries, entry]);

        tx.update(ref, {
          members: mems,
          teamBuffs: teamBuffsTx,
          teamScores: teamScoresTx,
          turnAbilityUsed: true,
          abilityFx: fx,
          logs: newLogs,
          logEntries: newEntries,
        });
      });
    } finally {
      setBusy(false);
    }
  };

  // =========================
  // Resolve result (SUCCESS/FAIL)
  // =========================
  const resolveResult = async (isSuccess: boolean) => {
    if (!roomId || !currentSinger) return;
    if (!canControlTurn) return;
    if (isCurrentSingerLocked) return;

    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const data: any = snap.data();
        let mems = (data.members || [])
          .map((m: any) => ({
            ...m,
            score: m.score ?? 0,
            combo: m.combo ?? 0,
            buffs: m.buffs ?? {},
            debuffs: m.debuffs ?? {},
            role: m.role ? { ...m.role, skillUses: m.role.skillUses ?? 3, ultUses: m.role.ultUses ?? 1 } : null,
            candidates: Array.isArray(m.candidates) ? m.candidates : null,
            challenge: m.challenge ?? null,
          }))
          .slice()
          .sort(sortByTurn);

        let idx = data.currentTurnIndex ?? 0;
        if (idx >= mems.length) idx = 0;
        if (mems.length > 0 && !isReadyForTurn(mems[idx])) idx = findFirstReadyIndex(mems);

        const singer = mems[idx];
        if (!singer) return;

        const t: TeamId = singer.team;
        const et: TeamId = t === 'A' ? 'B' : 'A';

        let teamScoresTx = data.teamScores || computeTeamScores(mems);
        const teamBuffsTx = data.teamBuffs || { A: {}, B: {} };

        let selfDelta = isSuccess ? BASE_SUCCESS : BASE_FAIL;
        let teamDelta = 0;
        let enemyTeamDelta = 0;

        const logLines: string[] = [];

        // ===== Team-wide special negative: BLACKOUT (saboteur ULT) =====
        if ((teamBuffsTx[t]?.blackoutTurns ?? 0) > 0) {
          selfDelta -= 2000;
          teamBuffsTx[t].blackoutTurns = Math.max(0, (teamBuffsTx[t].blackoutTurns ?? 0) - 1);
          logLines.push(`BLACKOUT: ${singer.name} -2000`);
        }

        const rid: RoleId | undefined = singer.role?.id;

        // ===== SABOTEUR SKILL debuff: success +0 / fail -800 =====
        const sabotage = singer.debuffs?.sabotaged;
        if (sabotage) {
          // override at the end, but keep note now
          logLines.push(`SABOTAGE ACTIVE`);
        }

        // ===== Passives / base role adjustments =====
        // showman passive ★変更：+500
        if (rid === 'showman' && isSuccess) selfDelta += 500;

        // saboteur passive
        if (rid === 'saboteur' && isSuccess) enemyTeamDelta -= 300;

        // maestro passive
        if (rid === 'maestro') {
          if (isSuccess) {
            const nextCombo = clamp((singer.combo ?? 0) + 1, 0, 5);
            singer.combo = nextCombo;
            const bonus = 250 * nextCombo;
            selfDelta += bonus;
            logLines.push(`COMBO x${nextCombo} (+${bonus})`);
          } else {
            singer.combo = 0;
            selfDelta -= 1000;
            logLines.push(`COMBO BROKEN (-1000)`);
          }
        }

        // gambler passive ★変更：-500〜1500（500刻み）
        if (rid === 'gambler' && isSuccess) {
          const choices = [-500, 0, 500, 1000, 1500];
          const b = choices[Math.floor(Math.random() * choices.length)];
          selfDelta += b;
          logLines.push(`GAMBLER PASSIVE ${fmt(b)}`);
        }

        // mimic passive
        if (rid === 'mimic' && isSuccess) {
          const last = teamBuffsTx[t]?.lastTeamDelta ?? 0;
          if (last > 0) {
            const bonus = roundToStep(last * 0.3, 100);
            selfDelta += bonus;
            logLines.push(`MIMIC PASSIVE +${bonus}`);
          }
        }

        // ===== Team buffs =====
        // nextSuccessBonus
        if (isSuccess && (teamBuffsTx[t]?.nextSuccessBonus ?? 0) > 0) {
          const b = teamBuffsTx[t].nextSuccessBonus;
          selfDelta += b;
          teamBuffsTx[t].nextSuccessBonus = 0;
          logLines.push(`TEAM BONUS +${b}`);
        }

        // hype ult: allies success +500 for 3 turns
        if (isSuccess && (teamBuffsTx[t]?.hypeUltTurns ?? 0) > 0) {
          selfDelta += 500;
          logLines.push(`HYPE ULT +500`);
        }

        // decrement hypeUltTurns per ally turn (success/fail問わず)
        if ((teamBuffsTx[t]?.hypeUltTurns ?? 0) > 0) {
          teamBuffsTx[t].hypeUltTurns = Math.max(0, (teamBuffsTx[t].hypeUltTurns ?? 0) - 1);
        }

        // roar (旧仕様が残る場合に備えて維持)
        if (isSuccess && (teamBuffsTx[t]?.roarRemaining ?? 0) > 0) {
          selfDelta += 500;
          teamBuffsTx[t].roarRemaining = Math.max(0, (teamBuffsTx[t].roarRemaining ?? 0) - 1);
          logLines.push(`ROAR +500 (remain ${teamBuffsTx[t].roarRemaining})`);
        }

        // ===== Armed buffs on singer =====
        // maestro skill ★変更
        if (singer.buffs?.maestroSkill) {
          if (isSuccess) {
            const before = singer.combo ?? 0;
            const after = clamp(before + 2, 0, 5);
            singer.combo = after;
            logLines.push(`SKILL MAESTRO: COMBO +2 (x${before} -> x${after})`);
          } else {
            selfDelta -= 500;
            logLines.push(`SKILL MAESTRO: FAIL -500`);
          }
          singer.buffs.maestroSkill = false;
        }

        // showman skill ENCORE
        if (singer.buffs?.encore) {
          if (isSuccess) selfDelta += 1200;
          singer.buffs.encore = false;
          logLines.push(`ENCORE ${isSuccess ? '+1200' : '+0'}`);
        }

        // gambler skill DOUBLE DOWN
        if (singer.buffs?.doubleDown) {
          if (isSuccess) selfDelta = selfDelta * 2;
          else selfDelta -= 2000;
          singer.buffs.doubleDown = false;
          logLines.push(`DOUBLE DOWN ${isSuccess ? 'x2' : '-2000'}`);
        }

        // gambler ult ★変更：coinflip +4000 / -1000 (success関係なく適用)
        if (singer.buffs?.gamblerUlt) {
          const head = Math.random() < 0.5;
          const delta = head ? 4000 : -1000;
          selfDelta += delta;
          singer.buffs.gamblerUlt = false;
          logLines.push(`GAMBLER ULT ${head ? '+4000' : '-1000'}`);
        }

        // showman ult SPOTLIGHT
        if (singer.buffs?.spotlight) {
          if (isSuccess) enemyTeamDelta -= 2000;
          else selfDelta -= 1000;
          singer.buffs.spotlight = false;
          logLines.push(`SPOTLIGHT ${isSuccess ? 'enemy -2000' : 'self -1000'}`);
        }

        // mimic skill ECHO
        if (singer.buffs?.echo) {
          const lastTurn = data.lastTurnDelta ?? 0;
          const add = roundToStep(lastTurn * 0.5, 100);
          selfDelta += add;
          singer.buffs.echo = false;
          logLines.push(`ECHO ${fmt(add)} (from last ${fmt(lastTurn)})`);
        }

        // hype skill target bonus (+2000 on next success)
        if (isSuccess && singer.buffs?.hypeBoost?.value) {
          const v = singer.buffs.hypeBoost.value;
          selfDelta += v;
          singer.buffs.hypeBoost = null;
          logLines.push(`HYPE BOOST +${v}`);
        }

        // stolen skill mapping (mimic ult)
        if (singer.buffs?.stolenSkill) {
          const stolen: RoleId = singer.buffs.stolenSkill;
          if (stolen === 'showman') singer.buffs.encore = true;
          else if (stolen === 'maestro') singer.buffs.maestroSkill = true;
          else if (stolen === 'gambler') singer.buffs.doubleDown = true;
          else if (stolen === 'hype') {
            // mimic steals "hype boost" as team next success +1000 (簡易)
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), nextSuccessBonus: (teamBuffsTx[t]?.nextSuccessBonus ?? 0) + 1000 };
          } else {
            if (isSuccess) selfDelta += 800;
          }
          singer.buffs.stolenSkill = null;
          logLines.push(`STEAL ROLE applied: ${stolen}`);
        }

        // coach skill SAFE: failでもチーム+300
        if (!isSuccess && singer.buffs?.safe) {
          teamDelta += 300;
          singer.buffs.safe = false;
          logLines.push(`SAFE TRIGGER team +300`);
        }

        // ironwall skill INTERCEPT: transfer half of negative to tank
        if (selfDelta < 0 && singer.buffs?.intercept?.by) {
          const byId = singer.buffs.intercept.by;
          const tank = mems.find((m: any) => m.id === byId);
          if (tank) {
            const transferred = roundToStep(Math.abs(selfDelta) * 0.5, 100);
            selfDelta = 0;
            tank.score = (tank.score ?? 0) - transferred;
            logLines.push(`INTERCEPT: -${transferred} -> ${tank.name}`);
          }
          singer.buffs.intercept = null;
        }

        // underdog ult ★変更：劣勢時 team +2000（発動済）/ fail -500
        if (!isSuccess && singer.buffs?.clutchDebt) {
          selfDelta -= 500;
          singer.buffs.clutchDebt = false;
          logLines.push(`UNDERDOG ULT FAIL -500`);
        } else if (singer.buffs?.clutchDebt) {
          // 成功ならただ消す
          singer.buffs.clutchDebt = false;
        }

        // ===== SABOTEUR SKILL override (final override) =====
        if (sabotage) {
          const forced = isSuccess ? 0 : -800;
          // 「敵は +0 / -800」なので最終selfDeltaを上書き
          selfDelta = forced;
          singer.debuffs.sabotaged = null;
          logLines.push(`SABOTAGE OVERRIDE -> ${fmt(forced)}`);
        }

        // ===== barrier / ironwall reduction (team negative only) =====
        const serial = data.turnSerial ?? 0;
        const barrierActive = (teamBuffsTx[t]?.barrierUntil ?? -1) > serial;
        const ironwallActive = mems.some((m: any) => m.team === t && m.role?.id === 'ironwall');

        if (teamDelta < 0) {
          if (barrierActive) {
            teamDelta = 0;
            logLines.push(`BARRIER BLOCKED team negative`);
          } else if (ironwallActive) {
            const reduced = roundToStep(teamDelta * 0.7, 100);
            logLines.push(`IRONWALL reduced team negative ${fmt(teamDelta)} -> ${fmt(reduced)}`);
            teamDelta = reduced;
          }
        }

        if (enemyTeamDelta < 0) {
          const enemyBarrier = (teamBuffsTx[et]?.barrierUntil ?? -1) > serial;
          const enemyIronwall = mems.some((m: any) => m.team === et && m.role?.id === 'ironwall');
          if (enemyBarrier) {
            enemyTeamDelta = 0;
            logLines.push(`ENEMY BARRIER BLOCKED enemy negative`);
          } else if (enemyIronwall) {
            const reduced = roundToStep(enemyTeamDelta * 0.7, 100);
            logLines.push(`ENEMY IRONWALL reduced enemy negative ${fmt(enemyTeamDelta)} -> ${fmt(reduced)}`);
            enemyTeamDelta = reduced;
          }
        }

        // ===== Apply to scores =====
        singer.score = (singer.score ?? 0) + selfDelta;

        const prevTS = { ...teamScoresTx };
        teamScoresTx = {
          ...teamScoresTx,
          [t]: (teamScoresTx[t] ?? 0) + selfDelta + teamDelta,
          [et]: (teamScoresTx[et] ?? 0) + enemyTeamDelta,
        };

        // store lastTeamDelta for mimic passive
        if (isSuccess) teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), lastTeamDelta: selfDelta };
        else teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), lastTeamDelta: teamBuffsTx[t]?.lastTeamDelta ?? 0 };

        const lastTurnDelta = selfDelta;

        // ===== Deal next mission to singer =====
        const pool = normalizeThemePool(data.themePool);
        let deck: ThemeCard[] = Array.isArray(data.deck) && data.deck.length > 0 ? data.deck : shuffle(pool);

        const want3 = singer.role?.id === 'oracle';
        const dealt = drawFromDeck<ThemeCard>(deck, pool, want3 ? 3 : 1);
        deck = dealt.nextDeck;

        if (want3) {
          const choices = dealt.choices || [];
          singer.candidates = choices;
          singer.challenge = choices[0] ?? { title: 'FREE THEME', criteria: '—' };
        } else {
          singer.candidates = null;
          singer.challenge = dealt.picked ?? { title: 'FREE THEME', criteria: '—' };
        }

        // ===== Move turn =====
        const nextIndex = findNextReadyIndex(mems, idx);
        const nextSingerLocal = mems[nextIndex] || singer;

        // Start-of-turn auras
        const auraRes = computeStartAuras(mems, nextSingerLocal, teamScoresTx);
        const finalTS = auraRes.teamScores;

        const nextSerial = serial + 1;

        // ===== Detailed Logs =====
        const resultTitle = `${isSuccess ? 'SUCCESS' : 'FAIL'}: ${singer.name}`;
        const detailLines: string[] = [];
        detailLines.push(`PLAYER ${singer.name} (${singer.role?.name || '—'}) => ${fmt(selfDelta)}`);
        detailLines.push(`TEAM ${t} => ${fmt(selfDelta + teamDelta)} (teamExtra ${fmt(teamDelta)})`);
        if (enemyTeamDelta !== 0) detailLines.push(`TEAM ${et} => ${fmt(enemyTeamDelta)}`);

        if (auraRes.auraAdd !== 0) detailLines.push(`NOTE AURA: next turn TEAM ${nextSingerLocal.team} ${fmt(auraRes.auraAdd)}`);
        for (const l of logLines) detailLines.push(l);

        const newLogs = capLogs([
          ...(data.logs || []),
          `RESULT: ${singer.name} ${isSuccess ? 'SUCCESS' : 'FAIL'} (TEAM ${t})`,
          ...logLines.map((x) => ` - ${x}`),
          `TURN START: ${nextSingerLocal?.name || '???'} (TEAM ${nextSingerLocal?.team || '?'})`,
        ]);

        const entries: LogEntry[] = Array.isArray(data.logEntries) ? data.logEntries : [];
        const resultEntry: LogEntry = {
          ts: Date.now(),
          kind: 'RESULT',
          actorName: singer.name,
          actorId: singer.id,
          team: singer.team,
          title: `${isSuccess ? 'SUCCESS' : 'FAIL'} / ${singer.role?.name || 'ROLE'}`,
          lines: [
            `SELF: ${fmt(selfDelta)}`,
            `TEAM ${t}: ${fmt((finalTS[t] ?? 0) - (prevTS[t] ?? 0))} (after aura)`,
            `TEAM ${et}: ${fmt((finalTS[et] ?? 0) - (prevTS[et] ?? 0))} (after aura)`,
            `THEME: ${cardTitle(currentChallenge)}`,
            `COND: ${cardCriteria(currentChallenge)}`,
            ...logLines,
          ],
        };
        const turnEntry: LogEntry = {
          ts: Date.now(),
          kind: 'TURN',
          actorName: nextSingerLocal?.name,
          actorId: nextSingerLocal?.id,
          team: nextSingerLocal?.team,
          title: 'NEXT TURN',
          lines: [`NEXT: ${nextSingerLocal?.name || '???'} (TEAM ${nextSingerLocal?.team || '?'})`],
        };

        const newEntries = capEntries([...entries, resultEntry, turnEntry]);

        tx.update(ref, {
          members: mems,
          teamScores: finalTS,
          teamBuffs: teamBuffsTx,
          currentTurnIndex: nextIndex,
          turnSerial: nextSerial,
          deck,
          themePool: pool,
          logs: newLogs,
          logEntries: newEntries,
          turnAbilityUsed: false,
          lastTurnDelta,
          lastLog: { timestamp: Date.now(), title: resultTitle, detail: detailLines.join('\n') },
        });
      });
    } finally {
      setBusy(false);
    }
  };

  // =========================
  // End game
  // =========================
  const endGame = async () => {
    if (!roomId || !isHost) return;
    await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' });
    navigate('/team-result');
  };

  // =========================
  // UI data
  // =========================
  const scoreA = teamScores.A ?? 0;
  const scoreB = teamScores.B ?? 0;
  const leader = scoreA === scoreB ? null : scoreA > scoreB ? 'A' : 'B';

  const reorderedMembers = useMemo(() => {
    const s = sortedMembers.slice();
    if (s.length === 0) return s;
    return [...s.slice(safeIndex), ...s.slice(0, safeIndex)];
  }, [sortedMembers, safeIndex]);

  const needsSelection = (m: any) => Array.isArray(m.candidates) && m.candidates.length > 0;
  const canProxy = (m: any) => isHost && (offlineUsers.has(m.id) || String(m.id).startsWith('guest_')) && needsSelection(m);

  // =========================
  // Finish guard
  // =========================
  if (!roomData) return <div className="h-screen w-full flex items-center justify-center text-white">LOADING...</div>;

  return (
    <div className="w-full h-[100dvh] text-white overflow-hidden flex flex-col md:flex-row relative bg-[#0f172a]">
      <Toast messages={messages} onRemove={removeToast} />

      {/* Turn result overlay */}
      <AnimatePresence>{activeActionLog && <ActionOverlay actionLog={activeActionLog} onClose={clearActionLog} />}</AnimatePresence>

      {/* Skill/Ult overlay */}
      <AnimatePresence>{abilityFx && <AbilityFxOverlay fx={abilityFx} onDone={clearAbilityFx} />}</AnimatePresence>

      {/* Confirm modal */}
      <ConfirmModal state={confirmState} busy={busy} onClose={() => !busy && setConfirmState(null)} />

      {/* JOIN WIZARD */}
      <JoinTeamRoleModal
        isOpen={joinStep !== null}
        step={(joinStep ?? 'team') as any}
        busy={busy}
        teamCounts={teamCounts}
        usedRoleIds={usedRoleIds}
        onPickTeam={(t) => requestPickTeam(t)}
        onPickRole={(r) => requestPickRole(r)}
        onBack={() => setJoinStep('team')}
      />

      {/* TARGET MODAL */}
      <TargetModal
        isOpen={!!targetModal}
        title={targetModal?.title || ''}
        busy={busy}
        targets={availableTargets}
        onClose={() => setTargetModal(null)}
        onPick={(id) => {
          const action = targetModal?.action;
          setTargetModal(null);
          if (!action) return;
          requestConfirmTarget(action, id);
        }}
      />

      {/* PROXY modal (mission candidates) */}
      <AnimatePresence>
        {proxyTarget && (
          <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setProxyTarget(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-[250] w-full max-w-4xl flex flex-col items-center gap-2 md:gap-4 h-full md:justify-center pointer-events-auto">
              <div className="flex-none text-center">
                <h2 className="text-2xl md:text-5xl font-black text-yellow-400 italic tracking-tighter drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">DESTINY CHOICE</h2>
                <p className="text-yellow-200 font-bold text-sm tracking-widest mt-1 uppercase">PROXY FOR: {proxyTarget.name}</p>
              </div>

              <div className="w-full flex-1 overflow-y-auto min-h-0 custom-scrollbar px-1 pb-2 md:overflow-visible md:h-auto">
                <div className="flex flex-col md:grid md:grid-cols-3 gap-2 md:gap-4 w-full">
                  {(proxyTarget.candidates || []).map((cand: any, idx: number) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.05, borderColor: '#facc15' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => requestPickCandidate(proxyTarget.id, cand, true)}
                      disabled={busy}
                      className="bg-black/80 backdrop-blur-md border border-white/20 hover:bg-yellow-900/40 p-4 md:p-6 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-2 transition-colors min-h-[100px] md:min-h-[160px] shrink-0 disabled:opacity-50"
                    >
                      <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">OPTION {idx + 1}</div>
                      <h3 className="font-bold text-white text-base md:text-xl leading-tight break-all">{cardTitle(cand)}</h3>
                      <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5">{cardCriteria(cand)}</p>
                    </motion.button>
                  ))}
                </div>
              </div>

              <button onClick={() => setProxyTarget(null)} className="mt-2 px-8 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-gray-400 font-bold text-xs tracking-widest">
                CANCEL PROXY
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LOG drawer (more detailed) */}
      <AnimatePresence>
        {showLogsDrawer && (
          <div className="fixed inset-0 z-[210] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowLogsDrawer(false)} />
            <motion.div
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: 'spring', damping: 25, stiffness: 260 }}
              className="relative w-[92vw] max-w-[520px] h-full bg-black/70 backdrop-blur-xl border-l border-white/10 p-4 flex flex-col"
            >
              <div className="flex items-center justify-between">
                <div className="font-black tracking-widest">BATTLE LOG</div>
                <button onClick={() => setShowLogsDrawer(false)} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center">
                  ✕
                </button>
              </div>

              <div className="mt-2 text-[10px] font-mono tracking-widest text-white/40">
                ROOM: {roomId} ・ ENTRIES: {logEntries.length}
              </div>

              <div className="mt-3 flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                {logEntries.slice().reverse().map((e, i) => (
                  <div key={`${e.ts}-${i}`} className={`rounded-xl border ${kindColorClass(e.kind)} p-3`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-lg">{iconOf(e.kind)}</div>
                          <div className="font-black tracking-widest text-sm truncate">{e.title}</div>
                          {e.team && (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded ${e.team === 'A' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30' : 'bg-red-500/20 text-red-200 border border-red-500/30'}`}>
                              TEAM {e.team}
                            </span>
                          )}
                        </div>
                        {e.actorName && <div className="text-[10px] font-mono tracking-widest text-white/60 mt-0.5 truncate">BY: {e.actorName}</div>}
                      </div>
                      <div className="text-[10px] font-mono tracking-widest text-white/40 flex-none">{formatTime(e.ts)}</div>
                    </div>

                    <div className="mt-2 space-y-1">
                      {e.lines.map((l, idx) => {
                        const neg = l.includes('-');
                        const pos = l.includes('+');
                        const cls = neg ? 'text-red-300' : pos ? 'text-cyan-200' : 'text-white/70';
                        return (
                          <div key={idx} className={`text-[11px] leading-relaxed ${cls}`}>
                            • {l}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {logEntries.length === 0 && (
                  <div className="text-[11px] text-white/40 font-mono tracking-widest">NO LOG ENTRIES YET</div>
                )}

                <div className="h-6" />
              </div>

              <div className="pt-3 border-t border-white/10 text-[10px] font-mono tracking-widest text-white/40">
                （旧ログ）{logs.length} 行
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Host Missing */}
      <AnimatePresence>
        {!isHost && isHostMissing && (
          <div className="fixed inset-0 z-[230] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/95 backdrop-blur-xl" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-sm bg-[#0f172a] border border-orange-500/50 rounded-2xl shadow-[0_0_50px_rgba(249,115,22,0.3)] p-1 z-50">
              <div className="bg-gradient-to-b from-orange-900/40 to-black p-8 flex flex-col items-center text-center gap-6">
                <div className="text-4xl animate-bounce">📡</div>
                <div>
                  <h2 className="text-xl font-black text-orange-400 tracking-widest">WAITING FOR HOST</h2>
                  <p className="text-gray-400 text-sm font-mono mt-2 leading-relaxed">
                    ホストとの接続が確認できません。
                    <br />
                    再接続を待機しています...
                  </p>
                </div>
                <div className="w-full mt-2">
                  <button onClick={handleForceLeave} className="w-full py-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold tracking-widest text-xs">
                    LEAVE ROOM
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
        {/* Header */}
        <div className="flex-none h-14 md:h-20 flex items-center justify-between px-2 md:px-6 border-b border-white/10 bg-black/20 backdrop-blur-md overflow-hidden gap-2">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 overflow-hidden">
            <div className="flex-none w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-xl shadow-[0_0_15px_cyan] border border-white/20 font-bold">
              {currentSinger?.avatar || '🎤'}
            </div>

            <div className="min-w-0 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-red-500 rounded-full animate-pulse flex-none" />
                <p className="text-[8px] md:text-[10px] text-cyan-400 font-mono tracking-widest font-bold whitespace-nowrap">NOW SINGING</p>
                <span className="text-[8px] md:text-[10px] text-gray-500 font-mono whitespace-nowrap">ID: {roomId}</span>
              </div>
              <motion.p key={currentSinger?.id || 'none'} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-white font-black leading-none truncate drop-shadow-md text-base md:text-[clamp(1.2rem,3vw,2.6rem)]">
                {currentSinger?.name || '...'}
              </motion.p>
              <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">TEAM {currentSinger?.team || '?'} ・ ROLE {currentSinger?.role?.name || '—'}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-none">
            <button
              onClick={() => setShowLogsDrawer(true)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 hover:bg-cyan-900/30 hover:border-cyan-500 transition-all active:scale-95"
              title="LOG"
            >
              🧾
            </button>

            <button
              onClick={() => setShowRoleInfo((v) => !v)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-yellow-300 hover:bg-yellow-900/30 hover:border-yellow-500 transition-all active:scale-95"
              title="ROLE INFO"
            >
              🎭
            </button>

            <div className="flex items-center gap-2">
              <TeamScorePill team="A" score={scoreA} leader={leader === 'A'} />
              <div className="text-[10px] font-mono text-white/30 tracking-widest">VS</div>
              <TeamScorePill team="B" score={scoreB} leader={leader === 'B'} />
            </div>

            {isHost && (
              <button onClick={() => setShowFinishModal(true)} className="hidden md:flex px-4 py-2 rounded-xl border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs font-black tracking-widest">
                FINISH
              </button>
            )}
          </div>
        </div>

        {/* Effects bar */}
        <div className="flex-none px-2 md:px-6 py-2 border-b border-white/10 bg-black/10">
          <div className="text-[9px] font-mono tracking-widest text-white/40 mb-1">ACTIVE EFFECTS</div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {activeEffects.length === 0 ? (
              <span className="text-[10px] text-white/30 font-mono tracking-widest">NO ACTIVE EFFECTS</span>
            ) : (
              activeEffects.map((c, i) => (
                <span key={`${c}-${i}`} className="px-2 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-200 text-[10px] font-bold tracking-widest whitespace-nowrap">
                  {c}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Role info collapsible */}
        <AnimatePresence>
          {showRoleInfo && roleInfoTarget?.role?.id && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex-none px-2 md:px-6 py-3 border-b border-white/10 bg-black/20">
              <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono tracking-widest text-white/40">ROLE INFO {isHost && isGuestTurn ? '(GUEST TURN)' : ''}</div>
                  <button onClick={() => setShowRoleInfo(false)} className="text-xs text-white/50 hover:text-white">
                    CLOSE
                  </button>
                </div>

                <div className="mt-2 p-3 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">{roleDef(roleInfoTarget.role.id)?.sigil || '🎭'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black truncate">{roleInfoTarget.role.name}</div>
                      <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">FOR: {roleInfoTarget.name}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-[12px] text-white/70 leading-relaxed space-y-2">
                    <div>
                      <div className="text-[10px] font-mono tracking-widest text-white/40">PASSIVE</div>
                      <div>{roleDef(roleInfoTarget.role.id)?.passive}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono tracking-widest text-white/40">SKILL</div>
                      <div>{roleDef(roleInfoTarget.role.id)?.skill}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono tracking-widest text-white/40">ULT</div>
                      <div>{roleDef(roleInfoTarget.role.id)?.ult}</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Area */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-2 md:p-4 relative w-full overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-[120%] aspect-square border border-cyan-500/20 rounded-full animate-[spin_20s_linear_infinite] max-h-[520px]" />
          </div>

          <AnimatePresence mode="wait">
            {isSelectingMission && displayCandidates && selectionOwner ? (
              <motion.div key="selection-ui" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="relative z-20 w-full max-w-4xl flex flex-col items-center gap-2 md:gap-4 h-full md:justify-center">
                <div className="flex-none text-center pt-2 md:pt-0">
                  <h2 className="text-2xl md:text-5xl font-black text-yellow-400 italic tracking-tighter drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">DESTINY CHOICE</h2>

                  {isHostOverrideSelecting ? (
                    <p className="text-[10px] md:text-sm font-bold text-red-400 tracking-widest mt-1 bg-red-900/50 px-3 py-1 rounded-full border border-red-500 animate-pulse">
                      HOST OVERRIDE / FOR: {selectionOwner.name}
                    </p>
                  ) : (
                    <p className="text-[10px] md:text-sm font-bold text-white tracking-widest mt-1">お題を選択してください（{selectionOwner.name}）</p>
                  )}
                </div>

                <div className="w-full flex-1 overflow-y-auto min-h-0 custom-scrollbar px-1 pb-2 md:overflow-visible md:h-auto">
                  <div className="flex flex-col md:grid md:grid-cols-3 gap-2 md:gap-4 w-full">
                    {displayCandidates.map((cand: any, idx: number) => (
                      <motion.button
                        key={`${cardTitle(cand)}-${idx}`}
                        whileHover={{ scale: 1.05, borderColor: '#facc15' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => requestPickCandidate(selectionOwner.id, cand, false)}
                        disabled={busy}
                        className="bg-black/80 backdrop-blur-md border border-white/20 hover:bg-yellow-900/40 p-4 md:p-6 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-2 transition-colors min-h-[100px] md:min-h-[160px] shrink-0 disabled:opacity-50"
                      >
                        <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">OPTION {idx + 1}</div>
                        <h3 className="font-bold text-white text-base md:text-xl leading-tight break-all">{cardTitle(cand)}</h3>
                        <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5">{cardCriteria(cand)}</p>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <MissionDisplay key={(currentSinger?.id || 'none') + turnSerial} title={cardTitle(currentChallenge)} criteria={cardCriteria(currentChallenge)} stateText={isCurrentSingerLocked ? 'CHOOSING THEME...' : null} />
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex-none px-2 pb-2 md:pb-10 pt-1 bg-gradient-to-t from-black/90 to-transparent z-20 w-full">
          <div className="flex gap-2 md:gap-6 w-full max-w-5xl mx-auto">
            {canControlTurn ? (
              <>
                <button
                  disabled={busy || isCurrentSingerLocked || !!activeActionLog}
                  onClick={() => resolveResult(false)}
                  className="flex-1 rounded-xl bg-[#1e293b]/80 backdrop-blur-sm border border-[#334155] text-gray-400 font-black text-sm md:text-2xl tracking-widest active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  FAIL
                </button>

                <button
                  disabled={busy || isCurrentSingerLocked || !!activeActionLog}
                  onClick={() => resolveResult(true)}
                  className="flex-[2] rounded-xl bg-gradient-to-r from-cyan-600/90 to-blue-600/90 backdrop-blur-sm border-0 text-white font-black text-lg md:text-4xl italic tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="relative z-10">SUCCESS!!</span>
                </button>
              </>
            ) : (
              <div className="flex-[3] h-12 md:h-24 flex items-center justify-center bg-black/40 border border-white/10 rounded-xl backdrop-blur-md">
                <p className="text-gray-400 font-mono text-[10px] md:text-base tracking-widest animate-pulse">WAITING FOR RESULT...</p>
              </div>
            )}

            {/* Ability panel */}
            <div className="flex-1 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md p-2 md:p-3 flex flex-col gap-2">
              <div className="text-[8px] md:text-[10px] font-mono tracking-widest text-white/40">ABILITIES</div>

              <button
                disabled={!canUseSkill || busy || !!activeActionLog}
                onClick={requestUseSkill}
                className={`w-full py-2 rounded-xl font-black tracking-widest text-xs transition-all ${
                  canUseSkill && !busy && !activeActionLog
                    ? 'bg-gradient-to-r from-cyan-700 to-blue-700 hover:scale-[1.02]'
                    : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                SKILL ({currentSinger?.role?.skillUses ?? 0})
              </button>

              <button
                disabled={!canUseUlt || busy || !!activeActionLog}
                onClick={requestUseUlt}
                className={`w-full py-2 rounded-xl font-black tracking-widest text-xs transition-all ${
                  canUseUlt && !busy && !activeActionLog
                    ? 'bg-gradient-to-r from-yellow-600 to-orange-700 hover:scale-[1.02]'
                    : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                ULT ({currentSinger?.role?.ultUses ?? 0})
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Reservation List */}
        <div className="md:hidden w-full bg-black/80 backdrop-blur-md border-t border-white/10 p-1.5 pb-4 flex flex-col gap-1 flex-none">
          <div className="flex justify-between items-center px-1">
            <span className="text-[8px] font-bold text-gray-500 tracking-widest">RESERVATION LIST</span>
            {isHost && (
              <button onClick={() => setShowFinishModal(true)} className="text-[8px] text-red-400 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-900/30">
                FINISH
              </button>
            )}
          </div>

          <div className="flex overflow-x-auto gap-2 pb-1 custom-scrollbar snap-x">
            {reorderedMembers.map((member) => {
              const isCurrent = member.id === currentSinger?.id;
              const isOffline = offlineUsers.has(member.id) && !String(member.id).startsWith('guest_');
              const isGuest = String(member.id).startsWith('guest_');

              const challenge = member.challenge || { title: '...', criteria: '...' };

              return (
                <div
                  key={member.id}
                  className={`snap-start flex-none w-40 bg-white/5 border ${isCurrent ? 'border-cyan-500 bg-cyan-900/20' : 'border-white/10'} rounded-lg p-2 flex flex-col gap-1 relative overflow-hidden ${isOffline ? 'grayscale opacity-70' : ''}`}
                >
                  {isCurrent && <div className="absolute top-0 right-0 bg-cyan-500 text-black text-[6px] font-bold px-1 py-0.5 rounded-bl">NOW</div>}
                  {isGuest && <div className="absolute top-0 left-0 bg-purple-600 text-white text-[6px] font-bold px-1 py-0.5 rounded-br">GUEST</div>}

                  <div className="flex items-center gap-2">
                    <div className="text-lg">{member.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[10px] font-bold truncate ${isCurrent ? 'text-white' : 'text-gray-300'}`}>{member.name}</div>
                      <div className="text-[8px] font-mono text-white/40 truncate">TEAM {member.team || '?'} ・ {(member.score || 0).toLocaleString()} pt</div>
                    </div>
                  </div>

                  <div className="h-[1px] bg-white/10 w-full my-0.5" />

                  <div className="text-[8px] text-cyan-200 font-bold truncate leading-tight">{cardTitle(challenge)}</div>
                  <div className="text-[7px] text-gray-400 font-mono truncate">{cardCriteria(challenge)}</div>

                  {needsSelection(member) && (
                    <div className="mt-1 text-[7px] font-bold text-yellow-300 border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 rounded-full w-fit">
                      CHOOSE
                    </div>
                  )}

                  {isOffline && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-red-500 font-bold backdrop-blur-[1px]">OFFLINE</div>}

                  {canProxy(member) && (
                    <button
                      onClick={() => setProxyTarget(member)}
                      className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm z-10 border-2 border-yellow-400 animate-pulse text-yellow-400 hover:bg-yellow-400 hover:text-black transition-colors"
                    >
                      <span className="text-xl">⚡</span>
                      <span className="text-[8px] font-black tracking-tighter">PROXY</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop Reservation List */}
      <div className="hidden md:flex w-[320px] lg:w-[380px] flex-none bg-black/60 backdrop-blur-xl border-l border-white/10 flex-col relative z-20 shadow-2xl">
        <div className="p-4 md:p-6 border-b border-white/10 bg-white/5 flex-none">
          <h3 className="text-xs md:text-sm font-bold text-white tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            RESERVATION LIST
          </h3>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">TOTAL: {sortedMembers.length} MEMBERS</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
          {reorderedMembers.map((member) => {
            const isCurrent = member.id === currentSinger?.id;

            const isGuest = String(member.id).startsWith('guest_');
            const isOffline = offlineUsers.has(member.id) && !isGuest;
            const challenge = member.challenge || { title: '...', criteria: '...' };

            return (
              <motion.div
                layout
                key={member.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: isOffline ? 0.6 : 1 }}
                transition={{ duration: 0.25 }}
                className={`p-3 rounded-xl relative overflow-hidden group transition-all shrink-0 border ${
                  isCurrent ? 'bg-cyan-900/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-black/40 border-white/10 hover:border-white/30'
                } ${isOffline ? 'grayscale' : ''}`}
              >
                <div className="absolute top-0 right-0 bg-white/10 px-2 py-0.5 rounded-bl-lg text-[9px] font-mono text-gray-400">{isCurrent ? 'NOW' : 'UPCOMING'}</div>

                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center text-lg">
                    {member.avatar}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-gray-300'}`}>{member.name}</span>
                      {isGuest && <span className="text-[9px] bg-purple-600 text-white px-1.5 rounded font-bold">GUEST</span>}
                      {needsSelection(member) && <span className="text-[9px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-1.5 rounded font-bold">CHOOSE</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={`font-bold ${member.team === 'A' ? 'text-cyan-300' : member.team === 'B' ? 'text-red-300' : 'text-gray-500'}`}>TEAM {member.team || '?'}</span>
                      <span className="text-gray-500">|</span>
                      <span className="text-cyan-200">{(member.score || 0).toLocaleString()} pt</span>
                    </div>
                  </div>

                  {isOffline && <span className="ml-auto text-[9px] bg-red-900 text-red-300 px-1 rounded">OFFLINE</span>}

                  {canProxy(member) && (
                    <button onClick={() => setProxyTarget(member)} className="ml-auto px-3 py-1.5 rounded bg-yellow-400 text-black font-black text-[10px] animate-pulse border-2 border-yellow-200 shadow-[0_0_10px_yellow] hover:scale-110 transition-transform z-10 flex items-center gap-1">
                      ⚡ PROXY
                    </button>
                  )}
                </div>

                <div className="bg-black/40 rounded-lg p-2 border-l-2 border-cyan-500/50">
                  <p className={`text-[10px] font-bold leading-tight mb-1 ${isCurrent ? 'text-cyan-200' : 'text-gray-300'}`}>{cardTitle(challenge)}</p>
                  <div className="flex items-center gap-1 opacity-80">
                    <span className="w-1 h-1 rounded-full bg-red-400" />
                    <p className="text-[9px] text-gray-400 font-mono leading-tight">{cardCriteria(challenge)}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div className="h-4" />
        </div>

        {isHost && (
          <div className="p-4 pb-8 md:pb-10 border-t border-white/10 bg-black/40 flex-none">
            <button onClick={() => setShowFinishModal(true)} className="w-full py-3 md:py-4 rounded-xl border-2 border-red-500/30 text-red-400 font-bold tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2 group text-sm">
              GAME FINISH
            </button>
          </div>
        )}
      </div>

      {/* Finish Modal */}
      <AnimatePresence>
        {showFinishModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowFinishModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1">
              <div className="bg-black/40 rounded-xl p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">🏁</div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest mb-2">FINISH GAME?</h2>
                  <p className="text-gray-400 text-sm font-mono">ゲームを終了して結果発表へ移動しますか？</p>
                </div>
                <div className="flex w-full gap-3 mt-2">
                  <button onClick={() => setShowFinishModal(false)} className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors">
                    CANCEL
                  </button>
                  <button
                    onClick={() => {
                      setShowFinishModal(false);
                      endGame();
                    }}
                    className="flex-1 py-4 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black tracking-widest text-sm shadow-lg shadow-red-900/50 transition-all hover:scale-[1.02]"
                  >
                    YES, FINISH
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// =========================
// small UI components
// =========================
const TeamScorePill = ({ team, score, leader }: { team: 'A' | 'B'; score: number; leader: boolean }) => {
  const cls = team === 'A' ? 'border-cyan-500/30 text-cyan-100 bg-cyan-500/10' : 'border-red-500/30 text-red-100 bg-red-500/10';

  return (
    <div className={`px-3 py-1.5 rounded-2xl border ${cls} min-w-[86px] text-center`}>
      <div className="text-[9px] font-mono tracking-widest opacity-70">TEAM {team}</div>
      <div className={`text-lg md:text-xl font-black tracking-tight ${leader ? 'drop-shadow-[0_0_18px_rgba(250,204,21,0.25)]' : ''}`}>{score.toLocaleString()}</div>
    </div>
  );
};

export default GamePlayTeamScreen;