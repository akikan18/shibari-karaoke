import React, { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { useWakeLock } from '../hooks/useWakeLock';
import { planStartAuras, normalizeTeamBuffs } from '../game/team-battle/scoring';

// --------------------
// Role Definitions (Updated)
// --------------------
type RoleDef = {
  id: string;
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
    ult: 'ULT：(1回) 指定した味方は「次のターン成功」になる',
  },
  {
    id: 'oracle',
    name: 'ORACLE',
    type: 'TEC',
    sigil: '⟁',
    passive: '自分のターンはお題3択。',
    skill: 'SKILL：(3回) 自分or味方のお題を引き直し（3択で1番目は現在のお題）',
    ult: 'ULT：(1回) 次のターンの相手チームのお題を全員分引き直す（3択：1番目は現在のお題）',
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
    ult: 'ULT：(1回) 次のターン、敵チームの特殊効果をリセットしパッシブ、スキル、ウルトを無効化',
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
    skill: 'SKILL：(3回) 成功×2 / 失敗-2000。スキル中はPASSIVEがマイナスでも0に止まる。',
    ult: 'ULT：(1回) 表なら +5000 ／ 裏なら -1000。',
  },
];

// --------------------
// ROLES (UI Meta)
// --------------------
const ROLE_UI_META = [
  {
    id: 'maestro',
    tone: 'from-cyan-500/30 to-blue-600/10',
    desc: '旋律を支配する絶対王者。ミス無き演奏が、天井知らずのスコアを叩き出す。',
  },
  {
    id: 'showman',
    tone: 'from-yellow-500/30 to-orange-600/10',
    desc: '舞台を沸かすエンターテイナー。堅実な稼ぎと、ここ一番の爆発力を併せ持つ。',
  },
  {
    id: 'ironwall',
    tone: 'from-emerald-500/25 to-cyan-500/10',
    desc: 'チームの盾となる守護神。たとえ歌が崩れても、その鉄壁は揺るがない。',
  },
  {
    id: 'coach',
    tone: 'from-purple-500/25 to-pink-500/10',
    desc: '勝利の方程式を描く指揮官。個人の技量に関わらず、チーム全体を底上げする。',
  },
  {
    id: 'oracle',
    tone: 'from-indigo-500/25 to-cyan-500/10',
    desc: '運命をハックする預言者。お題選びやイベントを操作し、盤面を支配する。',
  },
  {
    id: 'mimic',
    tone: 'from-slate-500/25 to-zinc-500/10',
    desc: '変幻自在のトリックスター。他者の才能を模倣し、己の力として還元する。',
  },
  {
    id: 'hype',
    tone: 'from-rose-500/25 to-red-600/10',
    desc: '会場のボルテージを上げる着火剤。歌唱力関係なし、勢いだけで場を制す。',
  },
  {
    id: 'saboteur',
    tone: 'from-red-500/20 to-orange-500/10',
    desc: '影から崩す攪乱工作員。敵のペースを乱し、知らぬ間に勝利を奪い取る。',
  },
  {
    id: 'underdog',
    tone: 'from-amber-500/20 to-yellow-500/10',
    desc: '逆境でこそ輝く反逆者。点差が開くほど牙を研ぎ、土壇場で全てを覆す。',
  },
  {
    id: 'gambler',
    tone: 'from-teal-500/20 to-emerald-500/10',
    desc: 'スリルを愛する勝負師。丁か半か、その歌声ですべての運命を賭ける。',
  },
] as const;

export const ROLES = ROLE_DEFS.map((def) => {
  const ui = ROLE_UI_META.find((m) => m.id === def.id);
  return {
    ...def,
    tone: ui?.tone ?? 'from-white/10 to-white/5',
    desc: ui?.desc ?? '',
  };
}) as const;

// --------------------
// Animation Configuration
// --------------------
const pageVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const cardContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delayChildren: 0.5, staggerChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { y: 20, opacity: 0, scale: 0.95 },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 120, damping: 15 },
  },
};

// --------------------
// Main Component
// --------------------
export const TeamDraftScreen = () => {
  const navigate = useNavigate();
  useWakeLock();

  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [isHost, setIsHost] = useState(false);

  const [members, setMembers] = useState<any[]>([]);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [currentPickIndex, setCurrentPickIndex] = useState(0);

  const [roleModal, setRoleModal] = useState<any | null>(null);
  const [isPickingBusy, setIsPickingBusy] = useState(false);
  const [showMobileTeams, setShowMobileTeams] = useState(false);

  // 遷移アニメーション管理
  const [isTransitioning, setIsTransitioning] = useState(false);

  // チーム内歌唱順編集フェーズ
  const [isOrderEditing, setIsOrderEditing] = useState(false);
  const [orderEditBusy, setOrderEditBusy] = useState(false);

  // ★ ランダムピック関連State
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [randomTargetRole, setRandomTargetRole] = useState<any>(null);

  // Load User & Room Data
  useEffect(() => {
    const stored = localStorage.getItem('shibari_user_info');
    if (!stored) {
      navigate('/');
      return;
    }
    const userInfo = JSON.parse(stored);
    setRoomId(userInfo.roomId);
    setUserId(userInfo.userId);
    setIsHost(!!userInfo.isHost);

    const unsub = onSnapshot(doc(db, 'rooms', userInfo.roomId), (snap) => {
      if (!snap.exists()) return;
      const data: any = snap.data();

      setMembers(data.members || []);
      if (data.currentPickIndex !== undefined) setCurrentPickIndex(data.currentPickIndex);
      if (Array.isArray(data.draftOrder)) setDraftOrder(data.draftOrder);

      // draft完了後：playing直前に歌唱順編集を挟む
      if (data.mode === 'team' && data.status === 'order_edit') {
        setIsOrderEditing(true);
      } else {
        setIsOrderEditing(false);
      }

      // ステータスが playing になったら演出を開始
      if (data.status === 'playing' && data.mode === 'team') {
        setIsTransitioning(true);
        setIsOrderEditing(false);
      }

      // ホストのみドラフト順生成
      if (
        userInfo.isHost &&
        (!data.draftOrder || data.draftOrder.length === 0) &&
        (data.members?.length ?? 0) > 0
      ) {
        generateDraftOrder(data.members, userInfo.roomId);
      }
    });

    return () => unsub();
  }, [navigate]);

  // 演出完了後の遷移処理
  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => {
        navigate('/game-play-team');
      }, 9000);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, navigate]);

  const generateDraftOrder = async (currentMembers: any[], targetRoomId: string) => {
    const sortByTurn = (a: any, b: any) => (a.turnOrder ?? 9999) - (b.turnOrder ?? 9999);
    const teamA = currentMembers.filter((m) => m.team === 'A').sort(sortByTurn);
    const teamB = currentMembers.filter((m) => m.team === 'B').sort(sortByTurn);

    const order: string[] = [];
    let aIdx = 0,
      bIdx = 0;
    const pattern = ['A', 'B', 'B', 'A']; // Snake Draft
    let pIdx = 0;

    while (aIdx < teamA.length || bIdx < teamB.length) {
      const t = pattern[pIdx % pattern.length];
      if (t === 'A' && aIdx < teamA.length) order.push(teamA[aIdx++].id);
      else if (t === 'B' && bIdx < teamB.length) order.push(teamB[bIdx++].id);
      else {
        if (aIdx < teamA.length) order.push(teamA[aIdx++].id);
        if (bIdx < teamB.length) order.push(teamB[bIdx++].id);
      }
      pIdx++;
    }

    await updateDoc(doc(db, 'rooms', targetRoomId), { draftOrder: order, currentPickIndex: 0 });
  };

  // Derived Values
  const currentPickerId = draftOrder[currentPickIndex];
  const canPick = currentPickerId === userId || isHost;
  const currentPickerMember = members.find((m) => m.id === currentPickerId);

  const teamA = useMemo(
    () => members.filter((m) => m.team === 'A').sort((a, b) => (a.turnOrder ?? 999) - (b.turnOrder ?? 999)),
    [members]
  );
  const teamB = useMemo(
    () => members.filter((m) => m.team === 'B').sort((a, b) => (a.turnOrder ?? 999) - (b.turnOrder ?? 999)),
    [members]
  );

  const myMember = useMemo(() => members.find((m) => m.id === userId), [members, userId]);

  const takenRoleMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of members) {
      if (m.role?.id) map.set(m.role.id, m);
    }
    return map;
  }, [members]);

  // --- Action: Random Pick Trigger ---
  const triggerRandomPick = () => {
    if (!canPick || isPickingBusy || isRandomizing || isOrderEditing) return;
    
    // 空いているロールを取得
    const availableRoles = (ROLES as any[]).filter(r => !takenRoleMap.has(r.id));
    if (availableRoles.length === 0) return;

    // ランダム決定
    const target = availableRoles[Math.floor(Math.random() * availableRoles.length)];
    
    // 演出開始
    setRandomTargetRole(target);
    setIsRandomizing(true);
    setRoleModal(null); // モーダルが開いていたら閉じる
  };

  // ランダム演出完了後のコールバック
  const onRandomAnimationComplete = () => {
    if (randomTargetRole) {
      handleSelectRole(randomTargetRole.id);
    }
    setIsRandomizing(false);
    setRandomTargetRole(null);
  };

  // --- Action: Role Pick (Core Logic) ---
  const handleSelectRole = async (roleId: string) => {
    if (!roomId || isPickingBusy) return;
    setIsPickingBusy(true);

    try {
      const roleData = (ROLES as any[]).find((r) => r.id === roleId);
      if (!roleData) return;

      await runTransaction(db, async (tx) => {
        const roomRef = doc(db, 'rooms', roomId);
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;

        const data: any = snap.data();
        const mems = data.members || [];
        const order = data.draftOrder || [];
        const pickIndex = data.currentPickIndex ?? 0;
        const pickerId = order[pickIndex];

        const ok = pickerId === userId || isHost;
        if (!ok) return;

        const already = mems.some((m: any) => m.role?.id === roleId);
        if (already) return;

        const ultHasDash = typeof roleData.ult === 'string' && roleData.ult.includes('—');
        const newMembers = mems.map((m: any) => {
          if (m.id === pickerId) {
            return {
              ...m,
              role: {
                ...roleData,
                skillUses: 3,
                ultUses: ultHasDash ? 0 : 1,
              },
            };
          }
          return m;
        });

        const nextIndex = pickIndex + 1;
        const finished = nextIndex >= order.length;

        tx.update(roomRef, {
          members: newMembers,
          currentPickIndex: nextIndex,
          status: finished ? 'order_edit' : 'drafting',
        });
      });

      setRoleModal(null);
    } finally {
      setIsPickingBusy(false);
    }
  };

  // --- Action: Team Singing Order Edit ---
  const canEditTeamOrder = (team: 'A' | 'B') => {
    if (!isOrderEditing) return false;
    if (orderEditBusy) return false;
    if (isHost) return true;
    return myMember?.team === team;
  };

  const applyTeamOrder = async (team: 'A' | 'B', orderedIds: string[]) => {
    if (!roomId) return;
    setOrderEditBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const roomRef = doc(db, 'rooms', roomId);
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;

        const data: any = snap.data();
        if (data.mode !== 'team') return;
        if (data.status !== 'order_edit') return;

        const mems: any[] = data.members || [];
        const my = mems.find((m) => m.id === userId);

        if (!isHost && my?.team !== team) return;

        const teamMembers = mems
          .filter((m) => m.team === team)
          .slice()
          .sort((a, b) => (a.turnOrder ?? 999) - (b.turnOrder ?? 999));

        const slots = teamMembers.map((m) => m.turnOrder ?? 999).slice().sort((a, b) => a - b);

        const idSet = new Set(teamMembers.map((m) => m.id));
        const ok = orderedIds.length === teamMembers.length && orderedIds.every((id) => idSet.has(id));
        if (!ok) return;

        const slotById = new Map<string, number>();
        orderedIds.forEach((id, idx) => slotById.set(id, slots[idx] ?? (idx * 2)));

        const newMembers = mems.map((m) => {
          if (m.team !== team) return m;
          const newTurn = slotById.get(m.id);
          if (newTurn === undefined) return m;
          return { ...m, turnOrder: newTurn };
        });

        tx.update(roomRef, { members: newMembers });
      });
    } finally {
      setOrderEditBusy(false);
    }
  };

  const moveInTeam = async (team: 'A' | 'B', fromIndex: number, direction: -1 | 1) => {
    const list = (team === 'A' ? teamA : teamB).map((m) => m.id);
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= list.length) return;

    const next = list.slice();
    const [picked] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, picked);

    await applyTeamOrder(team, next);
  };

  const handleFinalizeOrder = async () => {
    if (!roomId) return;
    if (!isHost) return;
    if (orderEditBusy) return;

    setOrderEditBusy(true);
    try {
      await runTransaction(db, async (transaction) => {
        const roomRef = doc(db, 'rooms', roomId);
        const roomSnap = await transaction.get(roomRef);
        if (!roomSnap.exists()) return;

        const data = roomSnap.data();
        const members = Array.isArray(data.members) ? data.members : [];

        // Sort members by turn order to find first singer
        const sorted = members.slice().sort((a: any, b: any) => (a.turnOrder ?? 9999) - (b.turnOrder ?? 9999));
        const firstSinger = sorted[0];

        if (!firstSinger) {
          // No valid first singer, just update status
          transaction.update(roomRef, { status: 'playing' });
          return;
        }

        // Calculate turn-start effects for first turn using planStartAuras
        const teamBuffs = normalizeTeamBuffs(data.teamBuffs || { A: {}, B: {} });
        const currentTeamScores = data.teamScores || { A: 0, B: 0 };

        const auraPlans = planStartAuras(members, firstSinger, currentTeamScores, teamBuffs);

        let turnStartBonus = 0;
        const logs: string[] = [];

        for (const plan of auraPlans) {
          turnStartBonus += plan.delta;
          logs.push(`TURN START: ${plan.reason} ${plan.delta >= 0 ? '+' : ''}${plan.delta}`);
        }

        // Apply turn-start bonus to team score
        const team = firstSinger.team;
        const updatedTeamScores = {
          A: team === 'A' ? (currentTeamScores.A ?? 0) + turnStartBonus : currentTeamScores.A ?? 0,
          B: team === 'B' ? (currentTeamScores.B ?? 0) + turnStartBonus : currentTeamScores.B ?? 0,
        };

        transaction.update(roomRef, {
          status: 'playing',
          teamScores: updatedTeamScores,
          logs: [...(data.logs || []), ...logs],
        });
      });
    } finally {
      setOrderEditBusy(false);
    }
  };

  const isDraftFinished = useMemo(() => {
    return draftOrder.length > 0 && currentPickIndex >= draftOrder.length;
  }, [draftOrder.length, currentPickIndex]);

  // --------------------
  // Render
  // --------------------
  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="w-full h-[100dvh] flex flex-col relative overflow-hidden text-white bg-black font-sans selection:bg-cyan-500/30 transition-colors duration-1000"
    >
      {/* Background Effect */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20" />
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-purple-900/30 blur-[120px] rounded-full mix-blend-screen animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-red-900/30 blur-[120px] rounded-full mix-blend-screen animate-pulse delay-1000" />
      </div>

      {/* --- HEADER --- */}
      <header className="flex-none relative z-20 w-full bg-black/40 backdrop-blur-md border-b border-white/10 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <GlitchText
              text="ROLE DRAFT"
              className="text-xl md:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]"
            />
            <div className="flex items-center gap-2 mt-1.5 relative z-10">
              <span className="text-[10px] font-mono text-cyan-300/80 tracking-widest bg-cyan-950/50 border border-cyan-500/20 px-1.5 py-0.5 rounded-sm">
                PHASE: {isOrderEditing ? 'ORDER EDIT' : 'SELECTION'}
              </span>
              {isOrderEditing && (
                <span className="text-[10px] font-mono text-yellow-200/80 tracking-widest bg-yellow-950/30 border border-yellow-500/20 px-1.5 py-0.5 rounded-sm">
                  REORDER TEAM SINGERS
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[10px] font-mono text-white/50 tracking-widest">STATUS</span>
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-lg border transition-all duration-300 ${
                  isOrderEditing
                    ? 'bg-yellow-500/15 border-yellow-400/40 text-yellow-100 shadow-[0_0_15px_rgba(250,204,21,0.15)]'
                    : canPick
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                    : 'bg-white/5 border-white/10 text-white/50'
                }`}
              >
                {!isOrderEditing && canPick && <span className="animate-pulse text-[10px] mr-1">●</span>}
                <span className="text-xs md:text-sm font-bold tracking-wider">
                  {isOrderEditing
                    ? isHost
                      ? 'HOST: FIX ORDER'
                      : 'WAITING HOST...'
                    : canPick
                    ? currentPickerId === userId
                      ? 'YOUR TURN'
                      : 'PROXY OVERRIDE'
                    : `${currentPickerMember?.name || 'WAITING'}...`}
                </span>
              </div>
            </div>
            
            {/* ★ RANDOM PICK BUTTON (Only visible when it's user's turn) */}
            {!isOrderEditing && canPick && (
               <button
                 onClick={triggerRandomPick}
                 disabled={isPickingBusy || isRandomizing}
                 className="flex items-center gap-2 px-3 py-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/50 rounded-lg text-purple-200 text-[10px] font-bold tracking-widest shadow-[0_0_10px_rgba(168,85,247,0.3)] hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] transition-all active:scale-95"
               >
                 <span>🎲</span> RANDOM DECIDE
               </button>
            )}
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 relative z-10 w-full max-w-7xl mx-auto p-4 md:p-6 overflow-hidden flex flex-col md:flex-row gap-4 md:gap-6">
        {/* TEAM A (Left Sidebar - Cyan) */}
        <aside className="hidden md:flex flex-col w-64 bg-cyan-950/20 backdrop-blur-sm border border-cyan-500/20 rounded-2xl p-4 overflow-y-auto custom-scrollbar shadow-lg">
          <TeamHeader team="A" />
          <div className="mt-4 space-y-2">
            {teamA.map((m) => (
              <PlayerCard key={m.id} member={m} currentPickerId={currentPickerId} />
            ))}
          </div>
        </aside>

        {/* ROLES GRID (Center) */}
        <section className="flex-1 h-full min-h-0 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-2 md:p-6 overflow-y-auto custom-scrollbar shadow-inner relative">
          {/* Mobile: View Teams Button */}
          <div className="mb-4 flex items-center justify-between md:hidden">
            <span className="text-xs font-bold text-white/60 tracking-widest">AVAILABLE DATA</span>
            <button
              onClick={() => setShowMobileTeams(true)}
              className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-[10px] font-bold tracking-widest text-cyan-300 active:scale-95 transition-transform shadow-[0_0_10px_rgba(34,211,238,0.1)]"
            >
              VIEW ROSTER
            </button>
          </div>

          {(isDraftFinished || isOrderEditing) && (
            <div className="mb-4 p-3 rounded-xl border border-yellow-500/20 bg-yellow-950/20">
              <div className="text-[10px] font-mono tracking-widest text-yellow-200/80">NOTICE</div>
              <div className="text-xs text-white/70 mt-1 leading-relaxed">
                ドラフト完了後、ゲーム開始前に <span className="text-yellow-200 font-bold">チーム内の歌唱順</span> を調整できます。
              </div>
            </div>
          )}

          <motion.div
            variants={cardContainerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-20 md:pb-0"
          >
            {(ROLES as any[]).map((role) => {
              const takenBy = takenRoleMap.get(role.id);
              return (
                <RoleCard
                  key={role.id}
                  role={role}
                  takenBy={takenBy}
                  canPick={!isOrderEditing && canPick && !takenBy}
                  onClick={() => {
                    if (isOrderEditing) return;
                    setRoleModal(role);
                  }}
                />
              );
            })}
          </motion.div>
        </section>

        {/* TEAM B (Right Sidebar - Red) */}
        <aside className="hidden md:flex flex-col w-64 bg-red-950/20 backdrop-blur-sm border border-red-500/20 rounded-2xl p-4 overflow-y-auto custom-scrollbar shadow-lg">
          <TeamHeader team="B" />
          <div className="mt-4 space-y-2">
            {teamB.map((m) => (
              <PlayerCard key={m.id} member={m} currentPickerId={currentPickerId} />
            ))}
          </div>
        </aside>
      </main>

      {/* --- MOBILE FOOTER --- */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 z-30 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 pb-safe">
        <div className="px-4 py-2">
          <div className="text-[9px] font-mono text-white/40 mb-1 tracking-widest">DRAFT QUEUE</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {draftOrder.map((id, idx) => {
              const m = members.find((mem) => mem.id === id);
              if (!m) return null;
              const isActive = m.id === currentPickerId;
              const isDone = idx < currentPickIndex;
              const borderColor =
                m.team === 'A'
                  ? isActive
                    ? 'border-cyan-400 shadow-[0_0_10px_cyan]'
                    : 'border-cyan-500/30'
                  : isActive
                  ? 'border-red-400 shadow-[0_0_10px_red]'
                  : 'border-red-500/30';
              const activeText = m.team === 'A' ? 'text-cyan-300' : 'text-red-300';

              return (
                <div
                  key={`${id}-${idx}`}
                  className={`flex-none flex flex-col items-center w-14 transition-all ${
                    isActive ? 'scale-110 opacity-100' : isDone ? 'opacity-30 grayscale' : 'opacity-60'
                  }`}
                >
                  <div
                    className={`relative w-10 h-10 rounded-full flex items-center justify-center border-2 bg-black overflow-hidden ${borderColor}`}
                  >
                    {m.avatar}
                    {m.role && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px]">✓</div>}
                  </div>
                  <div className={`text-[9px] mt-1 font-bold truncate w-full text-center ${isActive ? activeText : 'text-white'}`}>
                    {m.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- MODALS --- */}

      <AnimatePresence>
        {showMobileTeams && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col p-4 pt-10"
          >
            <button onClick={() => setShowMobileTeams(false)} className="absolute top-4 right-4 text-white/50 p-2 text-2xl">
              &times;
            </button>
            <h2 className="text-xl font-black italic text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-red-300">
              DEPLOYMENT STATUS
            </h2>
            <div className="flex-1 overflow-y-auto space-y-6">
              <div>
                <TeamHeader team="A" />
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {teamA.map((m) => (
                    <PlayerCard key={m.id} member={m} currentPickerId={currentPickerId} />
                  ))}
                </div>
              </div>
              <div>
                <TeamHeader team="B" />
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {teamB.map((m) => (
                    <PlayerCard key={m.id} member={m} currentPickerId={currentPickerId} />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {roleModal && (
          <RoleDetailModal
            role={roleModal}
            onClose={() => setRoleModal(null)}
            onSelect={() => handleSelectRole(roleModal.id)}
            canPick={canPick && !isOrderEditing}
            isTaken={!!takenRoleMap.get(roleModal.id)}
            isBusy={isPickingBusy}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOrderEditing && (
          <TeamOrderEditOverlay
            teamA={teamA}
            teamB={teamB}
            canEditA={canEditTeamOrder('A')}
            canEditB={canEditTeamOrder('B')}
            isHost={isHost}
            isBusy={orderEditBusy}
            onMove={(team, idx, dir) => moveInTeam(team, idx, dir)}
            onFinalize={handleFinalizeOrder}
          />
        )}
      </AnimatePresence>

      {/* ★ RANDOM ROULETTE OVERLAY (NEW) */}
      <AnimatePresence>
        {isRandomizing && randomTargetRole && (
          <RandomRouletteOverlay
             availableRoles={(ROLES as any[]).filter(r => !takenRoleMap.has(r.id))}
             targetRole={randomTargetRole}
             onComplete={onRandomAnimationComplete}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{isTransitioning && <MatchupTransition teamA={teamA} teamB={teamB} />}</AnimatePresence>
    </motion.div>
  );
};

// --------------------
// Sub Components & Helpers
// --------------------

// ★ Random Roulette Overlay (New Component)
const RandomRouletteOverlay = ({ availableRoles, targetRole, onComplete }: { availableRoles: any[], targetRole: any, onComplete: () => void }) => {
  const [displayRole, setDisplayRole] = useState(availableRoles[0]);
  const [stage, setStage] = useState<'spinning' | 'locked'>('spinning');

  useEffect(() => {
    // 1. 高速回転
    let intervalId: any;
    let counter = 0;
    const spinDuration = 2000; // 2秒間回転
    const speed = 50; // 50msごとに切り替え

    intervalId = setInterval(() => {
       const nextIndex = counter % availableRoles.length;
       setDisplayRole(availableRoles[nextIndex]);
       counter++;
    }, speed);

    // 2. 確定演出
    const timeoutId = setTimeout(() => {
       clearInterval(intervalId);
       setDisplayRole(targetRole);
       setStage('locked');
       
       // 3. 完了通知（少し待ってから）
       setTimeout(onComplete, 1500); 
    }, spinDuration);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6"
    >
       <div className="text-[10px] font-mono tracking-[0.3em] text-cyan-400 mb-8 animate-pulse">SYSTEM SELECTING...</div>
       
       <div className="relative w-full max-w-sm aspect-square flex items-center justify-center">
          {/* Animated Rings */}
          <div className="absolute inset-0 border-2 border-cyan-500/20 rounded-full animate-[spin_3s_linear_infinite]" />
          <div className="absolute inset-4 border border-purple-500/20 rounded-full animate-[spin_5s_linear_infinite_reverse]" />
          
          <motion.div 
             key={displayRole.id}
             className="flex flex-col items-center"
             animate={stage === 'locked' ? { scale: [1, 1.2, 1], filter: ['brightness(1)', 'brightness(2)', 'brightness(1)'] } : {}}
             transition={{ duration: 0.3 }}
          >
             <div className={`w-32 h-32 md:w-48 md:h-48 rounded-3xl bg-gradient-to-br ${displayRole.tone} flex items-center justify-center text-6xl md:text-8xl shadow-[0_0_30px_rgba(255,255,255,0.2)] border border-white/20 mb-6 relative overflow-hidden`}>
                <span className="relative z-10">{displayRole.sigil}</span>
                {stage === 'locked' && <div className="absolute inset-0 bg-white/50 animate-ping" />}
             </div>
             <div className="text-3xl md:text-5xl font-black italic tracking-tighter text-white text-center drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
               {displayRole.name}
             </div>
             <div className="text-sm font-mono text-cyan-200 mt-2 tracking-widest bg-cyan-900/40 px-3 py-1 rounded border border-cyan-500/30">
               TYPE: {displayRole.type}
             </div>
          </motion.div>
       </div>

       {stage === 'locked' && (
         <motion.div 
           initial={{ y: 20, opacity: 0 }}
           animate={{ y: 0, opacity: 1 }}
           className="mt-12 text-2xl font-black italic text-yellow-400 tracking-widest"
         >
           LOCKED IN!
         </motion.div>
       )}
    </motion.div>
  );
};

const GlitchText = ({ text, className }: { text: string; className?: string }) => (
  <div className={`relative ${className}`}>
    <span className="relative z-10">{text}</span>
    <span
      className="absolute top-0 left-0 translate-x-[-1px] translate-y-[1px] text-cyan-500/50 animate-pulse pointer-events-none z-0 mix-blend-lighten"
      style={{ clipPath: 'inset(0 0 40% 0)' }}
    >
      {text}
    </span>
    <span
      className="absolute top-0 left-0 translate-x-[1px] translate-y-[-1px] text-red-500/50 animate-pulse delay-75 pointer-events-none z-0 mix-blend-lighten"
      style={{ clipPath: 'inset(60% 0 0 0)' }}
    >
      {text}
    </span>
  </div>
);

const HighlightedText = ({ text }: { text: string }) => {
  const parts = text.split(/([+＋]\d+(?:,\d+)*)|([-−▼]\d+(?:,\d+)*)|(\d+(?:,\d+)*[%％倍])|(×\s?\d+)|(【.*?】)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.match(/^[+＋]/))
          return (
            <span key={i} className="text-cyan-400 font-black text-sm mx-0.5 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
              {part}
            </span>
          );
        if (part.match(/^[-−▼]/))
          return (
            <span key={i} className="text-rose-400 font-black text-sm mx-0.5 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]">
              {part}
            </span>
          );
        if (part.match(/[%％倍]|×/))
          return (
            <span key={i} className="text-yellow-400 font-black text-sm mx-0.5 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">
              {part}
            </span>
          );
        if (part.match(/^【.*】$/))
          return (
            <span key={i} className="text-white font-bold tracking-wider mr-1">
              {part}
            </span>
          );
        return (
          <span key={i} className="text-white/80">
            {part}
          </span>
        );
      })}
    </span>
  );
};

const TeamHeader = ({ team }: { team: 'A' | 'B' }) => (
  <div className={`flex items-center justify-between border-b ${team === 'A' ? 'border-cyan-500/30' : 'border-red-500/30'} pb-2`}>
    <span
      className={`text-2xl font-black italic tracking-tighter ${
        team === 'A' ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]' : 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]'
      }`}
    >
      TEAM {team}
    </span>
    <span className="text-[10px] font-mono text-white/30">MEMBERS</span>
  </div>
);

const PlayerCard = ({ member, currentPickerId }: any) => {
  const picked = !!member.role;
  const isTurn = member.id === currentPickerId;
  const isTeamA = member.team === 'A';
  const borderColor = isTeamA ? 'group-hover:border-cyan-500/50' : 'group-hover:border-red-500/50';
  const activeBorder = isTeamA ? 'border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-red-400/50 shadow-[0_0_15px_rgba(248,113,113,0.1)]';
  const activeBg = isTeamA ? 'bg-cyan-950/40' : 'bg-red-950/40';

  return (
    <div
      className={`group relative flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-300
            ${isTurn ? `${activeBg} ${activeBorder}` : `bg-black/40 border-white/5 ${borderColor}`}
        `}
    >
      <div className="relative">
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-xl shadow-inner overflow-hidden">
          {member.avatar}
        </div>
        {isTurn && <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-bounce shadow-lg ${isTeamA ? 'bg-cyan-400' : 'bg-red-400'}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-bold truncate ${isTurn ? 'text-white' : 'text-white/70'}`}>{member.name}</div>
        <div className="text-[10px] font-mono text-white/40 truncate flex items-center gap-1">
          {picked ? <span className={isTeamA ? 'text-cyan-300' : 'text-red-300'}>{member.role.name}</span> : 'WAITING...'}
        </div>
      </div>
    </div>
  );
};

const RoleCard = ({ role, takenBy, canPick, onClick }: any) => {
  const isTaken = !!takenBy;
  return (
    <motion.button
      variants={cardVariants}
      whileHover={!isTaken ? { scale: 1.02, y: -2 } : {}}
      whileTap={!isTaken ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={`relative w-full text-left p-4 rounded-xl border transition-all duration-300 overflow-hidden flex flex-col h-full group
                ${isTaken ? 'bg-black/20 border-white/5 opacity-50 grayscale' : `bg-gradient-to-br ${role.tone} border-white/10 hover:border-white/40 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]`}
            `}
    >
      {!isTaken && <div className="absolute top-0 left-0 w-full h-[1px] bg-white/30 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />}

      <div className="flex items-start justify-between w-full mb-3 relative z-10">
        <div className="w-10 h-10 rounded-lg bg-black/30 backdrop-blur-md flex items-center justify-center text-xl border border-white/10 shadow-lg">
          {role.sigil}
        </div>
        <div className={`text-[9px] px-2 py-0.5 rounded border font-mono ${isTaken ? 'border-white/10 text-white/30' : 'border-cyan-400/30 text-cyan-200 bg-cyan-500/10'}`}>
          {role.type}
        </div>
      </div>

      <div className="mb-auto relative z-10">
        <h3 className="text-lg font-black italic leading-none tracking-tight mb-1">{role.name}</h3>
        <p className="text-[10px] text-white/50 line-clamp-2 leading-relaxed">{role.desc}</p>
      </div>

      {isTaken ? (
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 relative z-10">
          <div className="text-xs text-white/40">PICKED:</div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{takenBy.avatar}</span>
            <span className="text-[10px] font-bold truncate max-w-[80px]">{takenBy.name}</span>
          </div>
        </div>
      ) : (
        <div className={`mt-3 text-[10px] font-mono text-right relative z-10 ${canPick ? 'text-cyan-300 animate-pulse' : 'text-white/20'}`}>
          {canPick ? 'TAP TO SELECT >' : 'AVAILABLE'}
        </div>
      )}
    </motion.button>
  );
};

const RoleDetailModal = ({ role, onClose, onSelect, canPick, isTaken, isBusy }: any) => {
  const ultHasDash = typeof role.ult === 'string' && role.ult.includes('—');
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-lg" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative w-full max-w-lg bg-slate-900 border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header Graphic */}
        <div className={`h-32 bg-gradient-to-br ${role.tone} relative flex items-center px-6 overflow-hidden`}>
          <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-9xl italic leading-none select-none pointer-events-none transform rotate-12 translate-x-10 -translate-y-4">
            {role.type}
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur border border-white/20 flex items-center justify-center text-4xl shadow-xl">
              {role.sigil}
            </div>
            <div>
              <h2 className="text-3xl font-black italic tracking-tighter text-white drop-shadow-md">{role.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono tracking-widest text-cyan-200">
                  TYPE: {role.type}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/20 flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white transition-colors z-20">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-950/50">
          <p className="text-sm text-white/80 italic mb-6 leading-relaxed border-l-2 border-cyan-500/50 pl-3">"{role.desc}"</p>

          <div className="space-y-4">
            <SkillRow label="PASSIVE" desc={role.passive} color="text-yellow-200" />
            <SkillRow label="SKILL (3x)" desc={role.skill} color="text-cyan-200" />
            <SkillRow label={`ULTIMATE (${ultHasDash ? '0x' : '1x'})`} desc={role.ult} color="text-pink-300" />
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-white/10 bg-black/40 backdrop-blur">
          <button
            onClick={onSelect}
            disabled={!canPick || isTaken || isBusy}
            className={`w-full py-3.5 rounded-xl font-black text-sm tracking-[0.2em] transition-all flex items-center justify-center gap-2
                          ${
                            isTaken
                              ? 'bg-white/5 text-white/20 cursor-not-allowed'
                              : !canPick
                              ? 'bg-white/10 text-white/40 cursor-not-allowed'
                              : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] shadow-lg'
                          }
                        `}
          >
            {isBusy ? (
              <span className="animate-pulse">PROCESSING...</span>
            ) : isTaken ? (
              'ALREADY TAKEN'
            ) : canPick ? (
              <>
                CONFIRM SELECTION <span className="text-lg">→</span>
              </>
            ) : (
              'NOT YOUR TURN'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const SkillRow = ({ label, desc, color }: any) => (
  <div className="bg-white/5 rounded-xl p-3 border border-white/5 hover:bg-white/10 transition-colors">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-mono tracking-widest text-white/40">{label}</span>
      <span className={`text-[10px] font-bold ${color}`}>●</span>
    </div>
    <div className="text-xs leading-relaxed font-medium">
      <HighlightedText text={desc} />
    </div>
  </div>
);

// --------------------
// ★ TEAM ORDER EDIT OVERLAY
// --------------------
const TeamOrderEditOverlay = ({
  teamA,
  teamB,
  canEditA,
  canEditB,
  isHost,
  isBusy,
  onMove,
  onFinalize,
}: {
  teamA: any[];
  teamB: any[];
  canEditA: boolean;
  canEditB: boolean;
  isHost: boolean;
  isBusy: boolean;
  onMove: (team: 'A' | 'B', idx: number, dir: -1 | 1) => void;
  onFinalize: () => void;
}) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[180] bg-black/85 backdrop-blur-xl flex flex-col p-4 md:p-8">
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-4 h-full">
        {/* Title */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-yellow-200/70">PRE-GAME</div>
            <h2 className="text-2xl md:text-4xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-white drop-shadow-[0_0_25px_rgba(250,204,21,0.2)]">
              SET TEAM SINGING ORDER
            </h2>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="text-[10px] font-mono tracking-widest text-white/40">CONTROL</div>
            <div className="px-3 py-1 rounded-lg border border-yellow-500/20 bg-yellow-950/20 text-yellow-100 text-xs font-bold">
              {isHost ? 'HOST CAN START' : 'WAITING HOST TO START'}
            </div>
          </div>
        </div>

        {/* Lists */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamOrderPanel team="A" members={teamA} canEdit={canEditA} isBusy={isBusy} onMove={(idx, dir) => onMove('A', idx, dir)} />
          <TeamOrderPanel team="B" members={teamB} canEdit={canEditB} isBusy={isBusy} onMove={(idx, dir) => onMove('B', idx, dir)} />
        </div>

        {/* Footer */}
        <div className="flex-none flex items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="text-[10px] font-mono text-white/40">
            {isBusy ? 'SYNCING...' : 'READY'}
          </div>

          <button
            onClick={onFinalize}
            disabled={!isHost || isBusy}
            className={`px-6 py-3 rounded-xl font-black tracking-[0.2em] text-sm transition-all
              ${
                !isHost
                  ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/10'
                  : isBusy
                  ? 'bg-white/10 text-white/40 cursor-wait border border-white/10'
                  : 'bg-gradient-to-r from-yellow-500 to-orange-600 text-black hover:scale-[1.02] shadow-[0_0_25px_rgba(250,204,21,0.25)]'
              }`}
          >
            {isBusy ? 'PROCESSING...' : 'CONFIRM & START'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const TeamOrderPanel = ({
  team,
  members,
  canEdit,
  isBusy,
  onMove,
}: {
  team: 'A' | 'B';
  members: any[];
  canEdit: boolean;
  isBusy: boolean;
  onMove: (idx: number, dir: -1 | 1) => void;
}) => {
  const isA = team === 'A';
  return (
    <div
      className={`rounded-2xl border overflow-hidden flex flex-col min-h-0 ${
        isA ? 'border-cyan-500/20 bg-cyan-950/15' : 'border-red-500/20 bg-red-950/15'
      }`}
    >
      <div className={`px-4 py-3 border-b ${isA ? 'border-cyan-500/20 bg-cyan-950/30' : 'border-red-500/20 bg-red-950/30'}`}>
        <div className="flex items-center justify-between">
          <div className={`text-2xl font-black italic tracking-tighter ${isA ? 'text-cyan-300' : 'text-red-300'}`}>TEAM {team}</div>
          <div className={`text-[10px] font-mono tracking-widest ${canEdit ? 'text-yellow-200/80' : 'text-white/30'}`}>
            {canEdit ? 'EDIT ENABLED' : 'VIEW ONLY'}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {members.map((m, idx) => (
          <motion.div
            key={m.id}
            layout
            className={`flex items-center gap-3 rounded-xl border p-3 ${
              isA ? 'border-cyan-500/20 bg-black/40' : 'border-red-500/20 bg-black/40'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black border ${isA ? 'border-cyan-500/30 bg-cyan-950/40 text-cyan-200' : 'border-red-500/30 bg-red-950/40 text-red-200'}`}>
              {idx + 1}
            </div>
            <div className="text-2xl">{m.avatar}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white truncate">{m.name}</div>
              <div className={`text-[10px] font-mono truncate ${isA ? 'text-cyan-300/80' : 'text-red-300/80'}`}>
                {m.role?.name || 'NO ROLE'}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => onMove(idx, -1)}
                disabled={!canEdit || isBusy || idx === 0}
                className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all
                  ${
                    !canEdit || isBusy || idx === 0
                      ? 'bg-white/5 border-white/10 text-white/20 cursor-not-allowed'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/15 active:scale-95'
                  }`}
                title="UP"
              >
                ▲
              </button>
              <button
                onClick={() => onMove(idx, 1)}
                disabled={!canEdit || isBusy || idx === members.length - 1}
                className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all
                  ${
                    !canEdit || isBusy || idx === members.length - 1
                      ? 'bg-white/5 border-white/10 text-white/20 cursor-not-allowed'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/15 active:scale-95'
                  }`}
                title="DOWN"
              >
                ▼
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-white/10 bg-black/30">
        <div className="text-[10px] font-mono text-white/40">
          {canEdit ? 'Use ▲▼ to reorder (syncs instantly).' : 'Waiting for editor...'}
        </div>
      </div>
    </div>
  );
};

// ★★★ VS TRANSITION SCREEN (UPGRADED) ★★★
const MatchupTransition = ({ teamA, teamB }: { teamA: any[]; teamB: any[] }) => {
  const introDelay = 0.5;
  const step = 0.8;
  const teamBDelay = introDelay + teamA.length * step + 0.5;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black flex flex-col md:flex-row overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 mix-blend-overlay" />

      <motion.div
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.5, ease: 'circOut' }}
        className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white z-0 hidden md:block"
      />

      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
        <motion.div
          initial={{ scale: 5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', bounce: 0.5 }}
          className="text-8xl md:text-9xl font-black italic tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]"
        >
          VS
        </motion.div>
      </div>

      {/* TEAM A */}
      <div className="flex-1 relative flex flex-col justify-center items-center py-10 bg-gradient-to-br from-cyan-900/60 to-black border-b md:border-b-0 md:border-r border-cyan-500/30">
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="absolute top-10 left-0 right-0 text-center z-10">
          <h2 className="text-4xl md:text-6xl font-black italic text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]">TEAM A</h2>
        </motion.div>

        <div className="flex flex-col gap-4 z-10 w-full max-w-md px-6 mt-16">
          {teamA.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: introDelay + i * step, type: 'spring', stiffness: 100 }}
              className="relative bg-black/60 border border-cyan-500/50 p-3 rounded-xl flex items-center justify-between backdrop-blur-md overflow-hidden shadow-[0_0_15px_rgba(34,211,238,0.2)]"
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className="text-3xl">{m.avatar}</div>
                <div>
                  <div className="font-bold text-white text-lg">{m.name}</div>
                  <div className="text-xs font-mono text-cyan-300">{m.role?.name || '???'}</div>
                </div>
              </div>

              <motion.div
                initial={{ scale: 0, opacity: 0, rotate: -45 }}
                animate={{ scale: 1, opacity: 0.3, rotate: 0 }}
                transition={{ delay: introDelay + i * step + 0.2, type: 'spring', bounce: 0.6 }}
                className="absolute right-[-10px] top-[-10px] text-6xl text-cyan-400 font-bold"
              >
                {m.role?.sigil}
              </motion.div>

              <motion.div
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: introDelay + i * step + 0.1, type: 'spring' }}
                className="relative z-10 text-4xl text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]"
              >
                {m.role?.sigil}
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* TEAM B */}
      <div className="flex-1 relative flex flex-col justify-center items-center py-10 bg-gradient-to-tl from-red-900/60 to-black">
        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="absolute bottom-10 md:bottom-auto md:top-10 left-0 right-0 text-center z-10">
          <h2 className="text-4xl md:text-6xl font-black italic text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]">TEAM B</h2>
        </motion.div>

        <div className="flex flex-col gap-4 z-10 w-full max-w-md px-6 mb-16 md:mt-16 md:mb-0">
          {teamB.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: teamBDelay + i * step, type: 'spring', stiffness: 100 }}
              className="relative bg-black/60 border border-red-500/50 p-3 rounded-xl flex flex-row-reverse items-center justify-between backdrop-blur-md text-right overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            >
              <div className="flex flex-row-reverse items-center gap-4 relative z-10">
                <div className="text-3xl">{m.avatar}</div>
                <div>
                  <div className="font-bold text-white text-lg">{m.name}</div>
                  <div className="text-xs font-mono text-red-300">{m.role?.name || '???'}</div>
                </div>
              </div>

              <motion.div
                initial={{ scale: 0, opacity: 0, rotate: 45 }}
                animate={{ scale: 1, opacity: 0.3, rotate: 0 }}
                transition={{ delay: teamBDelay + i * step + 0.2, type: 'spring', bounce: 0.6 }}
                className="absolute left-[-10px] top-[-10px] text-6xl text-red-400 font-bold"
              >
                {m.role?.sigil}
              </motion.div>

              <motion.div
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: teamBDelay + i * step + 0.1, type: 'spring' }}
                className="relative z-10 text-4xl text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.8)]"
              >
                {m.role?.sigil}
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* FINAL */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 1] }}
        transition={{ delay: teamBDelay + teamB.length * step + 1.0, duration: 1.5 }}
        className="absolute inset-0 z-50 bg-black flex items-center justify-center"
      >
        <motion.h1
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="text-5xl md:text-8xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-red-500 tracking-widest drop-shadow-[0_0_50px_rgba(255,255,255,0.5)] text-center"
        >
          MISSION START
        </motion.h1>
      </motion.div>
    </motion.div>
  );
};
