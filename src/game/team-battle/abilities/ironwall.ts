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
  const { team, teamBuffs, members } = ctx;

  // Set turns to team member count so effect lasts for all team members
  const teamMemberCount = members.filter((m) => m.team === team).length;

  const updatedTeamBuffs = {
    A: { ...(teamBuffs.A || {}) },
    B: { ...(teamBuffs.B || {}) },
  };
  updatedTeamBuffs[team] = { ...(teamBuffs[team] || {}), negHalfTurns: teamMemberCount, negZeroTurns: 0 };

  return {
    success: true,
    members: ctx.members,
    teamBuffs: updatedTeamBuffs,
    logs: [`SKILL IRONWALL: next TEAM ${team} turn negative -50%`],
  };
};

/**
 * Ironwall ULT: Next team turn negative → 0
 */
export const handleIronwallUlt = (ctx: AbilityContext): AbilityResult => {
  const { team, teamBuffs, members } = ctx;

  // Set turns to team member count so effect lasts for all team members
  const teamMemberCount = members.filter((m) => m.team === team).length;

  const updatedTeamBuffs = {
    A: { ...(teamBuffs.A || {}) },
    B: { ...(teamBuffs.B || {}) },
  };
  updatedTeamBuffs[team] = { ...(teamBuffs[team] || {}), negZeroTurns: teamMemberCount, negHalfTurns: 0 };

  return {
    success: true,
    members: ctx.members,
    teamBuffs: updatedTeamBuffs,
    logs: [`ULT IRONWALL: next TEAM ${team} turn negative → 0`],
  };
};
