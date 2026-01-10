import { clamp } from './utils';

export type ArmedBuffContext = {
  singer: any;
  effectiveSuccess: boolean;
  singerTurnDelta: number;
  notes: string[];
  applySingerDelta: (delta: number, reason: string) => void;
  applyTeamDelta: (team: string, delta: number, reason: string) => void;
  enemyTeam: string;
  lastTurnDelta?: number;
};

export type ArmedBuffResult = {
  shouldConsume: boolean;
  consumeValue?: any;
};

export type ArmedBuffHandler = (ctx: ArmedBuffContext) => ArmedBuffResult;

/**
 * MAESTRO SKILL: Armed buff handler
 */
export const handleMaestroSkillBuff: ArmedBuffHandler = (ctx) => {
  const { singer, effectiveSuccess, applySingerDelta, notes } = ctx;

  if (!effectiveSuccess) {
    applySingerDelta(-500, 'MAESTRO SKILL (fail -500)');
  } else {
    const before = singer.combo ?? 0;
    const after = clamp(before + 2, 0, 5);
    singer.combo = after;
    notes.push(`NOTE MAESTRO SKILL: COMBO +2 (x${before} -> x${after})`);
  }

  return { shouldConsume: true, consumeValue: false };
};

/**
 * SHOWMAN SKILL: Armed buff handler
 */
export const handleShowmanSkillBuff: ArmedBuffHandler = (ctx) => {
  const { effectiveSuccess, applySingerDelta } = ctx;

  if (effectiveSuccess) {
    applySingerDelta(500, 'SHOWMAN SKILL (+500 on success)');
  }

  return { shouldConsume: true, consumeValue: false };
};

/**
 * GAMBLER SKILL: Armed buff handler
 */
export const handleGamblerSkillBuff: ArmedBuffHandler = (ctx) => {
  const { singer, effectiveSuccess, applySingerDelta, singerTurnDelta } = ctx;

  if (effectiveSuccess) {
    const extra = singerTurnDelta;
    applySingerDelta(extra, 'GAMBLER SKILL (DOUBLE DOWN x2)');
  } else {
    applySingerDelta(-2000, 'GAMBLER SKILL (DOUBLE DOWN fail -2000)');
  }

  singer.buffs.gamblerSkillClampPassive = false;

  return { shouldConsume: true, consumeValue: false };
};

/**
 * GAMBLER ULT: Armed buff handler
 */
export const handleGamblerUltBuff: ArmedBuffHandler = (ctx) => {
  const { applySingerDelta } = ctx;

  const head = Math.random() < 0.5;
  const delta = head ? 5000 : -1000;
  applySingerDelta(delta, `GAMBLER ULT (coinflip ${head ? 'HEAD +5000' : 'TAIL -1000'})`);

  return { shouldConsume: true, consumeValue: false };
};

/**
 * SHOWMAN ULT: Armed buff handler
 */
export const handleShowmanUltBuff: ArmedBuffHandler = (ctx) => {
  const { effectiveSuccess, applyTeamDelta, enemyTeam } = ctx;

  if (effectiveSuccess) {
    applyTeamDelta(enemyTeam, -2000, 'SHOWMAN ULT (success enemy -2000)');
  }

  return { shouldConsume: true, consumeValue: false };
};

/**
 * MIMIC SKILL: Armed buff handler
 */
export const handleMimicSkillBuff: ArmedBuffHandler = (ctx) => {
  const { applySingerDelta, lastTurnDelta } = ctx;

  const lastTurn = lastTurnDelta ?? 0;
  const add = Math.round(lastTurn * 0.5);
  applySingerDelta(add, `MIMIC SKILL (ECHO 50% of last turn ${lastTurn >= 0 ? '+' : ''}${lastTurn})`);

  return { shouldConsume: true, consumeValue: false };
};

/**
 * HYPE SKILL: Armed buff handler
 */
export const handleHypeSkillBuff: ArmedBuffHandler = (ctx) => {
  const { singer, effectiveSuccess, applySingerDelta } = ctx;

  const turns = (singer.buffs.hypeSkill?.turns ?? 0) as number;
  if (effectiveSuccess) {
    applySingerDelta(500, 'HYPE SKILL (success +500)');
  }

  const next = Math.max(0, turns - 1);
  singer.buffs.hypeSkill.turns = next;

  return { shouldConsume: next === 0, consumeValue: null };
};

/**
 * COACH SKILL: Armed buff handler
 */
export const handleCoachSkillBuff: ArmedBuffHandler = (ctx) => {
  const { effectiveSuccess, applyTeamDelta, singer } = ctx;

  if (!effectiveSuccess) {
    applyTeamDelta(singer.team, +300, 'COACH SKILL (SAFE: team +300 on fail)');
  }

  return { shouldConsume: true, consumeValue: false };
};

/**
 * Registry of armed buff handlers
 */
export const armedBuffHandlers: Record<string, ArmedBuffHandler> = {
  maestroSkill: handleMaestroSkillBuff,
  showmanSkill: handleShowmanSkillBuff,
  gamblerSkill: handleGamblerSkillBuff,
  gamblerUlt: handleGamblerUltBuff,
  showmanUlt: handleShowmanUltBuff,
  mimicSkill: handleMimicSkillBuff,
  hypeSkill: handleHypeSkillBuff,
  coachSkill: handleCoachSkillBuff,
};

/**
 * Process all armed buffs for a singer
 */
export const processArmedBuffs = (
  singer: any,
  effectiveSuccess: boolean,
  singerTurnDelta: number,
  notes: string[],
  applySingerDelta: (delta: number, reason: string) => void,
  applyTeamDelta: (team: string, delta: number, reason: string) => void,
  enemyTeam: string,
  lastTurnDelta?: number
): void => {
  const ctx: ArmedBuffContext = {
    singer,
    effectiveSuccess,
    singerTurnDelta,
    notes,
    applySingerDelta,
    applyTeamDelta,
    enemyTeam,
    lastTurnDelta,
  };

  // Process each buff in order
  const buffsToProcess = [
    'maestroSkill',
    'showmanSkill',
    'gamblerSkill',
    'gamblerUlt',
    'showmanUlt',
    'mimicSkill',
    'hypeSkill',
    'coachSkill',
  ];

  for (const buffName of buffsToProcess) {
    if (singer.buffs?.[buffName]) {
      const handler = armedBuffHandlers[buffName];
      if (handler) {
        const result = handler(ctx);
        if (result.shouldConsume) {
          singer.buffs[buffName] = result.consumeValue ?? false;
        }
      }
    }
  }

  // Special handling for gamblerSkillClampPassive cleanup
  if (singer.buffs?.gamblerSkillClampPassive) {
    singer.buffs.gamblerSkillClampPassive = false;
  }
};
