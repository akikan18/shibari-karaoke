import { AbilityContext, AbilityResult } from './types';

/**
 * Ironwall SKILL: Next team turn negative -50%
 */
export const handleIronwallSkill = (ctx: AbilityContext): AbilityResult => {
  const { team, teamBuffs } = ctx;

  teamBuffs[team] = { ...(teamBuffs[team] || {}), negHalfTurns: 1, negZeroTurns: 0 };

  return {
    success: true,
    members: ctx.members,
    teamBuffs,
    logs: [`SKILL IRONWALL: next TEAM ${team} turn negative -50%`],
  };
};

/**
 * Ironwall ULT: Next team turn negative → 0
 */
export const handleIronwallUlt = (ctx: AbilityContext): AbilityResult => {
  const { team, teamBuffs } = ctx;

  teamBuffs[team] = { ...(teamBuffs[team] || {}), negZeroTurns: 1, negHalfTurns: 0 };

  return {
    success: true,
    members: ctx.members,
    teamBuffs,
    logs: [`ULT IRONWALL: next TEAM ${team} turn negative → 0`],
  };
};
