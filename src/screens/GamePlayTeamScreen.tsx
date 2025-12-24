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
const MAX_LOGS = 60;

// ★ 端数対策：割合計算などで 10/50 単位が出ないように 100刻みに丸める
const roundToStep = (v: number, step = 100) => Math.round(v / step) * step;

const capLogs = (logs: string[]) => logs.slice(Math.max(0, logs.length - MAX_LOGS));

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rndInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

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

// ★白画面防止：themePool が無い部屋でも必ず動く
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
    skill: 'CRESCENDO(2回): このターン成功+1500 / 失敗-1500(例外)',
    ult: 'FINALE(1回): COMBO×800をチーム付与しCOMBO消費。味方次成功+500(1回)',
  },
  {
    id: 'showman',
    name: 'SHOWMAN',
    type: 'ATK',
    sigil: '◆',
    passive: '成功時+800（常時）。失敗は基本0。',
    skill: 'ENCORE(2回): 成功時さらに+1200。失敗しても0。',
    ult: 'SPOTLIGHT(1回): 成功なら敵チーム-2000 / 失敗なら自分-1000(例外)',
  },
  {
    id: 'ironwall',
    name: 'IRON WALL',
    type: 'DEF',
    sigil: '▣',
    passive: 'チームが受ける「マイナス効果」を30%軽減（失敗0は対象外）。',
    skill: 'INTERCEPT(2回): 指定味方の次マイナスを0。代わりに自分が半分受ける。',
    ult: 'BARRIER(1回): 次に自分の番が来るまで、チームへのマイナス効果を無効化。',
  },
  {
    id: 'coach',
    name: 'THE COACH',
    type: 'SUP',
    sigil: '✚',
    passive: '味方ターン開始時、チーム+150（歌唱結果に依存しない）。',
    skill: 'TIMEOUT(2回): 指定味方にSAFE付与。次の失敗でもチーム+300。',
    ult: 'MORALE(1回): チーム+2500。弱いデバフ解除。',
  },
  { id: 'oracle', name: 'ORACLE', type: 'TEC', sigil: '⟁', passive: '自分のターンはお題3択。', skill: 'REROLL(2回): 自分or味方のお題を引き直し（3択維持）。', ult: 'FATE SHIFT(1回): 次イベントを有利系に強制。' },
  { id: 'mimic', name: 'MIMIC', type: 'TEC', sigil: '◈', passive: '直前の味方成功の獲得点30%を、自分成功時に上乗せ。', skill: 'ECHO(2回): 直前のスコア変動を50%コピー（成功/失敗問わず）。', ult: 'STEAL ROLE(1回): 敵のスキル効果を1回コピーして発動。' },
  { id: 'hype', name: 'HYPE ENGINE', type: 'SUP', sigil: '✦', passive: '自分ターン開始時、チーム+400（結果に依存しない）。', skill: 'CHANT(2回): 次の味方成功ボーナス+1000(1回)。', ult: 'ROAR(1回): 味方全員の次成功に+500（各1回ぶん）。' },
  { id: 'saboteur', name: 'SABOTEUR', type: 'TEC', sigil: '☒', passive: '自分成功で敵チーム-300。', skill: 'MARK(2回): 敵1人をマーク。次にその敵が成功したら敵+0、自チーム+800。', ult: 'BLACKOUT(1回): 敵に「次イベント悪化」付与。' },
  { id: 'underdog', name: 'UNDERDOG', type: 'DEF', sigil: '⬟', passive: '自分ターン開始時、負けていたらチーム+600。', skill: 'CLUTCH(2回): 負けてるならチーム+2000。ただし次に自分が失敗したら-1500(例外)。', ult: 'REVERSAL(1回): 点差の20%を相手から奪う（最大4000）。' },
  { id: 'gambler', name: 'GAMBLER', type: 'TEC', sigil: '🎲', passive: '成功時、追加ボーナス(0〜3000)抽選（500刻み）。', skill: 'DOUBLE DOWN(2回): 成功×2 / 失敗-2000(例外)', ult: 'JACKPOT(1回): 表+6000 / 裏-3000(例外)' },
];

const roleDef = (id?: RoleId) => ROLE_DEFS.find((r) => r.id === id);

// =========================
// Events
// =========================
type EventTag = 'good' | 'bad' | 'neutral';
type GameEvent = { id: string; tag: EventTag; name: string; desc: string };
type NextEventState = (GameEvent & { forSingerId: string }) | null;

// ★ 今後の順番（1周ぶん）を全員に表示するためのキュー
type EventQueueItem = GameEvent & { forSingerId: string };

const stripNextEvent = (ev: any): GameEvent | null => {
  if (!ev) return null;
  const { id, tag, name, desc } = ev;
  if (!id || !name) return null;
  return { id, tag, name, desc };
};

const normalizeEventQueue = (qLike: any): EventQueueItem[] => {
  const q = Array.isArray(qLike) ? qLike : [];
  return q
    .map((x: any) => {
      if (!x || typeof x.forSingerId !== 'string') return null;
      const ev = stripNextEvent(x);
      if (!ev) return null;
      return { ...ev, forSingerId: x.forSingerId } as EventQueueItem;
    })
    .filter(Boolean) as EventQueueItem[];
};

const EVENTS: GameEvent[] = [
  { id: 'crowd_favor', tag: 'good', name: 'CROWD FAVOR', desc: '成功でチーム+800。失敗でも0。' },
  { id: 'duet_link', tag: 'good', name: 'DUET LINK', desc: '成功でランダム味方の個人スコア+400。' },
  { id: 'steal_spot', tag: 'neutral', name: 'STEAL SPOT', desc: '成功で敵チーム-500。失敗0。' },
  { id: 'pressure', tag: 'bad', name: 'PRESSURE', desc: '失敗すると-800（例外ペナ）。成功は通常。' },
  { id: 'risk_high', tag: 'bad', name: 'HIGH RISK', desc: '成功+2000、失敗-1500（例外ペナ）。' },
  { id: 'comeback', tag: 'good', name: 'COMEBACK', desc: '負けている側の成功ボーナス+1200。' },
  { id: 'mirror', tag: 'neutral', name: 'MIRROR', desc: '成功で自分の加点の20%をチームにも追加。' },
  { id: 'silence', tag: 'bad', name: 'SILENCE', desc: 'このターンはスキル発動不可（既に発動済みは有効）。' },
  { id: 'overtime', tag: 'neutral', name: 'OVERTIME', desc: '成功で次の味方成功に+400（1回）。' },
  { id: 'scramble', tag: 'neutral', name: 'SCRAMBLE', desc: '成功で敵の次成功ボーナスを無効化。' },
];

const pickEvent = (opts: { forceGood?: boolean; forceBad?: boolean }) => {
  const pool = EVENTS.filter((e) => {
    if (opts.forceGood) return e.tag === 'good';
    if (opts.forceBad) return e.tag === 'bad';
    return true;
  });
  return pool[Math.floor(Math.random() * pool.length)];
};

const pickEventForTeam = (teamBuffs: any, team: TeamId) => {
  const tb = teamBuffs?.[team] || {};
  const forceGood = !!tb.forceGoodEvent;
  const forceBad = !forceGood && !!tb.blackout;
  return pickEvent({ forceGood, forceBad });
};

const consumeEventFlagsIfAny = (teamBuffs: any, team: TeamId) => {
  if (!teamBuffs?.[team]) teamBuffs[team] = {};
  if (teamBuffs[team].forceGoodEvent) teamBuffs[team].forceGoodEvent = false;
  if (teamBuffs[team].blackout) teamBuffs[team].blackout = false;
};

const deriveCurrentNextFromQueue = (q: EventQueueItem[]) => {
  const cur = q[0] ? stripNextEvent(q[0]) : null;
  const nxt = q[1] ? ({ ...(stripNextEvent(q[1]) as GameEvent), forSingerId: q[1].forSingerId } as any) : null;
  return { currentEvent: cur, nextEvent: nxt as NextEventState };
};

// =========================
// Mechanics helpers
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

const buildReadyCycleOrder = (mems: any[], startIndex: number) => {
  const n = mems.length;
  const order: any[] = [];
  if (n === 0) return order;
  for (let k = 0; k < n; k++) {
    const i = (startIndex + k) % n;
    if (isReadyForTurn(mems[i])) order.push(mems[i]);
  }
  return order;
};

const isEventQueueAligned = (qLike: any, mems: any[], startIndex: number) => {
  const q = normalizeEventQueue(qLike);
  const order = buildReadyCycleOrder(mems, startIndex);
  if (q.length !== order.length) return false;
  for (let i = 0; i < order.length; i++) {
    if (q[i]?.forSingerId !== order[i]?.id) return false;
  }
  return true;
};

const buildEventQueue = (mems: any[], startIndex: number, teamBuffs: any) => {
  const order = buildReadyCycleOrder(mems, startIndex);
  const tbSim = {
    A: { ...(teamBuffs?.A || {}) },
    B: { ...(teamBuffs?.B || {}) },
  };

  const queue: EventQueueItem[] = [];
  for (const m of order) {
    const team = m.team as TeamId;
    if (team !== 'A' && team !== 'B') continue;
    const ev = pickEventForTeam(tbSim, team);
    consumeEventFlagsIfAny(tbSim, team);
    queue.push({ ...ev, forSingerId: m.id });
  }

  return {
    queue,
    flagsAfter: {
      A: { forceGoodEvent: !!tbSim.A.forceGoodEvent, blackout: !!tbSim.A.blackout },
      B: { forceGoodEvent: !!tbSim.B.forceGoodEvent, blackout: !!tbSim.B.blackout },
    },
  };
};

const applyForcedEventToQueue = (q: EventQueueItem[], mems: any[], startIndex: number, team: TeamId, forced: 'good' | 'bad') => {
  const memberMap = new Map<string, any>(mems.map((m: any) => [m.id, m]));
  for (let i = 1; i < q.length; i++) {
    const m = memberMap.get(q[i].forSingerId);
    if (m?.team === team) {
      const ev = pickEvent(forced === 'good' ? { forceGood: true } : { forceBad: true });
      q[i] = { ...ev, forSingerId: q[i].forSingerId };
      return true;
    }
  }
  return false;
};

// turn start aura
const computeStartAuras = (mems: any[], nextSinger: any, teamScores: { A: number; B: number }) => {
  const t: TeamId = nextSinger?.team;
  const et: TeamId = t === 'A' ? 'B' : 'A';
  let add = 0;

  if (mems.some((m) => m.team === t && m.role?.id === 'coach')) add += 150;
  if (nextSinger?.role?.id === 'hype') add += 400;
  if (nextSinger?.role?.id === 'underdog') {
    if ((teamScores[t] ?? 0) < (teamScores[et] ?? 0)) add += 600;
  }

  if (add !== 0) {
    return { teamScores: { ...teamScores, [t]: (teamScores[t] ?? 0) + add }, auraAdd: add };
  }
  return { teamScores, auraAdd: 0 };
};

// =========================
// UI helpers (event style)
// =========================
const eventUi = (ev: GameEvent | null) => {
  if (!ev) return null;
  if (ev.tag === 'good') {
    return { color: '#10b981', shadow: 'rgba(16,185,129,0.6)', bgGradient: 'from-emerald-500/20 to-cyan-500/20' };
  }
  if (ev.tag === 'bad') {
    return { color: '#ef4444', shadow: 'rgba(239,68,68,0.6)', bgGradient: 'from-red-900/40 to-orange-900/40' };
  }
  return { color: '#06b6d4', shadow: 'rgba(6,182,212,0.6)', bgGradient: 'from-cyan-500/20 to-teal-500/20' };
};

// =========================
// Overlay: Turn Result (1ターン1回だけ)
// =========================
const ActionOverlay = ({ actionLog, onClose }: { actionLog: any; onClose: () => void }) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onCloseRef.current) onCloseRef.current();
    }, 2200);
    return () => clearTimeout(timer);
  }, [actionLog]);

  if (!actionLog) return null;

  const details = actionLog.detail ? String(actionLog.detail).split('\n') : [];
  const limited = details.slice(0, 6);
  const omitted = details.length - limited.length;

  return (
    <div className="fixed inset-0 z-[150] pointer-events-none flex items-center justify-center overflow-hidden">
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full bg-gradient-to-r from-black/80 via-black/95 to-black/80 border-y-2 border-white/20 py-6 md:py-10 flex flex-col items-center justify-center relative backdrop-blur-sm"
      >
        <div className="absolute inset-0 bg-cyan-500/10 mix-blend-overlay" />
        <h2 className="text-2xl md:text-5xl font-black italic text-white tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] px-4 text-center mb-4">
          {actionLog.title}
        </h2>

        <div className="flex flex-col gap-2 items-center w-full px-4">
          {limited.map((line: string, idx: number) => {
            const isNegative = line.includes('-');
            const isTeam = line.startsWith('TEAM ');
            const isNote = line.startsWith('NOTE ');
            const colorClasses =
              isNote ? 'text-gray-300 border-white/10 bg-white/5'
              : isNegative ? 'text-red-400 border-red-500/30 bg-red-900/20'
              : isTeam ? 'text-cyan-300 border-cyan-500/30 bg-cyan-900/20'
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
          {omitted > 0 && (
            <div className="text-[10px] md:text-xs font-mono tracking-widest text-white/40">
              +{omitted} more (see LOG)
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// =========================
// Overlay: SKILL/ULT flashy (everyone sees)
// =========================
type AbilityFx = null | {
  timestamp: number;
  kind: 'SKILL' | 'ULT';
  actorName: string;
  roleName: string;
  team?: TeamId;
};

/**
 * ★修正点
 * - 親が頻繁に re-render すると `onDone={() => setAbilityFx(null)}` の関数参照が毎回変わり、
 *   それを依存配列に入れているとタイマーがリセットされ続けて永遠に消えないことがある。
 * - 対策：onDone を ref に退避し、effect は timestamp の変化だけで1回だけ走らせる。
 */
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
    // ★ timestamp だけで制御：親の re-render ではリセットされない
  }, [ts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!fx) return null;

  const isUlt = fx.kind === 'ULT';
  const color = isUlt ? '#f59e0b' : '#06b6d4';
  const shadow = isUlt ? 'rgba(245,158,11,0.55)' : 'rgba(6,182,212,0.55)';

  return (
    <div className="fixed inset-0 z-[170] pointer-events-none flex items-center justify-center">
      <motion.div
        key={`fx-bg-${fx.timestamp}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/85"
      />
      {/* burst */}
      <motion.div
        key={`fx-burst-${fx.timestamp}`}
        initial={{ scale: 0.7, opacity: 0, filter: 'blur(10px)' }}
        animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 1.05, filter: 'blur(8px)' }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-5xl px-4"
      >
        {/* ring */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.25], opacity: [0, 0.35, 0] }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute inset-0 rounded-[999px]"
          style={{
            border: `2px solid ${color}66`,
            boxShadow: `0 0 70px ${shadow}`,
          }}
        />
        {/* sparks */}
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
        {/* title card */}
        <div className="relative mx-auto rounded-2xl border border-white/15 bg-black/40 backdrop-blur-md py-10 md:py-14 px-6 md:px-10 text-center overflow-hidden">
          <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(135deg, ${color}33, transparent)` }} />
          <div className="relative z-10">
            <div className="text-[10px] md:text-xs font-mono tracking-[0.3em] text-white/70">
              {fx.team ? `TEAM ${fx.team} ・ ` : ''}{fx.kind} ACTIVATED
            </div>
            <div
              className="mt-2 text-[clamp(2rem,6vw,5rem)] font-black italic tracking-tight"
              style={{ color, textShadow: `0 0 28px ${shadow}` }}
            >
              {fx.kind}
            </div>
            <div className="mt-2 text-white/90 font-black tracking-widest text-base md:text-2xl">
              {fx.actorName}
            </div>
            <div className="mt-1 text-white/60 font-mono text-xs md:text-sm tracking-widest">
              {fx.roleName}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// =========================
// Generic Confirm Modal (選択系)
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

const ConfirmModal = ({
  state,
  busy,
  onClose,
}: {
  state: ConfirmState;
  busy: boolean;
  onClose: () => void;
}) => {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        onClick={() => !busy && onClose()}
      />
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
// RULE GRIMOIRE (events + roles)
// =========================
const RuleGrimoireModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f172a] border border-cyan-500/30 w-full max-w-5xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-4 md:p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
          <h2 className="text-xl md:text-2xl font-black text-cyan-400 tracking-widest italic flex items-center gap-2">
            📖 RULE GRIMOIRE
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
          <div className="text-xs font-bold tracking-widest text-white/50 mb-2">EVENTS</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {EVENTS.map((evt) => {
              const ui = eventUi(evt);
              return (
                <div key={evt.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                    <div className="h-10 w-1 rounded-full" style={{ backgroundColor: ui?.color, boxShadow: `0 0 10px ${ui?.shadow}` }} />
                    <div className="flex-1">
                      <h3 className="font-black italic text-lg md:text-xl tracking-tighter" style={{ color: ui?.color }}>
                        {evt.name}
                      </h3>
                      <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">{evt.tag.toUpperCase()}</p>
                    </div>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed">{evt.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="text-xs font-bold tracking-widest text-white/50 mb-2">ROLES</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ROLE_DEFS.map((r) => (
              <div key={r.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                    {r.sigil}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black italic text-lg tracking-tighter text-white">{r.name}</h3>
                    <p className="text-[10px] font-mono tracking-widest text-white/40">TYPE: {r.type}</p>
                  </div>
                </div>
                <div className="text-[12px] text-white/70 leading-relaxed">
                  <div className="text-[10px] font-mono tracking-widest text-white/40 mb-1">PASSIVE</div>
                  <div className="mb-2">{r.passive}</div>
                  <div className="text-[10px] font-mono tracking-widest text-white/40 mb-1">SKILL</div>
                  <div className="mb-2">{r.skill}</div>
                  <div className="text-[10px] font-mono tracking-widest text-white/40 mb-1">ULT</div>
                  <div>{r.ult}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// =========================
// Mission Display
// =========================
const MissionDisplay = React.memo(({ title, criteria, eventData, stateText }: any) => {
  const displayTitle = stateText || title;

  const getTitleStyle = (text: string) => {
    const len = (text || '').length;
    if (len > 50) return 'text-[clamp(0.9rem,3.5vw,1.5rem)]';
    if (len > 30) return 'text-[clamp(1.1rem,4.5vw,2rem)]';
    if (len > 15) return 'text-[clamp(1.4rem,6vw,3rem)]';
    return 'text-[clamp(2rem,8vw,5rem)]';
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 1.05, opacity: 0 }}
      transition={{ type: 'spring', duration: 0.5 }}
      className="relative z-10 w-full max-w-6xl flex flex-col items-center gap-2 md:gap-4 text-center px-2"
    >
      {eventData && (
        <motion.div
          initial={{ y: -10, opacity: 0, scale: 1.02 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          className="w-full mb-1 flex flex-col items-center justify-center relative"
        >
          <div className={`absolute inset-0 blur-xl opacity-40 bg-gradient-to-r ${eventData.bgGradient} rounded-full`} />
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="relative z-10 px-4 py-2 border-y border-white/20 bg-black/60 backdrop-blur-md"
            style={{ boxShadow: `0 0 20px ${eventData.shadow}` }}
          >
            <p className="text-[8px] font-mono tracking-[0.3em] text-white font-bold">EVENT</p>
            <h2 className="text-xl md:text-5xl font-black italic tracking-tighter whitespace-nowrap" style={{ color: eventData.color, textShadow: `0 0 10px ${eventData.shadow}` }}>
              {eventData.name}
            </h2>
            <p className="text-[9px] md:text-sm font-bold text-white tracking-widest">{eventData.desc}</p>
          </motion.div>
        </motion.div>
      )}

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
          <p className="text-red-300 font-mono tracking-[0.2em] text-[8px] md:text-xs uppercase opacity-90 font-bold whitespace-nowrap">
            Clear Condition
          </p>
          <p className="font-black text-white tracking-widest text-[clamp(1.2rem,4vw,3rem)] md:text-[3rem] whitespace-pre-wrap break-words">
            {criteria}
          </p>
        </div>
      </div>
    </motion.div>
  );
});

// =========================
// Target Modal (target choose)
// =========================
type TargetModalState = null | {
  title: string;
  mode: 'ally' | 'enemy';
  action: 'ironwall_intercept' | 'coach_timeout' | 'saboteur_mark' | 'oracle_reroll' | 'mimic_steal';
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => !busy && onClose()}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0f172a] p-1 overflow-hidden"
      >
        <div className="rounded-xl p-5 bg-gradient-to-b from-white/5 to-black/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-black tracking-wider">{title}</div>
            <button className="px-3 py-1 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 text-xs" onClick={onClose} disabled={busy}>
              CLOSE
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {targets.map((m: any) => (
              <button
                key={m.id}
                disabled={busy}
                onClick={() => onPick(m.id)}
                className="p-3 rounded-xl border border-white/10 bg-black/30 hover:bg-white/10 text-left transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">{m.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{m.name}</div>
                    <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">
                      TEAM {m.team} ・ {m.role?.name || '—'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {targets.length === 0 && (
              <div className="text-[12px] text-white/50 font-mono tracking-widest">NO VALID TARGET</div>
            )}
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
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-3xl rounded-2xl border border-white/15 bg-[#0f172a] p-1 overflow-hidden"
      >
        <div className="rounded-xl p-6 md:p-8 bg-gradient-to-b from-white/5 to-black/40">
          {step === 'team' ? (
            <>
              <h2 className="text-xl md:text-2xl font-black tracking-widest text-cyan-300 italic">SELECT TEAM</h2>
              <p className="text-xs text-white/50 font-mono mt-2">途中参加のため、まずチームを選んでください</p>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  disabled={busy}
                  onClick={() => onPickTeam('A')}
                  className="p-5 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 transition-all text-left"
                >
                  <div className="text-sm font-black tracking-widest">TEAM A</div>
                  <div className="text-[10px] font-mono text-white/50 mt-1">PLAYERS: {teamCounts.A}</div>
                </button>

                <button
                  disabled={busy}
                  onClick={() => onPickTeam('B')}
                  className="p-5 rounded-2xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all text-left"
                >
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
                  <p className="text-xs text-white/50 font-mono mt-2">
                    既存プレイヤーが使用中のロールは選択できません
                  </p>
                </div>
                <button
                  disabled={busy}
                  onClick={onBack}
                  className="px-3 py-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 text-xs"
                >
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
                        used
                          ? 'border-white/5 bg-black/20 opacity-50 cursor-not-allowed'
                          : 'border-white/10 bg-black/30 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                          {r.sigil}
                        </div>
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
// Reservation list chip (event per card)
// =========================
const TurnEventChip = ({ ev, highlight }: { ev: GameEvent | null; highlight?: boolean }) => {
  if (!ev) return null;
  const ui = eventUi(ev);
  return (
    <motion.div
      animate={highlight ? { scale: [1, 1.03, 1] } : undefined}
      transition={highlight ? { repeat: Infinity, duration: 1.6 } : undefined}
      className="inline-flex items-center gap-2 px-2 py-1 rounded-full border text-[9px] font-black tracking-widest whitespace-nowrap w-fit"
      style={{
        borderColor: `${ui?.color}55`,
        background: 'rgba(0,0,0,0.35)',
        boxShadow: `0 0 14px ${ui?.shadow}`,
      }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ui?.color }} />
      <span style={{ color: ui?.color }}>EVENT</span>
      <span className="text-white/80">{ev.name}</span>
    </motion.div>
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
  const [currentEvent, setCurrentEvent] = useState<GameEvent | null>(null);
  const [nextEvent, setNextEvent] = useState<NextEventState>(null);
  const [eventQueue, setEventQueue] = useState<EventQueueItem[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [turnAbilityUsed, setTurnAbilityUsed] = useState(false);

  // UI
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
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

  // ★安定したクリア関数（親の re-render で関数参照が変わらない）
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

      setCurrentEvent(data.currentEvent || null);
      setNextEvent(data.nextEvent || null);

      setEventQueue(normalizeEventQueue(data.eventQueue));

      setLogs(data.logs || []);
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

  // ===== Next singer (skip unready) =====
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
          <div className="text-[12px] text-white/70 leading-relaxed">
            <div className="text-[10px] font-mono tracking-widest text-white/40 mb-1">PASSIVE</div>
            <div>{def.passive}</div>
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

        tx.update(ref, {
          members: mems,
          logs: capLogs([...(data.logs || []), `MIDJOIN: ${updated.name} picked TEAM ${team}`]),
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

        // ★ロール重複禁止（既存使用中ロールは選べない）
        const used = new Set<RoleId>();
        for (const m of mems) {
          if (m.id === userId) continue;
          if (!isReadyForTurn(m)) continue;
          const rid = m.role?.id as RoleId | undefined;
          if (rid) used.add(rid);
        }
        if (used.has(def.id)) {
          throw new Error('RoleAlreadyUsed');
        }

        const updated = { ...(mems[idx] || {}) };
        updated.role = { id: def.id, name: def.name, skillUses: 2, ultUses: 1 };
        updated.score = updated.score ?? 0;
        updated.combo = updated.combo ?? 0;
        updated.buffs = updated.buffs ?? {};
        updated.debuffs = updated.debuffs ?? {};
        updated.isReady = true;

        mems[idx] = updated;

        tx.update(ref, {
          members: mems,
          logs: capLogs([...(data.logs || []), `MIDJOIN: ${updated.name} picked ROLE ${def.id}`]),
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

  // ===== Host Init (fix missing fields + eventQueue) =====
  useEffect(() => {
    if (!roomId || !roomData || !isHost) return;
    if (roomData.status !== 'playing' || roomData.mode !== 'team') return;

    const mems = (roomData.members || []).slice();
    const hasMissingTurnOrder = mems.some((m: any) => m.turnOrder === undefined || m.turnOrder === null);
    const hasUnreadyNoBasics = mems.some((m: any) => !isReadyForTurn(m) && (m.turnOrder === undefined || m.turnOrder === null));
    const hasReadyMissingChallenge = mems.some(
      (m: any) => isReadyForTurn(m) && !m.challenge && !(m.candidates && m.candidates.length > 0)
    );

    const sorted = mems.slice().sort(sortByTurn);
    const idxMember = sorted[roomData.currentTurnIndex ?? 0];
    const currentIdxBad = idxMember && !isReadyForTurn(idxMember);

    const needQueue = !roomData.eventQueue || !isEventQueueAligned(roomData.eventQueue, sorted, roomData.currentTurnIndex ?? 0);

    const needsInit =
      !roomData.teamBuffs ||
      roomData.turnAbilityUsed === undefined ||
      !roomData.teamScores ||
      hasMissingTurnOrder ||
      hasUnreadyNoBasics ||
      hasReadyMissingChallenge ||
      currentIdxBad ||
      needQueue;

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

        // normalize + fill defaults
        mems = mems.map((m: any) => ({
          ...m,
          score: m.score ?? 0,
          combo: m.combo ?? 0,
          buffs: m.buffs ?? {},
          debuffs: m.debuffs ?? {},
          candidates: Array.isArray(m.candidates) ? m.candidates : null,
          challenge: m.challenge ?? null,
          role: m.role ? { ...m.role, skillUses: m.role.skillUses ?? 2, ultUses: m.role.ultUses ?? 1 } : null,
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

        const sorted = mems.slice().sort(sortByTurn);
        if (sorted.length > 0) {
          const cur = sorted[idx];
          if (cur && !isReadyForTurn(cur)) {
            idx = findFirstReadyIndex(sorted);
            changed = true;
          }
        }

        const ts = data.teamScores || computeTeamScores(mems);
        const tb = data.teamBuffs || { A: {}, B: {} };

        // ★ eventQueue を常に整合させる（全員表示用）
        let q = normalizeEventQueue(data.eventQueue);
        const aligned = isEventQueueAligned(q, sorted, idx);
        if (!aligned) {
          const built = buildEventQueue(sorted, idx, tb);
          q = built.queue;
          tb.A = { ...(tb.A || {}), forceGoodEvent: built.flagsAfter.A.forceGoodEvent, blackout: built.flagsAfter.A.blackout };
          tb.B = { ...(tb.B || {}), forceGoodEvent: built.flagsAfter.B.forceGoodEvent, blackout: built.flagsAfter.B.blackout };
          changed = true;
        }

        const derived = deriveCurrentNextFromQueue(q);

        const updates: any = {
          members: mems,
          themePool: pool,
          deck,
          teamScores: ts,
          teamBuffs: tb,
          eventQueue: q,
          currentEvent: derived.currentEvent ?? pickEvent({}),
          nextEvent: derived.nextEvent,
          turnAbilityUsed: data.turnAbilityUsed ?? false,
        };

        if (changed) {
          updates.currentTurnIndex = idx;
          updates.logs = capLogs([...(data.logs || []), 'INIT FIX: patched missing fields']);
        }

        tx.update(ref, updates);
      });
    } catch (e) {
      console.error('initGameIfNeeded failed', e);
    } finally {
      initLockRef.current = false;
    }
  };

  // ===== Derived state =====
  const singerTeam: TeamId | null = currentSinger?.team ?? null;
  const enemyTeam: TeamId | null = singerTeam ? (singerTeam === 'A' ? 'B' : 'A') : null;

  // host can resolve; current singer can resolve
  const canControlTurn = isHost || currentSinger?.id === userId;

  // skills/ults only when current singer is you OR host controlling guest/offline
  const canOperateAbility =
    currentSinger?.id === userId || (isHost && (isGuestTurn || (currentSinger && offlineUsers.has(currentSinger.id))));

  const canUseSkill =
    !!currentSinger &&
    !!currentSinger.role &&
    canOperateAbility &&
    !turnAbilityUsed &&
    (currentSinger.role.skillUses ?? 0) > 0 &&
    currentEvent?.id !== 'silence';

  const canUseUlt =
    !!currentSinger &&
    !!currentSinger.role &&
    canOperateAbility &&
    !turnAbilityUsed &&
    (currentSinger.role.ultUses ?? 0) > 0 &&
    currentEvent?.id !== 'silence';

  // candidates selection UI (oracle etc)
  const isHostOverrideSelecting =
    isHost && currentSinger?.candidates?.length > 0 && currentSinger?.id !== userId;

  const displayCandidates: ThemeCard[] | null =
    isHostOverrideSelecting ? currentSinger.candidates : myMember?.candidates || null;

  const selectionOwner = isHostOverrideSelecting ? currentSinger : myMember;
  const isSelectingMission = !!displayCandidates && displayCandidates.length > 0;

  // current singer locked until picks their mission if needed
  const isCurrentSingerLocked = !!currentSinger?.candidates && currentSinger.candidates.length > 0;

  const currentChallenge = currentSinger?.challenge || { title: 'お題準備中...', criteria: '...' };
  const currentEventData = currentEvent
    ? (() => {
        const ui = eventUi(currentEvent);
        return ui ? { name: currentEvent.name, desc: currentEvent.desc, ...ui } : null;
      })()
    : null;

  // ===== Role Info target =====
  const roleInfoTarget = useMemo(() => {
    if (!myMember) return null;
    if (isHost && isGuestTurn) return currentSinger;
    return myMember;
  }, [myMember, isHost, isGuestTurn, currentSinger]);

  // ===== Effects chips (視覚化) =====
  const activeEffects = useMemo(() => {
    const chips: string[] = [];
    const serial = turnSerial ?? 0;

    const addTeam = (t: TeamId) => {
      const tb = teamBuffs?.[t] || {};
      if ((tb.nextSuccessBonus ?? 0) > 0) chips.push(`T${t} NEXT +${tb.nextSuccessBonus}`);
      if ((tb.roarRemaining ?? 0) > 0) chips.push(`T${t} ROAR x${tb.roarRemaining}`);
      if ((tb.barrierUntil ?? -1) > serial) chips.push(`T${t} BARRIER ${tb.barrierUntil - serial}T`);
      if (tb.forceGoodEvent) chips.push(`T${t} NEXT GOOD`);
      if (tb.blackout) chips.push(`T${t} NEXT BAD`);
    };

    addTeam('A');
    addTeam('B');

    if (currentSinger?.role?.id === 'maestro' && (currentSinger.combo ?? 0) > 0) chips.push(`COMBO x${currentSinger.combo}`);
    if (turnAbilityUsed) chips.push('ABILITY USED');

    const b = currentSinger?.buffs || {};
    const d = currentSinger?.debuffs || {};
    if (b.crescendo) chips.push('CRESCENDO');
    if (b.encore) chips.push('ENCORE');
    if (b.doubleDown) chips.push('DOUBLE DOWN');
    if (b.jackpot) chips.push('JACKPOT');
    if (b.spotlight) chips.push('SPOTLIGHT');
    if (b.safe) chips.push('SAFE');
    if (b.clutchDebt) chips.push('DEBT');
    if (b.echo) chips.push('ECHO');
    if (d.marked) chips.push('MARKED');

    return chips;
  }, [teamBuffs, turnSerial, currentSinger, turnAbilityUsed]);

  // ===== Targets for ability modal (only valid targets) =====
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
          <div className="text-[11px] font-mono tracking-widest text-white/40">（SUCCESS/FAILは確認なし）</div>
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

        tx.update(ref, {
          members: mems,
          logs: capLogs([...(data.logs || []), `PICK: ${target.name} -> ${cardTitle(cand)}`]),
        });
      });
    } finally {
      setBusy(false);
      if (isProxy) setProxyTarget(null);
    }
  };

  // ===== Ability use (with confirmations) =====
  const requestUseSkill = () => {
    if (!currentSinger?.role) return;
    if (!canUseSkill) return;

    const rid: RoleId = currentSinger.role.id;

    if (rid === 'ironwall') return setTargetModal({ title: 'INTERCEPT: 味方を選択', mode: 'ally', action: 'ironwall_intercept' });
    if (rid === 'coach') return setTargetModal({ title: 'TIMEOUT: 味方を選択', mode: 'ally', action: 'coach_timeout' });
    if (rid === 'saboteur') return setTargetModal({ title: 'MARK: 敵を選択', mode: 'enemy', action: 'saboteur_mark' });
    if (rid === 'oracle') return setTargetModal({ title: 'REROLL: 味方を選択', mode: 'ally', action: 'oracle_reroll' });

    const def = roleDef(rid);
    setConfirmState({
      title: 'CONFIRM SKILL',
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{def?.name || 'ROLE'}</span> の <span className="font-black text-cyan-300">SKILL</span> を発動しますか？
          </div>
          <div className="text-[12px] text-white/70 leading-relaxed">
            {def?.skill}
          </div>
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

    if (rid === 'mimic') {
      return setTargetModal({ title: 'STEAL ROLE: 敵ロールを選択', mode: 'enemy', action: 'mimic_steal' });
    }

    const def = roleDef(rid);
    setConfirmState({
      title: 'CONFIRM ULT',
      body: (
        <div className="space-y-3">
          <div className="text-white/80">
            <span className="font-black">{def?.name || 'ROLE'}</span> の <span className="font-black text-yellow-300">ULT</span> を発動しますか？
          </div>
          <div className="text-[12px] text-white/70 leading-relaxed">
            {def?.ult}
          </div>
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

  const requestConfirmTarget = (action: TargetModalState['action'], targetId: string) => {
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
      : action === 'saboteur_mark' ? 'MARK'
      : action === 'oracle_reroll' ? 'REROLL'
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
                <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">TEAM {target.team} ・ {target.role?.name || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      ),
      confirmText: 'ACTIVATE',
      onConfirm: async () => {
        setConfirmState(null);
        if (action === 'ironwall_intercept') await applyAbility({ kind: 'skill', targetId });
        else if (action === 'coach_timeout') await applyAbility({ kind: 'skill', targetId });
        else if (action === 'saboteur_mark') await applyAbility({ kind: 'skill', targetId });
        else if (action === 'oracle_reroll') await applyAbility({ kind: 'skill', targetId });
        else if (action === 'mimic_steal') {
          const stolen: RoleId | undefined = target?.role?.id;
          if (!stolen) return;
          await applyAbility({ kind: 'ult', stolenRoleId: stolen });
        }
      },
    });
  };

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
            role: m.role ? { ...m.role, skillUses: m.role.skillUses ?? 2, ultUses: m.role.ultUses ?? 1 } : null,
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
        if (data.currentEvent?.id === 'silence') return;

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

        let q = normalizeEventQueue(data.eventQueue);
        if (!isEventQueueAligned(q, mems, idx)) {
          const built = buildEventQueue(mems, idx, teamBuffsTx);
          q = built.queue;
          teamBuffsTx.A = { ...(teamBuffsTx.A || {}), forceGoodEvent: built.flagsAfter.A.forceGoodEvent, blackout: built.flagsAfter.A.blackout };
          teamBuffsTx.B = { ...(teamBuffsTx.B || {}), forceGoodEvent: built.flagsAfter.B.forceGoodEvent, blackout: built.flagsAfter.B.blackout };
        }

        const logPush: string[] = [];

        // Skills
        if (kind === 'skill') {
          if (r === 'maestro') {
            singer.buffs.crescendo = true;
            logPush.push(`SKILL: ${singer.name} CRESCENDO`);
          } else if (r === 'showman') {
            singer.buffs.encore = true;
            logPush.push(`SKILL: ${singer.name} ENCORE`);
          } else if (r === 'gambler') {
            singer.buffs.doubleDown = true;
            logPush.push(`SKILL: ${singer.name} DOUBLE DOWN`);
          } else if (r === 'underdog') {
            const ts = data.teamScores || computeTeamScores(mems);
            const losing = (ts[t] ?? 0) < (ts[et] ?? 0);
            if (losing) {
              data.teamScores = { ...ts, [t]: (ts[t] ?? 0) + 2000 };
              singer.buffs.clutchDebt = true;
              logPush.push(`SKILL: ${singer.name} CLUTCH +2000 (debt if fail)`);
            } else {
              logPush.push(`SKILL: ${singer.name} CLUTCH (not losing)`);
            }
          } else if (r === 'hype') {
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), nextSuccessBonus: (teamBuffsTx[t]?.nextSuccessBonus ?? 0) + 1000 };
            logPush.push(`SKILL: ${singer.name} CHANT (+1000 next ally success)`);
          } else if (r === 'mimic') {
            singer.buffs.echo = true;
            logPush.push(`SKILL: ${singer.name} ECHO (copy 50% last delta)`);
          } else if (r === 'ironwall') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.intercept = { by: singer.id };
            logPush.push(`SKILL: ${singer.name} INTERCEPT -> ${target.name}`);
          } else if (r === 'coach') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== t) return;
            target.buffs.safe = true;
            logPush.push(`SKILL: ${singer.name} TIMEOUT -> ${target.name} (SAFE)`);
          } else if (r === 'saboteur') {
            const targetId = opts.targetId;
            if (!targetId) return;
            const target = mems.find((m: any) => m.id === targetId);
            if (!target || target.team !== et) return;
            target.debuffs.marked = { byTeam: t, byPlayer: singer.id };
            logPush.push(`SKILL: ${singer.name} MARK -> ${target.name}`);
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
            logPush.push(`SKILL: ${singer.name} REROLL -> ${target.name}`);
          }
        }

        // Ults
        if (kind === 'ult') {
          if (r === 'maestro') {
            const combo = singer.combo ?? 0;
            const gain = combo * 800;
            const ts = data.teamScores || computeTeamScores(mems);
            data.teamScores = { ...ts, [t]: (ts[t] ?? 0) + gain };
            singer.combo = 0;
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), nextSuccessBonus: (teamBuffsTx[t]?.nextSuccessBonus ?? 0) + 500 };
            logPush.push(`ULT: ${singer.name} FINALE (+${gain} team, +500 next success)`);
          } else if (r === 'showman') {
            singer.buffs.spotlight = true;
            logPush.push(`ULT: ${singer.name} SPOTLIGHT armed`);
          } else if (r === 'ironwall') {
            const serial = data.turnSerial ?? 0;
            const readyCount = mems.filter((m: any) => isReadyForTurn(m)).length || mems.length || 6;
            const expire = serial + readyCount;
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), barrierUntil: expire, barrierOwner: singer.id };
            logPush.push(`ULT: ${singer.name} BARRIER`);
          } else if (r === 'coach') {
            const ts = data.teamScores || computeTeamScores(mems);
            data.teamScores = { ...ts, [t]: (ts[t] ?? 0) + 2500 };
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), blackout: false };
            logPush.push(`ULT: ${singer.name} MORALE (+2500 team, cleanse)`);
          } else if (r === 'oracle') {
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), forceGoodEvent: true };
            const applied = applyForcedEventToQueue(q, mems, idx, t, 'good');
            if (applied) {
              teamBuffsTx[t].forceGoodEvent = false;
              logPush.push(`ULT: ${singer.name} FATE SHIFT -> queued GOOD`);
            } else {
              logPush.push(`ULT: ${singer.name} FATE SHIFT (pending)`);
            }
          } else if (r === 'mimic') {
            const stolen = opts.stolenRoleId;
            if (!stolen) return;
            singer.buffs.stolenSkill = stolen;
            logPush.push(`ULT: ${singer.name} STEAL ROLE -> ${stolen}`);
          } else if (r === 'hype') {
            const teamCount = mems.filter((m: any) => m.team === t && isReadyForTurn(m)).length;
            teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), roarRemaining: (teamBuffsTx[t]?.roarRemaining ?? 0) + teamCount };
            logPush.push(`ULT: ${singer.name} ROAR`);
          } else if (r === 'saboteur') {
            teamBuffsTx[et] = { ...(teamBuffsTx[et] || {}), blackout: true };
            const applied = applyForcedEventToQueue(q, mems, idx, et, 'bad');
            if (applied) {
              teamBuffsTx[et].blackout = false;
              logPush.push(`ULT: ${singer.name} BLACKOUT -> queued BAD`);
            } else {
              logPush.push(`ULT: ${singer.name} BLACKOUT (pending)`);
            }
          } else if (r === 'underdog') {
            const ts = data.teamScores || computeTeamScores(mems);
            const diff = Math.abs((ts.A ?? 0) - (ts.B ?? 0));
            const steal = clamp(roundToStep(diff * 0.2, 100), 0, 4000);
            data.teamScores = { ...ts, [t]: (ts[t] ?? 0) + steal, [et]: (ts[et] ?? 0) - steal };
            logPush.push(`ULT: ${singer.name} REVERSAL (steal ${steal})`);
          } else if (r === 'gambler') {
            singer.buffs.jackpot = true;
            logPush.push(`ULT: ${singer.name} JACKPOT armed`);
          }
        }

        const fx: AbilityFx = {
          timestamp: Date.now(),
          kind: kind === 'ult' ? 'ULT' : 'SKILL',
          actorName: singer.name,
          roleName: singer.role?.name || 'ROLE',
          team: singer.team,
        };

        const derived = deriveCurrentNextFromQueue(q);

        tx.update(ref, {
          members: mems,
          teamBuffs: teamBuffsTx,
          teamScores: data.teamScores || computeTeamScores(mems),
          turnAbilityUsed: true,
          eventQueue: q,
          currentEvent: derived.currentEvent ?? data.currentEvent ?? pickEvent({}),
          nextEvent: derived.nextEvent,
          abilityFx: fx,
          logs: capLogs([...(data.logs || []), ...logPush]),
        });
      });
    } finally {
      setBusy(false);
    }
  };

  // ===== Resolve result (SUCCESS/FAIL: confirmなし) =====
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
            role: m.role ? { ...m.role, skillUses: m.role.skillUses ?? 2, ultUses: m.role.ultUses ?? 1 } : null,
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

        const ts = data.teamScores || computeTeamScores(mems);
        const teamBuffsTx = data.teamBuffs || { A: {}, B: {} };

        let q = normalizeEventQueue(data.eventQueue);
        if (!isEventQueueAligned(q, mems, idx) || q[0]?.forSingerId !== singer.id) {
          const built = buildEventQueue(mems, idx, teamBuffsTx);
          q = built.queue;
          teamBuffsTx.A = { ...(teamBuffsTx.A || {}), forceGoodEvent: built.flagsAfter.A.forceGoodEvent, blackout: built.flagsAfter.A.blackout };
          teamBuffsTx.B = { ...(teamBuffsTx.B || {}), forceGoodEvent: built.flagsAfter.B.forceGoodEvent, blackout: built.flagsAfter.B.blackout };
        }

        const ev: GameEvent | null = q[0] ? (stripNextEvent(q[0]) as GameEvent) : (data.currentEvent || null);

        let selfDelta = isSuccess ? BASE_SUCCESS : BASE_FAIL;
        let teamDelta = 0;
        let enemyTeamDelta = 0;

        let allyPicked: any = null;
        let allyDelta = 0;

        const logPush: string[] = [];
        logPush.push(`RESULT: ${singer.name} ${isSuccess ? 'SUCCESS' : 'FAIL'} (TEAM ${t})`);

        // ===== Event effects =====
        if (ev) {
          if (ev.id === 'crowd_favor') {
            if (isSuccess) teamDelta += 800;
          } else if (ev.id === 'duet_link') {
            if (isSuccess) {
              const allies = mems.filter((m: any) => m.team === t && m.id !== singer.id && isReadyForTurn(m));
              if (allies.length > 0) {
                allyPicked = allies[Math.floor(Math.random() * allies.length)];
                allyDelta = 400;
                allyPicked.score = (allyPicked.score ?? 0) + allyDelta;
                logPush.push(`EVENT: DUET LINK -> ally +400 (${allyPicked.name})`);
              } else {
                logPush.push(`EVENT: DUET LINK (no ally)`);
              }
            }
          } else if (ev.id === 'steal_spot') {
            if (isSuccess) enemyTeamDelta -= 500;
          } else if (ev.id === 'pressure') {
            if (!isSuccess) selfDelta -= 800;
          } else if (ev.id === 'risk_high') {
            if (isSuccess) selfDelta += 2000;
            else selfDelta -= 1500;
          } else if (ev.id === 'comeback') {
            const losing = (ts[t] ?? 0) < (ts[et] ?? 0);
            if (losing && isSuccess) selfDelta += 1200;
          } else if (ev.id === 'mirror') {
            if (isSuccess) teamDelta += roundToStep(selfDelta * 0.2, 100);
          } else if (ev.id === 'overtime') {
            if (isSuccess) teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), nextSuccessBonus: (teamBuffsTx[t]?.nextSuccessBonus ?? 0) + 400 };
          } else if (ev.id === 'scramble') {
            if (isSuccess) teamBuffsTx[et] = { ...(teamBuffsTx[et] || {}), nextSuccessBonus: 0 };
          }
        }

        const rid: RoleId | undefined = singer.role?.id;

        // MARK (saboteur)
        if (isSuccess && singer.debuffs?.marked) {
          const byTeam: TeamId = singer.debuffs.marked.byTeam;
          selfDelta = 0;
          if (byTeam === et) enemyTeamDelta += 800;
          singer.debuffs.marked = null;
          logPush.push(`MARK TRIGGERED: ${singer.name} success nulled`);
        }

        // MIMIC passive
        if (rid === 'mimic' && isSuccess) {
          const last = teamBuffsTx[t]?.lastTeamDelta ?? 0;
          if (last > 0) {
            const bonus = roundToStep(last * 0.3, 100);
            selfDelta += bonus;
            logPush.push(`MIMIC PASSIVE +${bonus}`);
          }
        }

        if (rid === 'showman' && isSuccess) selfDelta += 800;
        if (rid === 'saboteur' && isSuccess) enemyTeamDelta -= 300;

        if (rid === 'maestro') {
          if (isSuccess) {
            const nextCombo = clamp((singer.combo ?? 0) + 1, 0, 5);
            singer.combo = nextCombo;
            const bonus = 250 * nextCombo;
            selfDelta += bonus;
            logPush.push(`COMBO x${nextCombo} (+${bonus})`);
          } else {
            singer.combo = 0;
            selfDelta -= 1000;
            logPush.push(`COMBO BROKEN (-1000)`);
          }
        }

        // GAMBLER passive
        if (rid === 'gambler' && isSuccess) {
          const b = rndInt(0, 6) * 500;
          selfDelta += b;
          logPush.push(`GAMBLER +${b}`);
        }

        // ===== Armed buffs =====
        if (singer.buffs?.crescendo) {
          if (isSuccess) selfDelta += 1500;
          else selfDelta -= 1500;
          singer.buffs.crescendo = false;
          logPush.push(`CRESCENDO ${isSuccess ? '+1500' : '-1500'}`);
        }
        if (singer.buffs?.encore) {
          if (isSuccess) selfDelta += 1200;
          singer.buffs.encore = false;
          logPush.push(`ENCORE ${isSuccess ? '+1200' : '+0'}`);
        }
        if (singer.buffs?.doubleDown) {
          if (isSuccess) selfDelta = selfDelta * 2;
          else selfDelta -= 2000;
          singer.buffs.doubleDown = false;
          logPush.push(`DOUBLE DOWN ${isSuccess ? 'x2' : '-2000'}`);
        }
        if (singer.buffs?.jackpot) {
          if (isSuccess) {
            const coin = Math.random() < 0.5 ? 'HEAD' : 'TAIL';
            if (coin === 'HEAD') selfDelta += 6000;
            else selfDelta -= 3000;
            logPush.push(`JACKPOT ${coin === 'HEAD' ? '+6000' : '-3000'}`);
          } else {
            logPush.push(`JACKPOT MISS`);
          }
          singer.buffs.jackpot = false;
        }
        if (singer.buffs?.spotlight) {
          if (isSuccess) enemyTeamDelta -= 2000;
          else selfDelta -= 1000;
          singer.buffs.spotlight = false;
          logPush.push(`SPOTLIGHT ${isSuccess ? 'enemy -2000' : 'self -1000'}`);
        }

        // MIMIC skill ECHO
        if (singer.buffs?.echo) {
          const lastTurn = data.lastTurnDelta ?? 0;
          const add = roundToStep(lastTurn * 0.5, 100);
          selfDelta += add;
          singer.buffs.echo = false;
          logPush.push(`ECHO +${add} (from last ${lastTurn})`);
        }

        // stolen skill mapping
        if (singer.buffs?.stolenSkill) {
          const stolen: RoleId = singer.buffs.stolenSkill;
          if (stolen === 'showman') singer.buffs.encore = true;
          else if (stolen === 'maestro') singer.buffs.crescendo = true;
          else if (stolen === 'gambler') singer.buffs.doubleDown = true;
          else if (stolen === 'hype') teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), nextSuccessBonus: (teamBuffsTx[t]?.nextSuccessBonus ?? 0) + 1000 };
          else selfDelta += isSuccess ? 800 : 0;
          singer.buffs.stolenSkill = null;
          logPush.push(`STEAL ROLE applied: ${stolen}`);
        }

        if (!isSuccess && singer.buffs?.clutchDebt) {
          selfDelta -= 1500;
          singer.buffs.clutchDebt = false;
          logPush.push(`CLUTCH DEBT -1500`);
        }

        if (!isSuccess && singer.buffs?.safe) {
          teamDelta += 300;
          singer.buffs.safe = false;
          logPush.push(`SAFE TRIGGER +300 team`);
        }

        // INTERCEPT: transfer half of negative to tank
        if (selfDelta < 0 && singer.buffs?.intercept?.by) {
          const byId = singer.buffs.intercept.by;
          const tank = mems.find((m: any) => m.id === byId);
          if (tank) {
            const transferred = roundToStep(Math.abs(selfDelta) * 0.5, 100);
            selfDelta = 0;
            tank.score = (tank.score ?? 0) - transferred;
            logPush.push(`INTERCEPT: -${transferred} -> ${tank.name}`);
          }
          singer.buffs.intercept = null;
        }

        // team bonus
        if (isSuccess && (teamBuffsTx[t]?.nextSuccessBonus ?? 0) > 0) {
          const b = teamBuffsTx[t].nextSuccessBonus;
          selfDelta += b;
          teamBuffsTx[t].nextSuccessBonus = 0;
          logPush.push(`TEAM BONUS +${b}`);
        }

        // roar
        if (isSuccess && (teamBuffsTx[t]?.roarRemaining ?? 0) > 0) {
          selfDelta += 500;
          teamBuffsTx[t].roarRemaining = Math.max(0, (teamBuffsTx[t].roarRemaining ?? 0) - 1);
          logPush.push(`ROAR +500 (remain ${teamBuffsTx[t].roarRemaining})`);
        }

        // barrier / ironwall reduction (team negative effects only)
        const serial = data.turnSerial ?? 0;
        const barrierActive = (teamBuffsTx[t]?.barrierUntil ?? -1) > serial;
        const ironwallActive = mems.some((m: any) => m.team === t && m.role?.id === 'ironwall');

        if (teamDelta < 0) {
          if (barrierActive) {
            teamDelta = 0;
            logPush.push(`BARRIER BLOCKED team negative`);
          } else if (ironwallActive) {
            const reduced = roundToStep(teamDelta * 0.7, 100);
            logPush.push(`IRONWALL reduced team negative ${teamDelta} -> ${reduced}`);
            teamDelta = reduced;
          }
        }

        if (enemyTeamDelta < 0) {
          const enemyBarrier = (teamBuffsTx[et]?.barrierUntil ?? -1) > serial;
          const enemyIronwall = mems.some((m: any) => m.team === et && m.role?.id === 'ironwall');
          if (enemyBarrier) {
            enemyTeamDelta = 0;
            logPush.push(`ENEMY BARRIER BLOCKED enemy negative`);
          } else if (enemyIronwall) {
            const reduced = roundToStep(enemyTeamDelta * 0.7, 100);
            logPush.push(`ENEMY IRONWALL reduced enemy negative ${enemyTeamDelta} -> ${reduced}`);
            enemyTeamDelta = reduced;
          }
        }

        singer.score = (singer.score ?? 0) + selfDelta;

        const resultTS = { A: ts.A ?? 0, B: ts.B ?? 0 };
        resultTS[t] += selfDelta + teamDelta + allyDelta;
        resultTS[et] += enemyTeamDelta;

        if (isSuccess) teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), lastTeamDelta: selfDelta };
        else teamBuffsTx[t] = { ...(teamBuffsTx[t] || {}), lastTeamDelta: teamBuffsTx[t]?.lastTeamDelta ?? 0 };

        const lastTurnDelta = selfDelta;

        const nextIndex = findNextReadyIndex(mems, idx);
        const nextSingerLocal = mems[nextIndex] || singer;


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

        let qNext = q.slice(1);

        const appendEv = pickEventForTeam(teamBuffsTx, singer.team);
        consumeEventFlagsIfAny(teamBuffsTx, singer.team);
        qNext.push({ ...appendEv, forSingerId: singer.id });

        if (!isEventQueueAligned(qNext, mems, nextIndex)) {
          const built2 = buildEventQueue(mems, nextIndex, teamBuffsTx);
          qNext = built2.queue;
          teamBuffsTx.A = { ...(teamBuffsTx.A || {}), forceGoodEvent: built2.flagsAfter.A.forceGoodEvent, blackout: built2.flagsAfter.A.blackout };
          teamBuffsTx.B = { ...(teamBuffsTx.B || {}), forceGoodEvent: built2.flagsAfter.B.forceGoodEvent, blackout: built2.flagsAfter.B.blackout };
        }

        const auraRes = computeStartAuras(mems, nextSingerLocal, resultTS);
        const finalTS = auraRes.teamScores;

        const nextSerial = serial + 1;

        const nextLogs = capLogs([
          ...(data.logs || []),
          ...logPush,
          `TURN START: ${nextSingerLocal?.name || '???'} (TEAM ${nextSingerLocal?.team || '?'})`,
        ]);

        const title = `${isSuccess ? 'SUCCESS' : 'FAIL'} / ${ev?.name || 'NO EVENT'}`;
        const detailLines: string[] = [];
        const diffA = (resultTS.A ?? 0) - (ts.A ?? 0);
        const diffB = (resultTS.B ?? 0) - (ts.B ?? 0);

        detailLines.push(`TEAM A: ${diffA >= 0 ? '+' : ''}${diffA}`);
        detailLines.push(`TEAM B: ${diffB >= 0 ? '+' : ''}${diffB}`);
        detailLines.push(`${singer.name}: ${selfDelta >= 0 ? '+' : ''}${selfDelta}`);

        if (allyPicked && allyDelta !== 0) detailLines.push(`ALLY +${allyDelta}`);
        if (auraRes.auraAdd !== 0) detailLines.push(`NOTE AURA +${auraRes.auraAdd} (next)`);

        const derived = deriveCurrentNextFromQueue(qNext);

        tx.update(ref, {
          members: mems,
          teamScores: finalTS,
          teamBuffs: teamBuffsTx,
          currentTurnIndex: nextIndex,
          turnSerial: nextSerial,
          eventQueue: qNext,
          currentEvent: derived.currentEvent ?? pickEvent({}),
          nextEvent: derived.nextEvent,
          deck,
          themePool: pool,
          logs: nextLogs,
          turnAbilityUsed: false,
          lastTurnDelta,
          lastLog: { timestamp: Date.now(), title, detail: detailLines.join('\n') },
        });
      });
    } finally {
      setBusy(false);
    }
  };

  // ===== End game =====
  const endGame = async () => {
    if (!roomId || !isHost) return;
    await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' });
    navigate('/team-result');
  };

  // ===== UI data =====
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

  const eventMap = useMemo(() => {
    const mp = new Map<string, GameEvent>();
    for (const it of eventQueue) {
      const ev = stripNextEvent(it);
      if (ev && typeof it.forSingerId === 'string') mp.set(it.forSingerId, ev);
    }
    return mp;
  }, [eventQueue]);

  const getEventForMember = (memberId: string) => {
    const ev = eventMap.get(memberId) || null;
    if (ev) return ev;
    if (currentSinger?.id === memberId) return currentEvent || null;
    if (nextEvent?.forSingerId === memberId) return stripNextEvent(nextEvent);
    return null;
  };

  // ========= Render =========
  if (!roomData) {
    return <div className="h-screen w-full flex items-center justify-center text-white">LOADING...</div>;
  }

  return (
    <div className="w-full h-[100dvh] text-white overflow-hidden flex flex-col md:flex-row relative bg-[#0f172a]">
      <Toast messages={messages} onRemove={removeToast} />

      {/* Turn result overlay */}
      <AnimatePresence>
        {activeActionLog && <ActionOverlay actionLog={activeActionLog} onClose={clearActionLog} />}
      </AnimatePresence>

      {/* Skill/Ult overlay */}
      <AnimatePresence>
        {abilityFx && <AbilityFxOverlay fx={abilityFx} onDone={clearAbilityFx} />}
      </AnimatePresence>

      {/* Confirm modal (選択系) */}
      <ConfirmModal state={confirmState} busy={busy} onClose={() => !busy && setConfirmState(null)} />

      <RuleGrimoireModal isOpen={showGuideModal} onClose={() => setShowGuideModal(false)} />

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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setProxyTarget(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-[250] w-full max-w-4xl flex flex-col items-center gap-2 md:gap-4 h-full md:justify-center pointer-events-auto"
            >
              <div className="flex-none text-center">
                <h2 className="text-2xl md:text-5xl font-black text-yellow-400 italic tracking-tighter drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">
                  DESTINY CHOICE
                </h2>
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
                      <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">
                        OPTION {idx + 1}
                      </div>
                      <h3 className="font-bold text-white text-base md:text-xl leading-tight break-all">{cardTitle(cand)}</h3>
                      <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5">{cardCriteria(cand)}</p>
                    </motion.button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setProxyTarget(null)}
                className="mt-2 px-8 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-gray-400 font-bold text-xs tracking-widest"
              >
                CANCEL PROXY
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LOG drawer */}
      <AnimatePresence>
        {showLogsDrawer && (
          <div className="fixed inset-0 z-[210] flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowLogsDrawer(false)}
            />
            <motion.div
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: 'spring', damping: 25, stiffness: 260 }}
              className="relative w-[92vw] max-w-[420px] h-full bg-black/70 backdrop-blur-xl border-l border-white/10 p-4 flex flex-col"
            >
              <div className="flex items-center justify-between">
                <div className="font-black tracking-widest">BATTLE LOG</div>
                <button
                  onClick={() => setShowLogsDrawer(false)}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                {logs.slice().reverse().map((l: string, i: number) => (
                  <div key={`${l}-${i}`} className="text-[11px] text-white/70 leading-relaxed border-l border-white/10 pl-3">
                    {l}
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-white/10 text-[10px] font-mono tracking-widest text-white/40">
                ROOM: {roomId}
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
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#0f172a] border border-orange-500/50 rounded-2xl shadow-[0_0_50px_rgba(249,115,22,0.3)] p-1 z-50"
            >
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
                  <button
                    onClick={handleForceLeave}
                    className="w-full py-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold tracking-widest text-xs"
                  >
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
              <motion.p
                key={currentSinger?.id || 'none'}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-white font-black leading-none truncate drop-shadow-md text-base md:text-[clamp(1.2rem,3vw,2.6rem)]"
              >
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
              onClick={() => setShowGuideModal(true)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 hover:bg-cyan-900/30 hover:border-cyan-500 transition-all active:scale-95"
              title="RULE"
            >
              📖
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
              <button
                onClick={() => setShowFinishModal(true)}
                className="hidden md:flex px-4 py-2 rounded-xl border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs font-black tracking-widest"
              >
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
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex-none px-2 md:px-6 py-3 border-b border-white/10 bg-black/20"
            >
              <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono tracking-widest text-white/40">
                    ROLE INFO {isHost && isGuestTurn ? '(GUEST TURN)' : ''}
                  </div>
                  <button onClick={() => setShowRoleInfo(false)} className="text-xs text-white/50 hover:text-white">CLOSE</button>
                </div>

                <div className="mt-2 p-3 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {roleDef(roleInfoTarget.role.id)?.sigil || '🎭'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black truncate">{roleInfoTarget.role.name}</div>
                      <div className="text-[10px] font-mono tracking-widest text-white/40 truncate">
                        FOR: {roleInfoTarget.name}
                      </div>
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
              <motion.div
                key="selection-ui"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="relative z-20 w-full max-w-4xl flex flex-col items-center gap-2 md:gap-4 h-full md:justify-center"
              >
                <div className="flex-none text-center pt-2 md:pt-0">
                  <h2 className="text-2xl md:text-5xl font-black text-yellow-400 italic tracking-tighter drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">
                    DESTINY CHOICE
                  </h2>

                  {isHostOverrideSelecting ? (
                    <p className="text-[10px] md:text-sm font-bold text-red-400 tracking-widest mt-1 bg-red-900/50 px-3 py-1 rounded-full border border-red-500 animate-pulse">
                      HOST OVERRIDE / FOR: {selectionOwner.name}
                    </p>
                  ) : (
                    <p className="text-[10px] md:text-sm font-bold text-white tracking-widest mt-1">
                      お題を選択してください（{selectionOwner.name}）
                    </p>
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
                        <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold border border-yellow-500/30 px-2 py-0.5 rounded uppercase">
                          OPTION {idx + 1}
                        </div>
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
                eventData={currentEventData}
                stateText={isCurrentSingerLocked ? 'CHOOSING THEME...' : null}
              />
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
                <p className="text-gray-400 font-mono text-[10px] md:text-base tracking-widest animate-pulse">
                  WAITING FOR RESULT...
                </p>
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

        {/* Mobile List */}
        <div className="md:hidden w-full bg-black/80 backdrop-blur-md border-t border-white/10 p-1.5 pb-4 flex flex-col gap-1 flex-none">
          <div className="flex justify-between items-center px-1">
            <span className="text-[8px] font-bold text-gray-500 tracking-widest">RESERVATION LIST</span>
            {isHost && (
              <button
                onClick={() => setShowFinishModal(true)}
                className="text-[8px] text-red-400 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-900/30"
              >
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
              const cardEvent = getEventForMember(member.id);

              return (
                <div
                  key={member.id}
                  className={`snap-start flex-none w-40 bg-white/5 border ${
                    isCurrent ? 'border-cyan-500 bg-cyan-900/20' : 'border-white/10'
                  } rounded-lg p-2 flex flex-col gap-1 relative overflow-hidden ${isOffline ? 'grayscale opacity-70' : ''}`}
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

                  {cardEvent && (
                    <div className="mb-0.5">
                      <TurnEventChip ev={cardEvent} highlight={isCurrent} />
                    </div>
                  )}

                  <div className="text-[8px] text-cyan-200 font-bold truncate leading-tight">
                    {cardTitle(challenge)}
                  </div>
                  <div className="text-[7px] text-gray-400 font-mono truncate">
                    {cardCriteria(challenge)}
                  </div>

                  {needsSelection(member) && (
                    <div className="mt-1 text-[7px] font-bold text-yellow-300 border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 rounded-full w-fit">
                      CHOOSE
                    </div>
                  )}

                  {isOffline && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-red-500 font-bold backdrop-blur-[1px]">
                      OFFLINE
                    </div>
                  )}

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

      {/* Desktop List */}
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

            const cardEvent = getEventForMember(member.id);

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
                <div className="absolute top-0 right-0 bg-white/10 px-2 py-0.5 rounded-bl-lg text-[9px] font-mono text-gray-400">
                  {isCurrent ? 'NOW' : 'UPCOMING'}
                </div>

                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center text-lg">
                    {member.avatar}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm truncate ${isCurrent ? 'text-white' : 'text-gray-300'}`}>{member.name}</span>
                      {isGuest && <span className="text-[9px] bg-purple-600 text-white px-1.5 rounded font-bold">GUEST</span>}
                      {needsSelection(member) && (
                        <span className="text-[9px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-1.5 rounded font-bold">
                          CHOOSE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={`font-bold ${member.team === 'A' ? 'text-cyan-300' : member.team === 'B' ? 'text-red-300' : 'text-gray-500'}`}>
                        TEAM {member.team || '?'}
                      </span>
                      <span className="text-gray-500">|</span>
                      <span className="text-cyan-200">{(member.score || 0).toLocaleString()} pt</span>
                    </div>
                  </div>

                  {isOffline && <span className="ml-auto text-[9px] bg-red-900 text-red-300 px-1 rounded">OFFLINE</span>}

                  {canProxy(member) && (
                    <button
                      onClick={() => setProxyTarget(member)}
                      className="ml-auto px-3 py-1.5 rounded bg-yellow-400 text-black font-black text-[10px] animate-pulse border-2 border-yellow-200 shadow-[0_0_10px_yellow] hover:scale-110 transition-transform z-10 flex items-center gap-1"
                    >
                      ⚡ PROXY
                    </button>
                  )}
                </div>

                <div className="bg-black/40 rounded-lg p-2 border-l-2 border-cyan-500/50">
                  {cardEvent && (
                    <div className="mb-2">
                      <TurnEventChip ev={cardEvent} highlight={isCurrent} />
                    </div>
                  )}

                  <p className={`text-[10px] font-bold leading-tight mb-1 ${isCurrent ? 'text-cyan-200' : 'text-gray-300'}`}>
                    {cardTitle(challenge)}
                  </p>
                  <div className="flex items-center gap-1 opacity-80">
                    <span className="w-1 h-1 rounded-full bg-red-400" />
                    <p className="text-[9px] text-gray-400 font-mono leading-tight">
                      {cardCriteria(challenge)}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div className="h-4" />
        </div>

        {isHost && (
          <div className="p-4 pb-8 md:pb-10 border-t border-white/10 bg-black/40 flex-none">
            <button
              onClick={() => setShowFinishModal(true)}
              className="w-full py-3 md:py-4 rounded-xl border-2 border-red-500/30 text-red-400 font-bold tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2 group text-sm"
            >
              GAME FINISH
            </button>
          </div>
        )}
      </div>

      {/* Finish Modal */}
      <AnimatePresence>
        {showFinishModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowFinishModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1"
            >
              <div className="bg-black/40 rounded-xl p-8 flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-3xl">
                  🏁
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest mb-2">FINISH GAME?</h2>
                  <p className="text-gray-400 text-sm font-mono">ゲームを終了して結果発表へ移動しますか？</p>
                </div>
                <div className="flex w-full gap-3 mt-2">
                  <button
                    onClick={() => setShowFinishModal(false)}
                    className="flex-1 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-sm transition-colors"
                  >
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
  const cls =
    team === 'A'
      ? 'border-cyan-500/30 text-cyan-100 bg-cyan-500/10'
      : 'border-red-500/30 text-red-100 bg-red-500/10';

  return (
    <div className={`px-3 py-1.5 rounded-2xl border ${cls} min-w-[86px] text-center`}>
      <div className="text-[9px] font-mono tracking-widest opacity-70">TEAM {team}</div>
      <div className={`text-lg md:text-xl font-black tracking-tight ${leader ? 'drop-shadow-[0_0_18px_rgba(250,204,21,0.25)]' : ''}`}>
        {score.toLocaleString()}
      </div>
    </div>
  );
};

export default GamePlayTeamScreen;