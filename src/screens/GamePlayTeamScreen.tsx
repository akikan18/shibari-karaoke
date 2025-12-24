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
const MAX_LOG_ENTRIES = 220;

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
    passive: '成功でCOMBO+1(最大5)。成功ボーナス+250×COMBO。失敗でCOMBO消滅のみ（減点なし）。',
    skill: 'SKILL：(3回) このターン「成功なら追加でCOMBO+2 / 失敗なら-500」',
    ult: 'ULT：(1回) COMBO×800をチーム付与しCOMBO消費。味方次成功+500(1回)',
  },
  {
    id: 'showman',
    name: 'SHOWMAN',
    type: 'ATK',
    sigil: '◆',
    passive: 'PASSIVE：成功時、常時 +500。',
    skill: 'SKILL：(3回) 成功時さらに+500（このターンのみ）',
    ult: 'ULT：(1回) 成功なら敵チーム-2000（このターンのみ）',
  },
  {
    id: 'ironwall',
    name: 'IRON WALL',
    type: 'DEF',
    sigil: '▣',
    passive: 'チームが受ける「マイナス」を30%軽減（歌唱の失敗0は対象外）。',
    skill: 'SKILL：(3回) 次の自チームのターン、受けるマイナス-50%',
    ult: 'ULT：(1回) 次の自チームのターン、受けるマイナスをすべて0',
  },
  {
    id: 'coach',
    name: 'THE COACH',
    type: 'SUP',
    sigil: '✚',
    passive: '味方ターン開始時、チーム+150（歌唱結果に依存しない）。',
    skill: 'SKILL：(3回) TIMEOUT：指定味方にSAFE付与。次の失敗でもチーム+300。',
    ult: 'ULT：(1回) 指定した味方は次のターン成功になる',
  },
  {
    id: 'oracle',
    name: 'ORACLE',
    type: 'TEC',
    sigil: '⟁',
    passive: '自分のターンはお題3択。',
    skill: 'SKILL：(3回) 自分or味方のお題を引き直し（3択で1番目は現在のお題）',
    ult: 'ULT：(1回) 次の相手チーム全員のお題を「ORACLE側が」3択から選んで確定（相手は選べない）',
  },
  {
    id: 'mimic',
    name: 'MIMIC',
    type: 'TEC',
    sigil: '◈',
    passive: '直前の味方成功の獲得点30%を、自分成功時に上乗せ。',
    skill: 'SKILL：(3回) ECHO：直前のスコア変動を50%コピー（成功/失敗問わず）。',
    ult: 'ULT：(1回) STEAL SKILL：敵ロールのSKILLを1回コピーして発動（必要ならターゲット選択あり）',
  },
  {
    id: 'hype',
    name: 'HYPE ENGINE',
    type: 'SUP',
    sigil: '✦',
    passive: '自分のターン開始時、チーム+400（結果に依存しない）。',
    skill: 'SKILL：(3回) 選んだ味方の「次の2ターン成功時 +500」(1回)',
    ult: 'ULT：(1回) 以降3ターン味方全員の成功スコア +500',
  },
  {
    id: 'saboteur',
    name: 'SABOTEUR',
    type: 'TEC',
    sigil: '☒',
    passive: '自分成功で敵チーム-300。',
    skill: 'SKILL：(3回) 敵1人指定：その敵が成功時 +0 / 失敗時 -1000（1回）',
    ult: 'ULT：(1回) 次の敵チーム全員の「次の自分の番」1回分、特殊効果をリセットしパッシブ/スキル/ULTを無効化（味方は対象外）',
  },
  {
    id: 'underdog',
    name: 'UNDERDOG',
    type: 'DEF',
    sigil: '⬟',
    passive: '負けている時、自分のターン開始時に +500。',
    skill: 'SKILL：(3回) 現在の点差の20%を相手から奪う（最大2000）。',
    ult: 'ULT：(1回) 負けているとき：相手-2000まで追いつく／勝っているとき：チーム+2000',
  },
  {
    id: 'gambler',
    name: 'GAMBLER',
    type: 'TEC',
    sigil: '🎲',
    passive: 'PASSIVE：成功時に -500〜1500 の追加ボーナスを抽選（250刻み）。',
    skill: 'SKILL：(3回) 成功×2 / 失敗-2000。スキル使用時パッシブがマイナスなった場合でも0にとどまる。',
    ult: 'ULT：(1回) 表なら +5000 ／ 裏なら -1000。',
  },
];

const roleDef = (id?: RoleId) => ROLE_DEFS.find((r) => r.id === id);

const defaultRoleUses = (_rid?: RoleId) => {
  const skillUses = 3;
  const ultUses = 1;
  return { skillUses, ultUses };
};

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

type ScoreScope = 'PLAYER' | 'TEAM';
type ScoreChange = {
  scope: ScoreScope;
  target: string;
  from: number;
  to: number;
  delta: number;
  reason: string;
};

const fmtChangeLine = (c: ScoreChange) => {
  const arrow = '→';
  return `${c.scope} ${c.target}: ${c.from.toLocaleString()} ${arrow} ${c.to.toLocaleString()} (${fmt(c.delta)}) [${c.reason}]`;
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
// TeamBuff normalize
// =========================
const normalizeTeamBuffs = (tbLike: any) => {
  const A = tbLike?.A && typeof tbLike.A === 'object' ? tbLike.A : {};
  const B = tbLike?.B && typeof tbLike.B === 'object' ? tbLike.B : {};
  return { A: { ...A }, B: { ...B } };
};

// =========================
// Turn Start Auras
// =========================
type AuraPlan = { team: TeamId; delta: number; reason: string };

const planStartAuras = (mems: any[], nextSinger: any, teamScores: { A: number; B: number }, teamBuffs: any) => {
  const plans: AuraPlan[] = [];
  if (!nextSinger?.team) return plans;

  const t: TeamId = nextSinger.team;
  const et: TeamId = t === 'A' ? 'B' : 'A';

  // チーム封印中(SEALED)はチームパッシブ系も無効化
  const sealedTeam = (teamBuffs?.[t]?.sealedTurns ?? 0) > 0;
  const sealedPersonal = !!nextSinger?.debuffs?.sealedOnce;
  if (sealedTeam || sealedPersonal) return plans;

  // coach passive
  if (mems.some((m) => m.team === t && m.role?.id === 'coach')) plans.push({ team: t, delta: 150, reason: 'COACH PASSIVE (+150 at ally turn start)' });
  // hype passive
  if (nextSinger?.role?.id === 'hype') plans.push({ team: t, delta: 400, reason: 'HYPE PASSIVE (+400 at self turn start)' });
  // underdog passive
  if (nextSinger?.role?.id === 'underdog') {
    if ((teamScores[t] ?? 0) < (teamScores[et] ?? 0)) plans.push({ team: t, delta: 500, reason: 'UNDERDOG PASSIVE (+500 when losing at self turn start)' });
  }

  return plans;
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
    | 'coach_timeout'
    | 'coach_ult'
    | 'saboteur_sabotage'
    | 'oracle_reroll'
    | 'hype_boost'
    | 'mimic_steal'
    | 'mimic_stolen_ally'
    | 'mimic_stolen_enemy';
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

// =========================
// Guide Modal
// =========================
const GuideModal = ({
  open,
  onClose,
  members,
  usedRoleIds,
}: {
  open: boolean;
  onClose: () => void;
  members: any[];
  usedRoleIds: Set<RoleId>;
}) => {
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
              const def = rid ? roleDef(rid) : null;
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
// ORACLE ULT pick (ORACLE side chooses enemy themes)
// =========================
type OracleUltPickItem = {
  targetId: string;
  targetName: string;
  team: TeamId;
  choices: ThemeCard[];
};

type OracleUltPickState = null | {
  active: true;
  createdAt: number;
  byId: string;
  byName: string;
  targetTeam: TeamId; // enemy team
  idx: number; // current pick index
  items: OracleUltPickItem[];
};

const OracleUltPickModal = ({
  state,
  busy,
  canControl,
  onClose,
  onPick,
}: {
  state: OracleUltPickState;
  busy: boolean;
  canControl: boolean;
  onClose: () => void;
  onPick: (targetId: string, cand: ThemeCard) => void;
}) => {
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

  // ★同一ターンにSKILL&ULT両方OK（SKILL連続不可 / ULT連続不可）
  const [turnSkillUsed, setTurnSkillUsed] = useState(false);
  const [turnUltUsed, setTurnUltUsed] = useState(false);

  // ORACLE ULT pick state (room)
  const [oracleUltPick, setOracleUltPick] = useState<OracleUltPickState>(null);

  // UI
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

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

  // Mimic steal flow (client-side)
  const [mimicStolenRoleId, setMimicStolenRoleId] = useState<RoleId | null>(null);

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
      setTeamBuffs(normalizeTeamBuffs(data.teamBuffs || { A: {}, B: {} }));

      setLogs(data.logs || []);
      setLogEntries(Array.isArray(data.logEntries) ? data.logEntries : []);

      // ORACLE ULT pick
      setOracleUltPick((data.oracleUltPick as OracleUltPickState) || null);

      // backward compat: old boolean exists
      const compat = !!data.turnAbilityUsed;
      setTurnSkillUsed(data.turnSkillUsed ?? compat);
      setTurnUltUsed(data.turnUltUsed ?? false);

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
  // Init (host)
  // =========================
  useEffect(() => {
    if (!roomId || !roomData || !isHost) return;
    if (roomData.status !== 'playing' || roomData.mode !== 'team') return;

    const mems = (roomData.members || []).slice();

    const hasMissingTurnOrder = mems.some((m: any) => m.turnOrder === undefined || m.turnOrder === null);
    const hasReadyMissingChallenge = mems.some((m: any) => isReadyForTurn(m) && !m.challenge && !(m.candidates && m.candidates.length > 0));
    const hasMissingRoleUses = mems.some((m: any) => !!m.role?.id && (m.role.skillUses === undefined || m.role.skillUses === null || m.role.ultUses === undefined || m.role.ultUses === null));
    const hasMissingTeamBuffKeys = !roomData.teamBuffs || !roomData.teamBuffs.A || !roomData.teamBuffs.B;

    const sorted = mems.slice().sort(sortByTurn);
    const idxMember = sorted[roomData.currentTurnIndex ?? 0];
    const currentIdxBad = idxMember && !isReadyForTurn(idxMember);

    const needsInit =
      !roomData.teamScores ||
      hasMissingTurnOrder ||
      hasReadyMissingChallenge ||
      currentIdxBad ||
      hasMissingRoleUses ||
      hasMissingTeamBuffKeys ||
      roomData.turnSkillUsed === undefined ||
      roomData.turnUltUsed === undefined;

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

        let changed = false;

        let mems = (data.members || []).slice().sort(sortByTurn);

        mems = mems.map((m: any) => {
          const rid: RoleId | undefined = m.role?.id;
          const defUses = defaultRoleUses(rid);
          const prevSkill = m.role?.skillUses;
          const prevUlt = m.role?.ultUses;

          if (m.role && (prevSkill === undefined || prevSkill === null || prevUlt === undefined || prevUlt === null)) changed = true;

          const role = m.role
            ? {
                ...m.role,
                skillUses: prevSkill ?? defUses.skillUses,
                ultUses: prevUlt ?? defUses.ultUses,
              }
            : null;

          return {
            ...m,
            score: m.score ?? 0,
            combo: m.combo ?? 0,
            buffs: m.buffs ?? {},
            debuffs: m.debuffs ?? {},
            candidates: Array.isArray(m.candidates) ? m.candidates : null,
            challenge: m.challenge ?? null,
            role,
          };
        });

        let maxOrder = mems.reduce((mx: number, m: any) => (typeof m.turnOrder === 'number' ? Math.max(mx, m.turnOrder) : mx), -1);
        mems = mems.map((m: any) => {
          if (m.turnOrder === undefined || m.turnOrder === null) {
            maxOrder += 1;
            changed = true;
            return { ...m, turnOrder: maxOrder };
          }
          return m;
        });

        const pool = normalizeThemePool(data.themePool);
        let deck: ThemeCard[] = Array.isArray(data.deck) && data.deck.length > 0 ? data.deck : shuffle(pool);

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
        const tb = normalizeTeamBuffs(data.teamBuffs || { A: {}, B: {} });

        const updates: any = {
          members: mems,
          themePool: pool,
          deck,
          teamScores: ts,
          teamBuffs: tb,
          turnSkillUsed: data.turnSkillUsed ?? !!data.turnAbilityUsed ?? false,
          turnUltUsed: data.turnUltUsed ?? false,
          logEntries: Array.isArray(data.logEntries) ? data.logEntries : [],
        };

        if (changed) {
          updates.currentTurnIndex = idx;
          updates.logs = capLogs([...(data.logs || []), 'INIT FIX: patched missing fields']);
          const e: LogEntry = {
            ts: Date.now(),
            kind: 'SYSTEM',
            title: 'INIT FIX',
            lines: ['patched missing fields (turnOrder/mission/uses/teamBuffs/etc)'],
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

  const canOperateAbility =
    currentSinger?.id === userId || (isHost && (isGuestTurn || (currentSinger && offlineUsers.has(currentSinger.id))));

  // team-sealed (legacy/team seal)
  const sealedTeamThisTurnClient = useMemo(() => {
    const t = currentSinger?.team as TeamId | undefined;
    if (!t) return false;
    const tb = normalizeTeamBuffs(teamBuffs);
    return (tb?.[t]?.sealedTurns ?? 0) > 0;
  }, [teamBuffs, currentSinger?.team]);

  // personal seal (saboteur ult)
  const sealedPersonalThisTurnClient = !!currentSinger?.debuffs?.sealedOnce;

  // unified sealed for buttons
  const sealedThisTurnClient = sealedTeamThisTurnClient || sealedPersonalThisTurnClient;

  // ★ IMPORTANT: DBにultUsesが無い(古いデータ)でも、UI側はデフォルト値でボタンを押せるようにする
  const currentRoleId = (currentSinger?.role?.id as RoleId | undefined) || undefined;
  const defaultsForCurrent = defaultRoleUses(currentRoleId);
  const skillUsesLeft = currentSinger?.role ? (currentSinger.role.skillUses ?? defaultsForCurrent.skillUses) : 0;
  const ultUsesLeft = currentSinger?.role ? (currentSinger.role.ultUses ?? defaultsForCurrent.ultUses) : 0;

  const canUseSkill =
    !!currentSinger &&
    !!currentSinger.role &&
    canOperateAbility &&
    !turnSkillUsed &&
    skillUsesLeft > 0 &&
    !sealedThisTurnClient;

  const canUseUlt =
    !!currentSinger &&
    !!currentSinger.role &&
    canOperateAbility &&
    !turnUltUsed &&
    ultUsesLeft > 0 &&
    !sealedThisTurnClient;

  // candidates selection UI
  const isHostOverrideSelecting = isHost && currentSinger?.candidates?.length > 0 && currentSinger?.id !== userId;
  const displayCandidates: ThemeCard[] | null = isHostOverrideSelecting ? currentSinger.candidates : myMember?.candidates || null;
  const selectionOwner = isHostOverrideSelecting ? currentSinger : myMember;
  const isSelectingMission = !!displayCandidates && displayCandidates.length > 0;

  // ORACLE ULT pick blocks game flow until resolved
  const isOraclePickingActive = !!oracleUltPick?.active;
  const isCurrentSingerLocked = (!!currentSinger?.candidates && currentSinger.candidates.length > 0) || isOraclePickingActive;

  const currentChallenge = currentSinger?.challenge || { title: 'お題準備中...', criteria: '...' };

  // ===== Effects chips =====
  const activeEffects = useMemo(() => {
    const chips: string[] = [];
    const tbAll = normalizeTeamBuffs(teamBuffs);

    const addTeam = (t: TeamId) => {
      const tb = tbAll?.[t] || {};
      if ((tb.nextSuccessBonus ?? 0) > 0) chips.push(`TEAM ${t} NEXT +${tb.nextSuccessBonus}`);
      if ((tb.hypeUltTurns ?? 0) > 0) chips.push(`TEAM ${t} HYPE +500 (${tb.hypeUltTurns}T)`);
      if ((tb.sealedTurns ?? 0) > 0) chips.push(`TEAM ${t} SEALED (NEXT TEAM TURN)`);
      if ((tb.negHalfTurns ?? 0) > 0) chips.push(`TEAM ${t} NEG -50% (NEXT TEAM TURN)`);
      if ((tb.negZeroTurns ?? 0) > 0) chips.push(`TEAM ${t} NEG 0 (NEXT TEAM TURN)`);
    };

    addTeam('A');
    addTeam('B');

    if (currentSinger?.debuffs?.sealedOnce) chips.push('SEALED (PERSONAL)');

    if (currentSinger?.role?.id === 'maestro' && (currentSinger.combo ?? 0) > 0) chips.push(`COMBO x${currentSinger.combo}`);

    if (turnSkillUsed) chips.push('SKILL USED');
    if (turnUltUsed) chips.push('ULT USED');

    const b = currentSinger?.buffs || {};
    const d = currentSinger?.debuffs || {};
    if (b.maestroSkill) chips.push('MAESTRO SKILL ARMED');
    if (b.encore) chips.push('SHOWMAN SKILL ARMED');
    if (b.doubleDown) chips.push('DOUBLE DOWN');
    if (b.gamblerUlt) chips.push('GAMBLER ULT ARMED');
    if (b.spotlight) chips.push('SHOWMAN ULT ARMED');
    if (b.safe) chips.push('SAFE');
    if (b.echo) chips.push('ECHO');
    if (b.hypeBoost?.turns) chips.push(`HYPE +500 (${b.hypeBoost.turns}T)`);
    if (b.forcedSuccess) chips.push('FORCED SUCCESS');
    if (d.sabotaged) chips.push('SABOTAGED');

    if (oracleUltPick?.active) chips.push('ORACLE PICKING (ULT)');

    return chips;
  }, [teamBuffs, currentSinger, turnSkillUsed, turnUltUsed, oracleUltPick]);

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
  // ORACLE ULT pick confirm/apply
  // =========================
  const canControlOraclePick = useMemo(() => {
    if (!oracleUltPick?.active) return false;
    if (isHost) return true;
    return oracleUltPick.byId === userId;
  }, [oracleUltPick, userId, isHost]);

  const requestPickOracleUltTheme = (targetId: string, cand: ThemeCard) => {
    const item = oracleUltPick?.items?.find((x) => x.targetId === targetId);
    const targetName = item?.targetName || 'ENEMY';

    setConfirmState({
      title: 'CONFIRM ORACLE ULT',
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{targetName}</span> のお題をこれに確定しますか？
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
        await pickOracleUltThemeTx(targetId, cand);
      },
    });
  };

  const pickOracleUltThemeTx = async (targetId: string, cand: ThemeCard) => {
    if (!roomId) return;
    if (!oracleUltPick?.active) return;

    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const data: any = snap.data();
        const state: OracleUltPickState = data.oracleUltPick || null;
        if (!state?.active) return;

        const controllerOk = isHost || state.byId === userId;
        if (!controllerOk) return;

        const item = state.items?.[state.idx];
        if (!item) return;
        if (item.targetId !== targetId) return;

        const ok = (item.choices || []).some((x) => cardTitle(x) === cardTitle(cand) && cardCriteria(x) === cardCriteria(cand));
        if (!ok) return;

        const mems = (data.members || []).slice().sort(sortByTurn);
        const mIdx = mems.findIndex((m: any) => m.id === targetId);
        if (mIdx === -1) return;

        const target = { ...mems[mIdx] };
        target.challenge = cand;
        target.candidates = null; // 念のため
        mems[mIdx] = target;

        const nextIdx = state.idx + 1;
        const done = nextIdx >= (state.items?.length ?? 0);

        const entry: LogEntry = {
          ts: Date.now(),
          kind: 'ULT',
          actorName: state.byName,
          actorId: state.byId,
          team: target.team,
          title: 'ORACLE ULT PICK',
          lines: [
            `TARGET: ${target.name} (TEAM ${target.team})`,
            `THEME: ${cardTitle(cand)}`,
            `COND: ${cardCriteria(cand)}`,
            `PROGRESS: ${state.idx + 1}/${state.items.length}`,
          ],
        };

        const newEntries = capEntries([...(Array.isArray(data.logEntries) ? data.logEntries : []), entry]);
        const newLogs = capLogs([...(data.logs || []), `ORACLE ULT PICK: ${target.name} -> ${cardTitle(cand)}`]);

        tx.update(ref, {
          members: mems,
          logEntries: newEntries,
          logs: newLogs,
          oracleUltPick: done ? null : { ...state, idx: nextIdx },
        });
      });
    } finally {
      setBusy(false);
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

        const used = new Set<RoleId>();
        for (const m of mems) {
          if (m.id === userId) continue;
          if (!isReadyForTurn(m)) continue;
          const rid = m.role?.id as RoleId | undefined;
          if (rid) used.add(rid);
        }
        if (used.has(def.id)) throw new Error('RoleAlreadyUsed');

        const updated = { ...(mems[idx] || {}) };
        const uses = defaultRoleUses(def.id);
        updated.role = { id: def.id, name: def.name, skillUses: uses.skillUses, ultUses: uses.ultUses };
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
          lines: [`ROLE: ${def.name}`, `SKILL USES: ${uses.skillUses}`, `ULT USES: ${uses.ultUses}`],
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
    if (oracleUltPick?.active) return; // ORACLE pick中はロック

    const rid: RoleId = currentSinger.role.id;

    // target skills
    if (rid === 'coach') return setTargetModal({ title: 'COACH SKILL: 味方を選択', mode: 'ally', action: 'coach_timeout' });
    if (rid === 'saboteur') return setTargetModal({ title: 'SABOTEUR SKILL: 敵を選択', mode: 'enemy', action: 'saboteur_sabotage' });
    if (rid === 'oracle') return setTargetModal({ title: 'ORACLE SKILL: 自分/味方を選択', mode: 'ally', action: 'oracle_reroll' });
    if (rid === 'hype') return setTargetModal({ title: 'HYPE SKILL: 味方を選択', mode: 'ally', action: 'hype_boost' });

    const def = roleDef(rid);
    setConfirmState({
      title: 'CONFIRM SKILL',
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{def?.name || 'ROLE'}</span> の <span className="font-black text-cyan-300">SKILL</span> を発動しますか？
          </div>
          <div className="text-[12px] text-white/70 leading-relaxed">{def?.skill}</div>
          <div className="text-[10px] font-mono tracking-widest text-white/40">USES LEFT: {skillUsesLeft}</div>
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
    if (oracleUltPick?.active) return; // ORACLE pick中はロック

    const rid: RoleId = currentSinger.role.id;

    if (rid === 'mimic') return setTargetModal({ title: 'MIMIC ULT: 敵ロールを選択', mode: 'enemy', action: 'mimic_steal' });
    if (rid === 'coach') return setTargetModal({ title: 'COACH ULT: 味方を選択', mode: 'ally', action: 'coach_ult' });

    const def = roleDef(rid);
    setConfirmState({
      title: 'CONFIRM ULT',
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{def?.name || 'ROLE'}</span> の <span className="font-black text-yellow-300">ULT</span> を発動しますか？
          </div>
          <div className="text-[12px] text-white/70 leading-relaxed">{def?.ult}</div>
          <div className="text-[10px] font-mono tracking-widest text-white/40">USES LEFT: {ultUsesLeft}</div>
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

    const isMimicSecond = action === 'mimic_stolen_ally' || action === 'mimic_stolen_enemy';
    const effectiveRoleName = isMimicSecond ? `MIMIC (stolen ${mimicStolenRoleId || '—'})` : roleDef(rid)?.name || 'ROLE';

    const kind = action === 'coach_ult' || action.startsWith('mimic_') ? 'ult' : 'skill';
    const title = kind === 'ult' ? 'CONFIRM ULT TARGET' : 'CONFIRM SKILL TARGET';

    const actionText =
      action === 'coach_timeout'
        ? 'TIMEOUT'
        : action === 'coach_ult'
        ? 'FORCE SUCCESS'
        : action === 'saboteur_sabotage'
        ? 'SABOTAGE'
        : action === 'oracle_reroll'
        ? 'REROLL'
        : action === 'hype_boost'
        ? 'HYPE BOOST'
        : action === 'mimic_steal'
        ? 'STEAL SKILL'
        : action === 'mimic_stolen_ally'
        ? 'STOLEN SKILL'
        : 'STOLEN SKILL';

    setConfirmState({
      title,
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{effectiveRoleName}</span> の <span className="font-black">{actionText}</span> を
            <span className="font-black text-cyan-200"> {target.name}</span> に使いますか？
          </div>
          <div className="p-3 rounded-xl border border-white/10 bg-black/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">{target.avatar}</div>
              <div className="min-w-0">
                <div className="font-black truncate text-white">{target.name}</div>
                <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">
                  TEAM {target.team} ・ ROLE {target.role?.name || '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      confirmText: 'ACTIVATE',
      onConfirm: async () => {
        setConfirmState(null);

        // mimic first step: choose enemy role -> then decide if target selection needed
        if (action === 'mimic_steal') {
          const stolen: RoleId | undefined = target?.role?.id;
          if (!stolen) return;

          setMimicStolenRoleId(stolen);

          // need 2nd selection?
          if (stolen === 'coach' || stolen === 'oracle' || stolen === 'hype') {
            setTargetModal({ title: `MIMIC: STOLEN ${stolen.toUpperCase()} SKILL / 味方を選択`, mode: 'ally', action: 'mimic_stolen_ally' });
            return;
          }
          if (stolen === 'saboteur') {
            setTargetModal({ title: `MIMIC: STOLEN SABOTEUR SKILL / 敵を選択`, mode: 'enemy', action: 'mimic_stolen_enemy' });
            return;
          }

          // no more selection -> activate directly
          await applyAbility({ kind: 'ult', stolenRoleId: stolen });
          setMimicStolenRoleId(null);
          return;
        }

        // mimic second step
        if (action === 'mimic_stolen_ally' || action === 'mimic_stolen_enemy') {
          const stolen = mimicStolenRoleId;
          if (!stolen) return;
          await applyAbility({ kind: 'ult', stolenRoleId: stolen, targetId });
          setMimicStolenRoleId(null);
          return;
        }

        // normal
        await applyAbility({ kind: kind as any, targetId });
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

        // ORACLE pickが既に動いている間は新規発動不可（事故防止）
        if (data.oracleUltPick?.active) return;

        const teamBuffsTx = normalizeTeamBuffs(data.teamBuffs || { A: {}, B: {} });

        const mems = (data.members || [])
          .map((m: any) => {
            const rid: RoleId | undefined = m.role?.id;
            const uses = defaultRoleUses(rid);
            const role = m.role
              ? {
                  ...m.role,
                  skillUses: m.role.skillUses ?? uses.skillUses,
                  ultUses: m.role.ultUses ?? uses.ultUses,
                }
              : null;

            return {
              ...m,
              score: m.score ?? 0,
              combo: m.combo ?? 0,
              buffs: m.buffs ?? {},
              debuffs: m.debuffs ?? {},
              role,
              candidates: Array.isArray(m.candidates) ? m.candidates : null,
              challenge: m.challenge ?? null,
            };
          })
          .slice()
          .sort(sortByTurn);

        let idx = data.currentTurnIndex ?? 0;
        if (idx >= mems.length) idx = 0;
        if (mems.length > 0 && !isReadyForTurn(mems[idx])) idx = findFirstReadyIndex(mems);

        const singer = mems[idx];
        if (!singer) return;
        if (!(singer.team === 'A' || singer.team === 'B')) return; // safety
        const t: TeamId = singer.team;
        const et: TeamId = t === 'A' ? 'B' : 'A';

        const canOperate =
          singer.id === userId || (isHost && (String(singer.id).startsWith('guest_') || offlineUsers.has(singer.id)));
        if (!canOperate) return;

        // SEALED (team / personal): ability disabled
        if ((teamBuffsTx?.[t]?.sealedTurns ?? 0) > 0) return;
        if (singer.debuffs?.sealedOnce) return;

        // skill/ult turn lock
        const compat = !!data.turnAbilityUsed;
        const turnSkillUsedTx = data.turnSkillUsed ?? compat;
        const turnUltUsedTx = data.turnUltUsed ?? false;

        const kind = opts.kind;
        if (kind === 'skill' && turnSkillUsedTx) return;
        if (kind === 'ult' && turnUltUsedTx) return;

        const r: RoleId | undefined = singer.role?.id;
        if (!r) return;

        // theme deck helpers
        const pool = normalizeThemePool(data.themePool);
        let deck: ThemeCard[] = Array.isArray(data.deck) && data.deck.length > 0 ? data.deck : shuffle(pool);
        let deckChanged = false;

        // helper: reroll 3-choice with first fixed
        const rerollThreeChoicesKeepFirst = (target: any, deckIn: ThemeCard[], poolIn: ThemeCard[]) => {
          const current = target.challenge ?? { title: 'FREE THEME', criteria: '—' };
          const d2 = drawFromDeck<ThemeCard>(deckIn, poolIn, 2);
          const extra = d2.choices || [];
          const choices: ThemeCard[] = [current, extra[0] ?? { title: 'FREE THEME', criteria: '—' }, extra[1] ?? { title: 'FREE THEME', criteria: '—' }];
          return { nextDeck: d2.nextDeck, choices, current };
        };

        // score helpers (detailed)
        const scoreChanges: ScoreChange[] = [];
        let teamScoresTx: { A: number; B: number } = data.teamScores || computeTeamScores(mems);
        if (teamScoresTx.A === undefined) teamScoresTx.A = 0;
        if (teamScoresTx.B === undefined) teamScoresTx.B = 0;

        const recordTeam = (team: TeamId, delta: number, reason: string) => {
          if (!delta) return;
          const from = teamScoresTx[team] ?? 0;
          const to = from + delta;
          teamScoresTx = { ...teamScoresTx, [team]: to };
          scoreChanges.push({ scope: 'TEAM', target: `TEAM ${team}`, from, to, delta, reason });
        };

        const pushLines: string[] = [];
        const entries: LogEntry[] = Array.isArray(data.logEntries) ? data.logEntries : [];

        // consume uses
        if (kind === 'skill') {
          if ((singer.role.skillUses ?? 0) <= 0) return;
          singer.role.skillUses -= 1;
        } else {
          if ((singer.role.ultUses ?? 0) <= 0) return;
          singer.role.ultUses -= 1;
        }

        // ---- NORMAL SKILL/ULT ----
        if (kind === 'skill' && r !== 'mimic') {
          if (r === 'maestro') {
            singer.buffs.maestroSkill = true;
            pushLines.push(`SKILL MAESTRO: armed (success COMBO+2 / fail -500)`);
          } else if (r === 'showman') {
            singer.buffs.encore = true;
            pushLines.push(`SKILL SHOWMAN: armed (+500 on success)`);
          } else if (r === 'gambler') {
            singer.buffs.doubleDown = true;
            singer.buffs.gamblerSkillClampPassive = true;
            pushLines.push(`SKILL GAMBLER: DOUBLE DOWN armed (success x2 / fail -2000) + passive clamp`);
          } else if (r === 'underdog') {
            const diff = Math.abs((teamScoresTx.A ?? 0) - (teamScoresTx.B ?? 0));
            const steal = clamp(Math.round(diff * 0.2), 0, 2000);
            recordTeam(t, +steal, `UNDERDOG SKILL (steal 20% up to 2000)`);
            recordTeam(et, -steal, `UNDERDOG SKILL (stolen by TEAM ${t})`);
            pushLines.push(`SKILL UNDERDOG: steal ${steal} from TEAM ${et}`);
          } else if (r === 'hype') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.hypeBoost = { value: 500, turns: 2, by: singer.id };
            pushLines.push(`SKILL HYPE: ${target.name} next 2 turns (success +500)`);
          } else if (r === 'mimic') {
            singer.buffs.echo = true;
            pushLines.push(`SKILL MIMIC: ECHO armed (copy 50% last turn delta)`);
          } else if (r === 'ironwall') {
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), negHalfTurns: 1, negZeroTurns: 0 };
            pushLines.push(`SKILL IRONWALL: next TEAM ${t} turn negative -50%`);
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
            target.debuffs.sabotaged = { by: singer.id, fail: -1000 };
            pushLines.push(`SKILL SABOTEUR: sabotaged -> ${target.name} (success +0 / fail -1000)`);
          } else if (r === 'oracle') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const targetIdx = mems.findIndex((m: any) => m.id === targetId);
            if (targetIdx === -1) return;

            const target = { ...mems[targetIdx] };
            if (target.team !== t) return;

            const res = rerollThreeChoicesKeepFirst(target, deck, pool);
            deck = res.nextDeck;
            deckChanged = true;

            target.candidates = res.choices;
            target.challenge = res.current;

            mems[targetIdx] = target;
            pushLines.push(`SKILL ORACLE: REROLL -> ${target.name} (opt1=current)`);
          }
        }

        if (kind === 'ult' && r !== 'mimic') {
          if (r === 'maestro') {
            const combo = singer.combo ?? 0;
            const gain = combo * 800;
            recordTeam(t, gain, `MAESTRO ULT (FINALE: combo x800)`);
            singer.combo = 0;
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), nextSuccessBonus: (teamBuffsTx[t]?.nextSuccessBonus ?? 0) + 500 };
            pushLines.push(`ULT MAESTRO: FINALE team +${gain}, next success +500`);
          } else if (r === 'showman') {
            singer.buffs.spotlight = true;
            pushLines.push(`ULT SHOWMAN: armed (success enemy -2000)`);
          } else if (r === 'ironwall') {
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), negZeroTurns: 1, negHalfTurns: 0 };
            pushLines.push(`ULT IRONWALL: next TEAM ${t} turn negative -> 0`);
          } else if (r === 'coach') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.forcedSuccess = { by: singer.id };
            pushLines.push(`ULT COACH: ${target.name} next turn FORCED SUCCESS`);
          } else if (r === 'hype') {
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), hypeUltTurns: 3 };
            pushLines.push(`ULT HYPE: allies success +500 for 3 turns`);
          } else if (r === 'saboteur') {
            // ✅ FIX: 次の敵1人ではなく「敵全員の次の自分の番」1回分 SEALED
            // - 敵チームの特殊効果をリセット（チームバフ）
            // - 敵メンバー全員の buffs/debuffs をリセットし、debuffs.sealedOnce を付与（1回分）
            teamBuffsTx[et] = {
              ...(teamBuffsTx[et] || {}),
              lastTeamDelta: 0,
              nextSuccessBonus: 0,
              hypeUltTurns: 0,
              negHalfTurns: 0,
              negZeroTurns: 0,
              sealedTurns: 0, // チーム封印は使わない（個人封印で全員に適用）
            };

            const affected: string[] = [];
            for (let i = 0; i < mems.length; i++) {
              if (mems[i]?.team === et) {
                const name = mems[i]?.name;
                mems[i] = {
                  ...mems[i],
                  buffs: {},
                  debuffs: { sealedOnce: { by: singer.id, ts: Date.now() } }, // 次の自分のターン1回分
                };
                if (name) affected.push(name);
              }
            }

            pushLines.push(`ULT SABOTEUR: TEAM ${et} effects RESET`);
            pushLines.push(`ULT SABOTEUR: SEALED (PERSONAL) applied to ALL enemies for their next personal turn`);
            if (affected.length) pushLines.push(`AFFECTED: ${affected.join(', ')}`);
          } else if (r === 'underdog') {
            const my = teamScoresTx[t] ?? 0;
            const opp = teamScoresTx[et] ?? 0;

            if (my < opp) {
              const targetScore = opp - 2000;
              const delta = Math.max(0, targetScore - my);
              if (delta > 0) recordTeam(t, delta, 'UNDERDOG ULT (catch up to opp-2000)');
              pushLines.push(`ULT UNDERDOG: catch up (to opponent -2000) => +${delta}`);
            } else {
              recordTeam(t, 2000, 'UNDERDOG ULT (winning: +2000)');
              pushLines.push(`ULT UNDERDOG: winning => team +2000`);
            }
          } else if (r === 'gambler') {
            singer.buffs.gamblerUlt = true;
            pushLines.push(`ULT GAMBLER: coinflip armed (+5000 / -1000)`);
          } else if (r === 'oracle') {
            // ✅ FIX: 敵に3択を渡すのはNG -> ORACLE側が敵全員分「自分で選択して確定」する
            const enemyReady = mems.filter((m: any) => isReadyForTurn(m) && m.team === et);
            const items: OracleUltPickItem[] = [];

            for (const em of enemyReady) {
              const cur = em.challenge ?? { title: 'FREE THEME', criteria: '—' };
              const d2 = drawFromDeck<ThemeCard>(deck, pool, 2);
              deck = d2.nextDeck;
              deckChanged = true;

              const extra = d2.choices || [];
              const choices: ThemeCard[] = [cur, extra[0] ?? { title: 'FREE THEME', criteria: '—' }, extra[1] ?? { title: 'FREE THEME', criteria: '—' }];
              items.push({ targetId: em.id, targetName: em.name, team: em.team, choices });
            }

            if (items.length === 0) {
              pushLines.push(`ULT ORACLE: no enemy targets`);
            } else {
              pushLines.push(`ULT ORACLE: choose themes for ALL enemies (enemy cannot choose)`);
              pushLines.push(`TARGETS: ${items.map((x) => x.targetName).join(', ')}`);
            }

            // room state: oracleUltPick
            const oraclePickState: OracleUltPickState =
              items.length > 0
                ? {
                    active: true,
                    createdAt: Date.now(),
                    byId: singer.id,
                    byName: singer.name,
                    targetTeam: et,
                    idx: 0,
                    items,
                  }
                : null;
            // set into update later
            (data as any).__oraclePickState = oraclePickState;
          }
        }

        // ---- MIMIC ULT (STEAL SKILL) ----
        if (kind === 'ult' && r === 'mimic') {
          const stolen = opts.stolenRoleId;
          if (!stolen) return;

          // Apply stolen SKILL effect once
          if (stolen === 'coach') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.safe = true;
            pushLines.push(`MIMIC ULT: stole COACH SKILL -> SAFE to ${target.name}`);
          } else if (stolen === 'oracle') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const targetIdx = mems.findIndex((m: any) => m.id === targetId);
            if (targetIdx === -1) return;
            const target = { ...mems[targetIdx] };
            if (target.team !== t) return;

            const current = target.challenge ?? { title: 'FREE THEME', criteria: '—' };
            const d2 = drawFromDeck<ThemeCard>(deck, pool, 2);
            deck = d2.nextDeck;
            deckChanged = true;
            const extra = d2.choices || [];
            const choices: ThemeCard[] = [current, extra[0] ?? { title: 'FREE THEME', criteria: '—' }, extra[1] ?? { title: 'FREE THEME', criteria: '—' }];

            target.candidates = choices;
            target.challenge = current;
            mems[targetIdx] = target;

            pushLines.push(`MIMIC ULT: stole ORACLE SKILL -> REROLL for ${target.name} (opt1=current)`);
          } else if (stolen === 'hype') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.hypeBoost = { value: 500, turns: 2, by: singer.id, stolen: true };
            pushLines.push(`MIMIC ULT: stole HYPE SKILL -> ${target.name} next 2 turns (success +500)`);
          } else if (stolen === 'saboteur') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== et) return;
            target.debuffs.sabotaged = { by: singer.id, fail: -1000, stolen: true };
            pushLines.push(`MIMIC ULT: stole SABOTEUR SKILL -> sabotage ${target.name} (success +0 / fail -1000)`);
          } else if (stolen === 'ironwall') {
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), negHalfTurns: 1, negZeroTurns: 0 };
            pushLines.push(`MIMIC ULT: stole IRONWALL SKILL -> next TEAM ${t} turn negative -50%`);
          } else if (stolen === 'showman') {
            singer.buffs.encore = true;
            pushLines.push(`MIMIC ULT: stole SHOWMAN SKILL -> +500 on success (this turn)`);
          } else if (stolen === 'maestro') {
            singer.buffs.maestroSkill = true;
            pushLines.push(`MIMIC ULT: stole MAESTRO SKILL -> (success COMBO+2 / fail -500)`);
          } else if (stolen === 'gambler') {
            singer.buffs.doubleDown = true;
            singer.buffs.gamblerSkillClampPassive = true;
            pushLines.push(`MIMIC ULT: stole GAMBLER SKILL -> DOUBLE DOWN armed + passive clamp`);
          } else if (stolen === 'underdog') {
            const diff = Math.abs((teamScoresTx.A ?? 0) - (teamScoresTx.B ?? 0));
            const steal = clamp(Math.round(diff * 0.2), 0, 2000);
            recordTeam(t, +steal, `MIMIC(stolen UNDERDOG SKILL) steal 20% up to 2000`);
            recordTeam(et, -steal, `MIMIC(stolen UNDERDOG SKILL) stolen by TEAM ${t}`);
            pushLines.push(`MIMIC ULT: stole UNDERDOG SKILL -> steal ${steal} from TEAM ${et}`);
          } else {
            pushLines.push(`MIMIC ULT: stole ${stolen} (no-op)`);
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

        const changeLines = scoreChanges.map(fmtChangeLine);

        const entry: LogEntry = {
          ts: Date.now(),
          kind: kind === 'ult' ? 'ULT' : 'SKILL',
          actorName: singer.name,
          actorId: singer.id,
          team: singer.team,
          title: `${kind === 'ult' ? 'ULT' : 'SKILL'} ACTIVATED`,
          lines: [
            `ROLE: ${singer.role?.name || 'ROLE'}`,
            ...pushLines.map((x) => `NOTE ${x}`),
            ...(changeLines.length ? ['— SCORE CHANGES —', ...changeLines] : []),
          ],
        };

        const newLogs = capLogs([...(data.logs || []), ...pushLines.map((x) => `ABILITY: ${x}`)]);
        const newEntries = capEntries([...(entries || []), entry]);

        const updateObj: any = {
          members: mems,
          teamBuffs: teamBuffsTx,
          teamScores: teamScoresTx,
          turnSkillUsed: kind === 'skill' ? true : (data.turnSkillUsed ?? !!data.turnAbilityUsed ?? false),
          turnUltUsed: kind === 'ult' ? true : (data.turnUltUsed ?? false),
          abilityFx: fx,
          logs: newLogs,
          logEntries: newEntries,
        };

        // ORACLE ULT pick state attach
        if ((data as any).__oraclePickState !== undefined) {
          updateObj.oracleUltPick = (data as any).__oraclePickState;
        }

        if (deckChanged) updateObj.deck = deck;

        tx.update(ref, updateObj);
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

        // ORACLE pick中はターン進行禁止
        if (data.oracleUltPick?.active) return;

        const teamBuffsTx = normalizeTeamBuffs(data.teamBuffs || { A: {}, B: {} });

        let mems = (data.members || [])
          .map((m: any) => {
            const rid: RoleId | undefined = m.role?.id;
            const uses = defaultRoleUses(rid);
            const role = m.role
              ? {
                  ...m.role,
                  skillUses: m.role.skillUses ?? uses.skillUses,
                  ultUses: m.role.ultUses ?? uses.ultUses,
                }
              : null;

            return {
              ...m,
              score: m.score ?? 0,
              combo: m.combo ?? 0,
              buffs: m.buffs ?? {},
              debuffs: m.debuffs ?? {},
              role,
              candidates: Array.isArray(m.candidates) ? m.candidates : null,
              challenge: m.challenge ?? null,
            };
          })
          .slice()
          .sort(sortByTurn);

        let idx = data.currentTurnIndex ?? 0;
        if (idx >= mems.length) idx = 0;
        if (mems.length > 0 && !isReadyForTurn(mems[idx])) idx = findFirstReadyIndex(mems);

        const singer = mems[idx];
        if (!singer) return;
        if (!(singer.team === 'A' || singer.team === 'B')) return;
        const t: TeamId = singer.team;
        const et: TeamId = t === 'A' ? 'B' : 'A';

        let teamScoresTx: { A: number; B: number } = data.teamScores || computeTeamScores(mems);
        if (teamScoresTx.A === undefined) teamScoresTx.A = 0;
        if (teamScoresTx.B === undefined) teamScoresTx.B = 0;

        const teamScoresBefore: { A: number; B: number } = { A: teamScoresTx.A ?? 0, B: teamScoresTx.B ?? 0 };

        const serial = data.turnSerial ?? 0;

        // Seal check (disable passive/skill/ult effects this turn)
        const sealedTeamThisTurn = (teamBuffsTx?.[t]?.sealedTurns ?? 0) > 0;
        const sealedPersonalThisTurn = !!singer.debuffs?.sealedOnce;
        const sealedThisTurn = sealedTeamThisTurn || sealedPersonalThisTurn;

        // Neg mitigation check for this team turn (from IRONWALL SKILL/ULT)
        const negZeroActive = (teamBuffsTx?.[t]?.negZeroTurns ?? 0) > 0;
        const negHalfActive = !negZeroActive && (teamBuffsTx?.[t]?.negHalfTurns ?? 0) > 0;

        const changes: ScoreChange[] = [];
        const notes: string[] = [];

        const hasIronwallPassive = (team: TeamId) => mems.some((m: any) => m.team === team && m.role?.id === 'ironwall');

        const mitigateNegative = (team: TeamId, delta: number, reason: string) => {
          if (delta >= 0) return delta;

          let d = delta;

          // ironwall skill/ult mitigation (active only on that team's turn)
          if (team === t) {
            if (negZeroActive) {
              notes.push(`NOTE TEAM ${team}: IRONWALL ULT -> negative blocked (${fmt(d)}) [${reason}]`);
              d = 0;
            } else if (negHalfActive) {
              const reduced = Math.round(d * 0.5);
              notes.push(`NOTE TEAM ${team}: IRONWALL SKILL -> -50% (${fmt(d)} -> ${fmt(reduced)}) [${reason}]`);
              d = reduced;
            }
          }

          // ironwall passive (disabled while sealed)
          if (!sealedThisTurn && hasIronwallPassive(team) && d < 0) {
            const reduced = Math.round(d * 0.7);
            notes.push(`NOTE TEAM ${team}: IRONWALL PASSIVE reduced (${fmt(d)} -> ${fmt(reduced)}) [${reason}]`);
            d = reduced;
          }

          return d;
        };

        let singerTurnDelta = 0;

        const applySingerDelta = (delta: number, reason: string) => {
          if (delta === 0) return;

          // mitigate negative on singer turn (team turn only)
          let d = delta;
          if (d < 0) d = mitigateNegative(t, d, reason);

          if (d === 0) return;

          const fromP = singer.score ?? 0;
          const toP = fromP + d;
          singer.score = toP;
          singerTurnDelta += d;
          changes.push({ scope: 'PLAYER', target: singer.name, from: fromP, to: toP, delta: d, reason });

          const fromT = teamScoresTx[t] ?? 0;
          const toT = fromT + d;
          teamScoresTx = { ...teamScoresTx, [t]: toT };
          changes.push({ scope: 'TEAM', target: `TEAM ${t}`, from: fromT, to: toT, delta: d, reason: `${reason} (by ${singer.name})` });
        };

        const applyTeamDelta = (team: TeamId, delta: number, reason: string) => {
          if (delta === 0) return;

          let d = delta;
          if (d < 0) d = mitigateNegative(team, d, reason);

          if (d === 0) return;

          const from = teamScoresTx[team] ?? 0;
          const to = from + d;
          teamScoresTx = { ...teamScoresTx, [team]: to };
          changes.push({ scope: 'TEAM', target: `TEAM ${team}`, from, to, delta: d, reason });
        };

        // Forced success (coach ult)
        let effectiveSuccess = isSuccess;
        if (singer.buffs?.forcedSuccess) {
          effectiveSuccess = true;
          notes.push('NOTE COACH ULT: FORCED SUCCESS applied');
          singer.buffs.forcedSuccess = null;
        }

        const rid: RoleId | undefined = singer.role?.id;
        const sabotage = singer.debuffs?.sabotaged;
        const sabotageActive = !!sabotage;

        const currentChallengeLocal = singer.challenge || { title: '...', criteria: '...' };

        if (sabotageActive) {
          const forced = effectiveSuccess ? 0 : (sabotage?.fail ?? -1000);
          applySingerDelta(forced, `SABOTEUR SKILL (SABOTAGE OVERRIDE: ${effectiveSuccess ? '+0 on success' : `${forced}`})`);
          singer.debuffs.sabotaged = null;
          notes.push(`NOTE SABOTAGE: other bonus sources are suppressed for this turn`);
        } else {
          const base = effectiveSuccess ? BASE_SUCCESS : BASE_FAIL;
          applySingerDelta(base, effectiveSuccess ? 'BASE SUCCESS' : 'BASE FAIL');
        }

        // Passives / Buffs (disabled if sealed)
        if (!sealedThisTurn && !sabotageActive) {
          // SHOWMAN passive
          if (rid === 'showman' && effectiveSuccess) applySingerDelta(500, 'SHOWMAN PASSIVE (+500 on success)');

          // SABOTEUR passive
          if (rid === 'saboteur' && effectiveSuccess) applyTeamDelta(et, -300, 'SABOTEUR PASSIVE (enemy -300 on success)');

          // MAESTRO passive
          if (rid === 'maestro') {
            if (effectiveSuccess) {
              const nextCombo = clamp((singer.combo ?? 0) + 1, 0, 5);
              singer.combo = nextCombo;
              const bonus = 250 * nextCombo;
              applySingerDelta(bonus, `MAESTRO PASSIVE (COMBO x${nextCombo} => +${bonus})`);
            } else {
              const had = singer.combo ?? 0;
              singer.combo = 0;
              if (had > 0) notes.push(`NOTE MAESTRO: COMBO broken (no score penalty)`);
            }
          }

          // GAMBLER passive (-500..1500 step 250) ; clamp if skill used
          if (rid === 'gambler' && effectiveSuccess) {
            const steps = 9; // -500 to 1500 in 250 steps => 9 values
            const bonus = -500 + 250 * Math.floor(Math.random() * steps); // [-500..1500]
            const clampFlag = !!singer.buffs?.gamblerSkillClampPassive;
            const applied = clampFlag && bonus < 0 ? 0 : bonus;
            if (clampFlag && bonus < 0) notes.push(`NOTE GAMBLER SKILL: PASSIVE clamp (${bonus} -> 0)`);
            applySingerDelta(applied, `GAMBLER PASSIVE (RNG bonus)`);
          }

          // MIMIC passive
          if (rid === 'mimic' && effectiveSuccess) {
            const last = teamBuffsTx[t]?.lastTeamDelta ?? 0;
            if (last > 0) {
              const bonus = Math.round(last * 0.3);
              applySingerDelta(bonus, `MIMIC PASSIVE (30% of last ally success ${last})`);
            }
          }

          // TEAM next success bonus
          if (effectiveSuccess && (teamBuffsTx[t]?.nextSuccessBonus ?? 0) > 0) {
            const b = teamBuffsTx[t].nextSuccessBonus;
            applySingerDelta(b, `TEAM BUFF (NEXT SUCCESS BONUS +${b})`);
            teamBuffsTx[t].nextSuccessBonus = 0;
          }

          // HYPE ULT team buff
          if (effectiveSuccess && (teamBuffsTx[t]?.hypeUltTurns ?? 0) > 0) {
            applySingerDelta(500, 'HYPE ULT (success +500)');
          }
        }

        // Decrement hype ult turns
        if ((teamBuffsTx[t]?.hypeUltTurns ?? 0) > 0) {
          teamBuffsTx[t].hypeUltTurns = Math.max(0, (teamBuffsTx[t].hypeUltTurns ?? 0) - 1);
        }

        // Skill/Ult armed effects (disabled if sealed; and also suppressed by sabotage override)
        if (!sealedThisTurn && !sabotageActive) {
          // MAESTRO skill
          if (singer.buffs?.maestroSkill) {
            if (!effectiveSuccess) applySingerDelta(-500, 'MAESTRO SKILL (fail -500)');
            else {
              const before = singer.combo ?? 0;
              const after = clamp(before + 2, 0, 5);
              singer.combo = after;
              notes.push(`NOTE MAESTRO SKILL: COMBO +2 (x${before} -> x${after})`);
            }
            singer.buffs.maestroSkill = false;
          }

          // SHOWMAN skill
          if (singer.buffs?.encore) {
            if (effectiveSuccess) applySingerDelta(500, 'SHOWMAN SKILL (+500 on success)');
            singer.buffs.encore = false;
          }

          // GAMBLER skill (double down)
          if (singer.buffs?.doubleDown) {
            if (effectiveSuccess) {
              const extra = singerTurnDelta;
              applySingerDelta(extra, 'GAMBLER SKILL (DOUBLE DOWN x2)');
            } else {
              applySingerDelta(-2000, 'GAMBLER SKILL (DOUBLE DOWN fail -2000)');
            }
            singer.buffs.doubleDown = false;
            singer.buffs.gamblerSkillClampPassive = false;
          } else {
            if (singer.buffs?.gamblerSkillClampPassive) singer.buffs.gamblerSkillClampPassive = false;
          }

          // GAMBLER ult coinflip
          if (singer.buffs?.gamblerUlt) {
            const head = Math.random() < 0.5;
            const delta = head ? 5000 : -1000;
            applySingerDelta(delta, `GAMBLER ULT (coinflip ${head ? 'HEAD +5000' : 'TAIL -1000'})`);
            singer.buffs.gamblerUlt = false;
          }

          // SHOWMAN ult (success enemy -2000)
          if (singer.buffs?.spotlight) {
            if (effectiveSuccess) applyTeamDelta(et, -2000, 'SHOWMAN ULT (success enemy -2000)');
            singer.buffs.spotlight = false;
          }

          // MIMIC skill ECHO
          if (singer.buffs?.echo) {
            const lastTurn = data.lastTurnDelta ?? 0;
            const add = Math.round(lastTurn * 0.5);
            applySingerDelta(add, `MIMIC SKILL (ECHO 50% of last turn ${fmt(lastTurn)})`);
            singer.buffs.echo = false;
          }

          // HYPE skill (next 2 turns success +500)
          if (singer.buffs?.hypeBoost?.turns) {
            const turns = singer.buffs.hypeBoost.turns as number;
            if (effectiveSuccess) applySingerDelta(500, 'HYPE SKILL (success +500)');
            const next = Math.max(0, turns - 1);
            singer.buffs.hypeBoost.turns = next;
            if (next === 0) singer.buffs.hypeBoost = null;
          }

          // COACH skill SAFE
          if (!effectiveSuccess && singer.buffs?.safe) {
            applyTeamDelta(t, +300, 'COACH SKILL (SAFE: team +300 on fail)');
            singer.buffs.safe = false;
          }
        } else {
          if (sealedThisTurn) notes.push('NOTE SEALED: passive/skill/ult effects disabled');
        }

        // Save lastTeamDelta for mimic passive
        if (!sealedThisTurn && effectiveSuccess) teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), lastTeamDelta: singerTurnDelta };
        else teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), lastTeamDelta: teamBuffsTx[t]?.lastTeamDelta ?? 0 };

        const lastTurnDelta = singerTurnDelta;

        // Decrement sealed/neg buffs if active on this team's turn
        if (sealedTeamThisTurn) teamBuffsTx[t].sealedTurns = Math.max(0, (teamBuffsTx[t].sealedTurns ?? 0) - 1);
        if (negZeroActive) teamBuffsTx[t].negZeroTurns = Math.max(0, (teamBuffsTx[t].negZeroTurns ?? 0) - 1);
        else if (negHalfActive) teamBuffsTx[t].negHalfTurns = Math.max(0, (teamBuffsTx[t].negHalfTurns ?? 0) - 1);

        // ✅ personal sealed is consumed after this player's turn
        if (sealedPersonalThisTurn) {
          singer.debuffs = { ...(singer.debuffs || {}) };
          delete singer.debuffs.sealedOnce;
          notes.push('NOTE SEALED (PERSONAL): consumed and cleared');
        }

        // Next singer & deal mission
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

        const nextIndex = findNextReadyIndex(mems, idx);
        const nextSingerLocal = mems[nextIndex] || singer;

        const auraPlans = planStartAuras(mems, nextSingerLocal, teamScoresTx, teamBuffsTx);
        const auraChanges: ScoreChange[] = [];
        for (const ap of auraPlans) {
          const from = teamScoresTx[ap.team] ?? 0;
          const to = from + ap.delta;
          teamScoresTx = { ...teamScoresTx, [ap.team]: to };
          auraChanges.push({ scope: 'TEAM', target: `TEAM ${ap.team}`, from, to, delta: ap.delta, reason: `AURA: ${ap.reason}` });
        }

        const nextSerial = serial + 1;

        const changeLines = changes.map(fmtChangeLine);
        const auraLines = auraChanges.map(fmtChangeLine);

        const themeLine = `THEME ${cardTitle(currentChallengeLocal)} / ${cardCriteria(currentChallengeLocal)}`;

        const resultEntry: LogEntry = {
          ts: Date.now(),
          kind: 'RESULT',
          actorName: singer.name,
          actorId: singer.id,
          team: singer.team,
          title: `${effectiveSuccess ? 'SUCCESS' : 'FAIL'} / ${singer.role?.name || 'ROLE'}`,
          lines: [
            themeLine,
            `NOTE TURN DELTA (net): ${fmt(singerTurnDelta)}`,
            '— SCORE CHANGES (this turn) —',
            ...(changeLines.length ? changeLines : ['(no score change)']),
            ...(notes.length ? ['— NOTES —', ...notes] : []),
          ],
        };

        const turnEntry: LogEntry = {
          ts: Date.now(),
          kind: 'TURN',
          actorName: nextSingerLocal?.name,
          actorId: nextSingerLocal?.id,
          team: nextSingerLocal?.team,
          title: 'NEXT TURN',
          lines: [
            `NOTE NEXT: ${nextSingerLocal?.name || '???'} (TEAM ${nextSingerLocal?.team || '?'})`,
            ...(auraLines.length ? ['— AURA SCORE CHANGES (turn start) —', ...auraLines] : []),
          ],
        };

        const entries: LogEntry[] = Array.isArray(data.logEntries) ? data.logEntries : [];
        const newEntries = capEntries([...entries, resultEntry, turnEntry]);

        const overlayTeamLines: string[] = (['A', 'B'] as TeamId[]).map((team) => {
          const from = teamScoresBefore[team] ?? 0;
          const to = teamScoresTx[team] ?? 0;
          const delta = to - from;
          return `TEAM ${team}: ${from.toLocaleString()} → ${to.toLocaleString()} (${fmt(delta)})`;
        });

        const resultTitle = `${effectiveSuccess ? 'SUCCESS' : 'FAIL'}: ${singer.name}`;

        const newLogs = capLogs([
          ...(data.logs || []),
          `RESULT: ${singer.name} ${effectiveSuccess ? 'SUCCESS' : 'FAIL'} (TEAM ${t}) net ${fmt(singerTurnDelta)}`,
          ...changeLines.map((x) => ` - ${x}`),
          ...(notes.length ? notes.map((x) => ` - ${x}`) : []),
          `TURN START: ${nextSingerLocal?.name || '???'} (TEAM ${nextSingerLocal?.team || '?'})`,
          ...auraLines.map((x) => ` - ${x}`),
        ]);

        tx.update(ref, {
          members: mems,
          teamScores: teamScoresTx,
          teamBuffs: teamBuffsTx,
          currentTurnIndex: nextIndex,
          turnSerial: nextSerial,
          deck,
          themePool: pool,
          logs: newLogs,
          logEntries: newEntries,
          turnSkillUsed: false,
          turnUltUsed: false,
          lastTurnDelta,
          lastLog: { timestamp: Date.now(), title: resultTitle, detail: overlayTeamLines.join('\n') },
          turnAbilityUsed: false,
        });
      });
    } finally {
      setBusy(false);
    }
  };

  // =========================
  // End game (ログ削除)
  // =========================
  const endGame = async () => {
    if (!roomId || !isHost) return;
    const roomRef = doc(db, 'rooms', roomId);

    await updateDoc(roomRef, {
      status: 'finished',
      logs: [],
      logEntries: [],
      lastLog: null,
      abilityFx: null,
      lastTurnDelta: 0,
      turnSkillUsed: false,
      turnUltUsed: false,
      turnAbilityUsed: false,
      oracleUltPick: null,
    });

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

      <AnimatePresence>{activeActionLog && <ActionOverlay actionLog={activeActionLog} onClose={clearActionLog} />}</AnimatePresence>
      <AnimatePresence>{abilityFx && <AbilityFxOverlay fx={abilityFx} onDone={clearAbilityFx} />}</AnimatePresence>

      <ConfirmModal state={confirmState} busy={busy} onClose={() => !busy && setConfirmState(null)} />

      <AnimatePresence>{showGuide && <GuideModal open={showGuide} onClose={() => setShowGuide(false)} members={sortedMembers} usedRoleIds={usedRoleIds} />}</AnimatePresence>

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

          if ((action === 'mimic_stolen_ally' || action === 'mimic_stolen_enemy') && !mimicStolenRoleId) return;

          requestConfirmTarget(action, id);
        }}
      />

      {/* ORACLE ULT pick modal */}
      <OracleUltPickModal
        state={oracleUltPick}
        busy={busy}
        canControl={canControlOraclePick}
        onClose={() => {
          // close only (does not cancel state in DB)
          addToast('ORACLE PICK は未完了です（続けて選択してください）');
        }}
        onPick={(targetId, cand) => requestPickOracleUltTheme(targetId, cand)}
      />

      {/* PROXY modal */}
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
                  {(proxyTarget.candidates || []).map((cand: any, idx2: number) => (
                    <motion.button
                      key={idx2}
                      whileHover={{ scale: 1.05, borderColor: '#facc15' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => requestPickCandidate(proxyTarget.id, cand, true)}
                      disabled={busy || isOraclePickingActive}
                      className="bg-black/80 backdrop-blur-md border border-white/20 hover:bg-yellow-900/40 p-4 md:p-6 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-2 transition-colors min-h-[100px] md:min-h-[160px] shrink-0 disabled:opacity-50"
                    >
                      <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">OPTION {idx2 + 1}</div>
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

      {/* Logs Drawer */}
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
                {logEntries
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <div key={`${e.ts}-${i}`} className={`rounded-xl border ${kindColorClass(e.kind)} p-3`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-lg">{iconOf(e.kind)}</div>
                            <div className="font-black tracking-widest text-sm truncate">{e.title}</div>
                            {e.team && (
                              <span
                                className={`text-[9px] font-black px-2 py-0.5 rounded ${
                                  e.team === 'A'
                                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                                    : 'bg-red-500/20 text-red-200 border border-red-500/30'
                                }`}
                              >
                                TEAM {e.team}
                              </span>
                            )}
                          </div>
                          {e.actorName && <div className="text-[10px] font-mono tracking-widest text-white/60 mt-0.5 truncate">BY: {e.actorName}</div>}
                        </div>
                        <div className="text-[10px] font-mono tracking-widest text-white/40 flex-none">{formatTime(e.ts)}</div>
                      </div>

                      <div className="mt-2 space-y-1">
                        {e.lines.map((l, idx2) => {
                          const neg = l.includes('(-') || l.includes(' -') || l.includes('-');
                          const pos = l.includes('+');
                          const cls = neg ? 'text-red-300' : pos ? 'text-cyan-200' : 'text-white/70';
                          return (
                            <div key={idx2} className={`text-[11px] leading-relaxed ${cls}`}>
                              • {l}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                {logEntries.length === 0 && <div className="text-[11px] text-white/40 font-mono tracking-widest">NO LOG ENTRIES YET</div>}

                <div className="h-6" />
              </div>

              <div className="pt-3 border-t border-white/10 text-[10px] font-mono tracking-widest text-white/40">（旧ログ）{logs.length} 行</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Host missing */}
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
              <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">
                TEAM {currentSinger?.team || '?'} ・ ROLE {currentSinger?.role?.name || '—'}
              </div>
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
              onClick={() => setShowGuide(true)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-yellow-300 hover:bg-yellow-900/30 hover:border-yellow-500 transition-all active:scale-95"
              title="GUIDE"
            >
              📘
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

        {/* Effects row */}
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

        {/* Center */}
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
                    {displayCandidates.map((cand: any, idx2: number) => (
                      <motion.button
                        key={`${cardTitle(cand)}-${idx2}`}
                        whileHover={{ scale: 1.05, borderColor: '#facc15' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => requestPickCandidate(selectionOwner.id, cand, false)}
                        disabled={busy || isOraclePickingActive}
                        className="bg-black/80 backdrop-blur-md border border-white/20 hover:bg-yellow-900/40 p-4 md:p-6 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-2 transition-colors min-h-[100px] md:min-h-[160px] shrink-0 disabled:opacity-50"
                      >
                        <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">OPTION {idx2 + 1}</div>
                        <h3 className="font-bold text-white text-base md:text-xl leading-tight break-all">{cardTitle(cand)}</h3>
                        <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5">{cardCriteria(cand)}</p>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <MissionDisplay
                key={(currentSinger?.id || 'none') + turnSerial}
                title={cardTitle(currentChallenge)}
                criteria={cardCriteria(currentChallenge)}
                stateText={isCurrentSingerLocked ? (oracleUltPick?.active ? 'ORACLE SELECTING...' : 'CHOOSING THEME...') : null}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Bottom controls */}
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

            <div className="flex-1 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md p-2 md:p-3 flex flex-col gap-2">
              <div className="text-[8px] md:text-[10px] font-mono tracking-widest text-white/40">ABILITIES</div>

              <button
                disabled={!canUseSkill || busy || !!activeActionLog || isOraclePickingActive}
                onClick={requestUseSkill}
                className={`w-full py-2 rounded-xl font-black tracking-widest text-xs transition-all ${
                  canUseSkill && !busy && !activeActionLog && !isOraclePickingActive
                    ? 'bg-gradient-to-r from-cyan-700 to-blue-700 hover:scale-[1.02]'
                    : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                SKILL ({skillUsesLeft})
              </button>

              <button
                disabled={!canUseUlt || busy || !!activeActionLog || isOraclePickingActive}
                onClick={requestUseUlt}
                className={`w-full py-2 rounded-xl font-black tracking-widest text-xs transition-all ${
                  canUseUlt && !busy && !activeActionLog && !isOraclePickingActive
                    ? 'bg-gradient-to-r from-yellow-600 to-orange-700 hover:scale-[1.02]'
                    : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                ULT ({ultUsesLeft})
              </button>

              {sealedThisTurnClient && (
                <div className="text-[9px] font-mono tracking-widest text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg px-2 py-1">
                  SEALED: PASSIVE/SKILL/ULT DISABLED
                </div>
              )}
              {isOraclePickingActive && (
                <div className="text-[9px] font-mono tracking-widest text-yellow-300 border border-yellow-500/30 bg-yellow-500/10 rounded-lg px-2 py-1">
                  ORACLE ULT: PICKING IN PROGRESS
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile reservation */}
        <div className="md:hidden w-full bg-black/80 backdrop-blur-md border-t border-white/10 p-1.5 pb-4 flex flex-col gap-1 flex-none">
          <div className="flex justify-between items-center px-1">
            <span className="text-[8px] font-bold text-gray-500 tracking-widest">RESERVATION LIST</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowGuide(true)} className="text-[8px] text-yellow-300 border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 rounded hover:bg-yellow-500/20">
                GUIDE
              </button>
              {isHost && (
                <button onClick={() => setShowFinishModal(true)} className="text-[8px] text-red-400 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-900/30">
                  FINISH
                </button>
              )}
            </div>
          </div>

          <div className="flex overflow-x-auto gap-2 pb-1 custom-scrollbar snap-x">
            {reorderedMembers.map((member) => {
              const isCurrent = member.id === currentSinger?.id;
              const isOffline = offlineUsers.has(member.id) && !String(member.id).startsWith('guest_');
              const isGuest = String(member.id).startsWith('guest_');

              const challenge = member.challenge || { title: '...', criteria: '...' };
              const roleLabel = member.role?.name || '—';

              return (
                <div
                  key={member.id}
                  className={`snap-start flex-none w-44 bg-white/5 border ${isCurrent ? 'border-cyan-500 bg-cyan-900/20' : 'border-white/10'} rounded-lg p-2 flex flex-col gap-1 relative overflow-hidden ${isOffline ? 'grayscale opacity-70' : ''}`}
                >
                  {isCurrent && <div className="absolute top-0 right-0 bg-cyan-500 text-black text-[6px] font-bold px-1 py-0.5 rounded-bl">NOW</div>}
                  {isGuest && <div className="absolute top-0 left-0 bg-purple-600 text-white text-[6px] font-bold px-1 py-0.5 rounded-br">GUEST</div>}

                  <div className="flex items-center gap-2">
                    <div className="text-lg">{member.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[10px] font-bold truncate ${isCurrent ? 'text-white' : 'text-gray-300'}`}>{member.name}</div>
                      <div className="text-[8px] font-mono text-white/50 truncate">
                        TEAM {member.team || '?'} ・ ROLE {roleLabel}
                      </div>
                      <div className="text-[8px] font-mono text-white/40 truncate">{(member.score || 0).toLocaleString()} pt</div>
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

                  {member.debuffs?.sealedOnce && (
                    <div className="mt-1 text-[7px] font-bold text-red-300 border border-red-500/30 bg-red-500/10 px-2 py-0.5 rounded-full w-fit">
                      SEALED
                    </div>
                  )}

                  {isOffline && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-red-500 font-bold backdrop-blur-[1px]">OFFLINE</div>}

                  {canProxy(member) && (
                    <button
                      onClick={() => setProxyTarget(member)}
                      className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm z-10 border-2 border-yellow-400 animate-pulse text-yellow-400 hover:bg-yellow-400 hover:text-black transition-colors"
                      disabled={isOraclePickingActive}
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

      {/* Desktop reservation */}
      <div className="hidden md:flex w-[320px] lg:w-[380px] flex-none bg-black/60 backdrop-blur-xl border-l border-white/10 flex-col relative z-20 shadow-2xl">
        <div className="p-4 md:p-6 border-b border-white/10 bg-white/5 flex-none">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs md:text-sm font-bold text-white tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                RESERVATION LIST
              </h3>
              <p className="text-[10px] text-gray-500 mt-1 font-mono">TOTAL: {sortedMembers.length} MEMBERS</p>
            </div>
            <button
              onClick={() => setShowGuide(true)}
              className="px-3 py-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-200 hover:bg-yellow-500/20 text-xs font-black tracking-widest"
            >
              GUIDE
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
          {reorderedMembers.map((member) => {
            const isCurrent = member.id === currentSinger?.id;

            const isGuest = String(member.id).startsWith('guest_');
            const isOffline = offlineUsers.has(member.id) && !isGuest;
            const challenge = member.challenge || { title: '...', criteria: '...' };
            const roleLabel = member.role?.name || '—';

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
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center text-lg">{member.avatar}</div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-gray-300'}`}>{member.name}</span>
                      {isGuest && <span className="text-[9px] bg-purple-600 text-white px-1.5 rounded font-bold">GUEST</span>}
                      {needsSelection(member) && <span className="text-[9px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-1.5 rounded font-bold">CHOOSE</span>}
                      {member.debuffs?.sealedOnce && <span className="text-[9px] bg-red-500/20 text-red-200 border border-red-500/30 px-1.5 rounded font-bold">SEALED</span>}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={`font-bold ${member.team === 'A' ? 'text-cyan-300' : member.team === 'B' ? 'text-red-300' : 'text-gray-500'}`}>TEAM {member.team || '?'}</span>
                      <span className="text-gray-500">|</span>
                      <span className="text-white/70 truncate">ROLE {roleLabel}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-cyan-200">{(member.score || 0).toLocaleString()} pt</span>
                      {isOffline && <span className="text-[9px] bg-red-900 text-red-300 px-1 rounded">OFFLINE</span>}
                    </div>
                  </div>

                  {canProxy(member) && (
                    <button
                      onClick={() => setProxyTarget(member)}
                      disabled={isOraclePickingActive}
                      className="ml-auto px-3 py-1.5 rounded bg-yellow-400 text-black font-black text-[10px] animate-pulse border-2 border-yellow-200 shadow-[0_0_10px_yellow] hover:scale-110 transition-transform z-10 flex items-center gap-1 disabled:opacity-50"
                    >
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

      {/* Finish modal */}
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