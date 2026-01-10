import type { AbilityContext, AbilityResult, PassiveContext, PassiveResult } from './types';

/**
 * Gambler PASSIVE: RNG bonus (success: 0-1000, fail: 0 to -1000, step 100)
 */
export const handleGamblerPassive = (ctx: PassiveContext): PassiveResult => {
  const { singer, isSuccess, notes } = ctx;

  const clampFlag = !!singer.buffs?.gamblerSkillClampPassive;
  const step = 100;
  const steps = 11; // 0-1000 or 0 to -1000

  if (isSuccess) {
    const bonus = step * Math.floor(Math.random() * steps); // 0-1000
    return {
      scoreDelta: bonus,
      reason: 'GAMBLER PASSIVE (RNG bonus)',
    };
  } else {
    const raw = -step * Math.floor(Math.random() * steps); // 0 to -1000
    const applied = clampFlag && raw < 0 ? 0 : raw;

    if (clampFlag && raw < 0) {
      notes.push(`NOTE GAMBLER SKILL: PASSIVE clamp (${raw} -> 0)`);
    }

    return {
      scoreDelta: applied,
      reason: 'GAMBLER PASSIVE (RNG penalty)',
    };
  }
};

/**
 * Gambler SKILL: DOUBLE DOWN (success x2 / fail -2000) + passive clamp
 */
export const handleGamblerSkill = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.doubleDown = true;
  singer.buffs.gamblerSkillClampPassive = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`SKILL GAMBLER: DOUBLE DOWN armed (success x2 / fail -2000) + passive clamp`],
  };
};

/**
 * Gambler ULT: Coinflip armed (+5000 / -1000)
 */
export const handleGamblerUlt = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.gamblerUlt = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`ULT GAMBLER: coinflip armed (+5000 / -1000)`],
  };
};
