import type { AbilityContext, AbilityResult, ScoreModifierContext, ScoreModifierResult } from './types';

/**
 * Ironwall PASSIVE: -30% negative damage mitigation
 */
export const handleIronwallScoreModifier = (ctx: ScoreModifierContext): ScoreModifierResult => {
  const { team, delta, members, sealed } = ctx;

  // Only apply to negative deltas
  if (delta >= 0) {
    return { modifiedDelta: delta };
  }

  // Check if Ironwall is on the team and not sealed
  const ironwall = members.find((m) => m.team === team && m.role?.id === 'ironwall');
  if (!ironwall || sealed) {
    return { modifiedDelta: delta };
  }

  // Apply -30% mitigation
  const mitigated = Math.ceil(delta * 0.7);
  return {
    modifiedDelta: mitigated,
    note: `IRONWALL パッシブ (${delta} → ${mitigated})`
  };
};

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
