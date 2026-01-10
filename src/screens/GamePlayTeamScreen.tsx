import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- Firebase ---
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { roomTransaction } from '../firebase/transactionHelper';

// --- Components & Hooks ---
import { Toast, useToast } from '../components/Toast';
import { usePresence } from '../hooks/usePresence';
import { useWakeLock } from '../hooks/useWakeLock';

// --- Game Logic & Types ---
import { ALL_ROLES, RoleId, TeamId, getRoleById, getDefaultRoleUses } from '../game/team-battle/roles';
import { LogKind, LogEntry, ScoreScope, ScoreChange } from '../game/team-battle/types';
import { normalizeMember, normalizeMembers, Member } from '../game/team-battle/memberUtils';
import {
  BASE_SUCCESS,
  BASE_FAIL,
  clamp,
  capLogs,
  capEntries,
  fmt,
  fmtChangeLine,
  iconOf,
  kindColorClass,
  formatTime,
} from '../game/team-battle/utils';
import {
  sortByTurn,
  computeTeamScores,
  isReadyForTurn,
  findNextReadyIndex,
  findFirstReadyIndex,
  normalizeTeamBuffs,
  planStartAuras,
} from '../game/team-battle/scoring';
import {
  ThemeCard,
  cardTitle,
  cardCriteria,
  normalizeThemePool,
  drawFromDeck,
  shuffle,
} from '../game/team-battle/theme';
import {
  hasIronwallPassive,
  mitigateNegative,
  applySingerDelta,
  applyTeamDelta,
  decrementBuffTurns,
  cleanupMemberDebuffs,
} from '../game/team-battle/resultProcessor';
import { getAbilityHandler, getPassiveHandler } from '../game/team-battle/abilities';

// --- UI Components ---
import { ActionOverlay } from '../components/team-battle/overlays/ActionOverlay';
import { AbilityFxOverlay, AbilityFx } from '../components/team-battle/overlays/AbilityFxOverlay';
import { ConfirmModal, ConfirmState } from '../components/team-battle/modals/ConfirmModal';
import { JoinTeamRoleModal } from '../components/team-battle/modals/JoinTeamRoleModal';
import { TargetModal, TargetModalState } from '../components/team-battle/modals/TargetModal';
import { GuideModal } from '../components/team-battle/modals/GuideModal';
import { OracleUltPickModal, OracleUltPickState, OracleUltPickItem } from '../components/team-battle/modals/OracleUltPickModal';
import { MissionDisplay } from '../components/team-battle/MissionDisplay';
import { ThemeSelectionGrid } from '../components/team-battle/ThemeSelectionGrid';


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
      await roomTransaction(roomId, async (data, ref, tx) => {
        if (data.status !== 'playing' || data.mode !== 'team') return;

        let changed = false;

        let mems = normalizeMembers(data.members || []);

        // Check if any member had missing role uses
        mems.forEach((m: any) => {
          const prevSkill = (data.members || []).find((orig: any) => orig.id === m.id)?.role?.skillUses;
          const prevUlt = (data.members || []).find((orig: any) => orig.id === m.id)?.role?.ultUses;
          if (m.role && (prevSkill === undefined || prevSkill === null || prevUlt === undefined || prevUlt === null)) {
            changed = true;
          }
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

  const canOperateAbility = isHost || currentSinger?.id === userId;


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
  const defaultsForCurrent = getDefaultRoleUses(currentRoleId);
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

    // ✅ FIX: MIMIC ULT付与の「共有パッシブ」表示
    if ((b.mimicPassiveTurns ?? 0) > 0) chips.push(`MIMIC PASSIVE (${b.mimicPassiveTurns}T)`);

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

    const canPick = isHost || targetMemberId === userId;

    if (!canPick && !(isHost && isHostOverrideSelecting)) return;

    setBusy(true);
    try {
      await roomTransaction(roomId, async (data, ref, tx) => {

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
      await roomTransaction(roomId, async (data, ref, tx) => {

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
    const def = getRoleById(roleId);
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
      await roomTransaction(roomId, async (data, ref, tx) => {

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
    const def = getRoleById(roleId);
    if (!def) return;

    setBusy(true);
    try {
      await roomTransaction(roomId, async (data, ref, tx) => {

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
        const uses = getDefaultRoleUses(def.id);
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

    const def = getRoleById(rid);
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

    // target ults
    if (rid === 'coach') return setTargetModal({ title: 'COACH ULT: 味方を選択', mode: 'ally', action: 'coach_ult' });

    // ✅ FIX: MIMIC ULTはターゲット不要（味方全員に次ターンMIMICパッシブ付与）
    const def = getRoleById(rid);
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

    const effectiveRoleName = getRoleById(rid)?.name || 'ROLE';

    const kind = action === 'coach_ult' ? 'ult' : 'skill';
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
        : 'HYPE BOOST';

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
        await applyAbility({ kind: kind as any, targetId });
      },
    });
  };

  // =========================
  // Ability Apply (transaction)
  // =========================
  const applyAbility = async (opts: { kind: 'skill' | 'ult'; targetId?: string }) => {
    if (!roomId || !currentSinger) return;

    setBusy(true);
    try {
      await roomTransaction(roomId, async (data, ref, tx) => {


        // ORACLE pickが既に動いている間は新規発動不可（事故防止）
        if (data.oracleUltPick?.active) return;

        const teamBuffsTx = normalizeTeamBuffs(data.teamBuffs || { A: {}, B: {} });

        let mems = normalizeMembers(data.members || []);

        let idx = data.currentTurnIndex ?? 0;
        if (idx >= mems.length) idx = 0;
        if (mems.length > 0 && !isReadyForTurn(mems[idx])) idx = findFirstReadyIndex(mems);

        const singer = mems[idx];
        if (!singer) return;
        if (!(singer.team === 'A' || singer.team === 'B')) return; // safety
        const t: TeamId = singer.team;
        const et: TeamId = t === 'A' ? 'B' : 'A';

        const canOperate = isHost || singer.id === userId;
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

        // ---- ABILITY HANDLING ----
        // Use handlers from abilities/
        const handler = getAbilityHandler(r, kind);
        if (handler) {
          const handlerResult = handler({
            singer,
            singerId: singer.id,
            team: t,
            enemyTeam: et,
            roleId: r,
            members: mems,
            teamBuffs: teamBuffsTx,
            teamScores: teamScoresTx,
            deck,
            pool,
            kind,
            targetId: opts.targetId,
            logs: pushLines,
            logEntries: entries,
            rerollThreeChoicesKeepFirst,
          });

          if (handlerResult.success === false) {
            // Handler returned failure (e.g., invalid target)
            return;
          }

          // Apply handler results
          if (handlerResult.members) {
            mems = handlerResult.members;
          }
          if (handlerResult.teamBuffs) {
            Object.assign(teamBuffsTx, handlerResult.teamBuffs);
          }
          if (handlerResult.teamScores) {
            Object.assign(teamScoresTx, handlerResult.teamScores);
          }
          if (handlerResult.deck) {
            deck = handlerResult.deck;
            deckChanged = true;
          }
          if (handlerResult.logs) {
            pushLines.push(...handlerResult.logs);
          }
          if (handlerResult.logEntries) {
            entries.push(...handlerResult.logEntries);
          }
          if (handlerResult.scoreChanges) {
            scoreChanges.push(...handlerResult.scoreChanges);
          }
          if ((handlerResult as any).oraclePickState !== undefined) {
            (data as any).__oraclePickState = (handlerResult as any).oraclePickState;
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
      await roomTransaction(roomId, async (data, ref, tx) => {


        // ORACLE pick中はターン進行禁止
        if (data.oracleUltPick?.active) return;

        const teamBuffsTx = normalizeTeamBuffs(data.teamBuffs || { A: {}, B: {} });

        let mems = normalizeMembers(data.members || []);

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
          // Use passive handlers
          if (rid) {
            const passiveHandler = getPassiveHandler(rid);
            if (passiveHandler) {
              const passiveResult = passiveHandler({
                singer,
                isSuccess: effectiveSuccess,
                sealed: sealedThisTurn,
                sabotaged: sabotageActive,
                team: t,
                enemyTeam: et,
                teamBuffs: teamBuffsTx,
                notes,
              });

              if (passiveResult.scoreDelta !== undefined && passiveResult.reason) {
                applySingerDelta(passiveResult.scoreDelta, passiveResult.reason);
              }
              if (passiveResult.enemyScoreDelta !== undefined && passiveResult.enemyReason) {
                applyTeamDelta(et, passiveResult.enemyScoreDelta, passiveResult.enemyReason);
              }
              if (passiveResult.notes) {
                notes.push(...passiveResult.notes);
              }
              if (passiveResult.singerUpdates) {
                Object.assign(singer, passiveResult.singerUpdates);
              }
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

        // ✅ FIX: MIMIC共有パッシブは「そのターン」で消費（成功/失敗、sealedでも消費）
        if ((singer.buffs?.mimicPassiveTurns ?? 0) > 0) {
          const next = Math.max(0, (singer.buffs.mimicPassiveTurns ?? 0) - 1);
          singer.buffs.mimicPassiveTurns = next;
          if (next === 0) singer.buffs.mimicPassiveTurns = null;
        }

        // Save lastTeamDelta for mimic passive (note: only on SUCCESS and not sealed)
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

              <ThemeSelectionGrid
                candidates={proxyTarget.candidates || []}
                onSelect={(cand) => requestPickCandidate(proxyTarget.id, cand, true)}
                disabled={busy || isOraclePickingActive}
              />

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

                <ThemeSelectionGrid
                  candidates={displayCandidates}
                  onSelect={(cand) => requestPickCandidate(selectionOwner.id, cand, false)}
                  disabled={busy || isOraclePickingActive}
                />
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

