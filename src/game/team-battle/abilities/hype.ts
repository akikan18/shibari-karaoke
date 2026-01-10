import type { AbilityContext, AbilityResult, TurnStartPassiveContext, TurnStartPassiveResult } from './types';
import { validateAllyTarget } from './helpers';

/**
 * Hype PASSIVE: +400 at self turn start
 */
export const handleHypeTurnStartPassive = (ctx: TurnStartPassiveContext): TurnStartPassiveResult | null => {
  const { nextSinger } = ctx;

  if (nextSinger.role?.id === 'hype') {
    return { delta: 400, reason: 'HYPE ENGINE PASSIVE' };
  }

  return null;
};

/**
 * Hype SKILL: Give ally +500 on success for next 2 turns
 */
export const handleHypeSkill = (ctx: AbilityContext): AbilityResult => {
  const { members, targetId, team, singer } = ctx;

  const target = validateAllyTarget(members, targetId, team);
  if (!target) {
    return { success: false, message: 'Invalid target for Hype SKILL' };
  }

  target.buffs.hypeBoost = { value: 500, turns: 2, by: singer.id };

  return {
    success: true,
    members,
    logs: [`SKILL HYPE: ${target.name} next 2 turns (success +500)`],
  };
};

/**
 * Hype ULT: Team-wide success bonus for 3 turns
 */
export const handleHypeUlt = (ctx: AbilityContext): AbilityResult => {
  const { team, teamBuffs } = ctx;

  const updatedTeamBuffs = {
    A: { ...(teamBuffs.A || {}) },
    B: { ...(teamBuffs.B || {}) },
  };
  updatedTeamBuffs[team] = { ...(teamBuffs[team] || {}), hypeUltTurns: 3 };

  return {
    success: true,
    members: ctx.members,
    teamBuffs: updatedTeamBuffs,
    logs: [`ULT HYPE: allies success +500 for 3 turns`],
  };
};
