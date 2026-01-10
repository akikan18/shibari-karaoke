import type { AbilityContext, AbilityResult, PassiveContext, PassiveResult } from './types';
import { clamp } from '../utils';

/**
 * Maestro PASSIVE: Success -> COMBO+1 (max 5), bonus +250×COMBO. Fail -> COMBO reset (no penalty)
 */
export const handleMaestroPassive = (ctx: PassiveContext): PassiveResult => {
  const { singer, isSuccess } = ctx;

  if (isSuccess) {
    const nextCombo = clamp((singer.combo ?? 0) + 1, 0, 5);
    singer.combo = nextCombo;
    const bonus = 250 * nextCombo;
    return {
      scoreDelta: bonus,
      reason: `MAESTRO PASSIVE (COMBO x${nextCombo} => +${bonus})`,
    };
  } else {
    const had = singer.combo ?? 0;
    singer.combo = 0;
    if (had > 0) {
      return {
        notes: [`NOTE MAESTRO: COMBO broken (no score penalty)`],
      };
    }
  }

  return {};
};

/**
 * Maestro SKILL: Arm maestro skill buff (success COMBO+2 / fail -500)
 */
export const handleMaestroSkill = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.maestroSkill = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`SKILL MAESTRO: armed (success COMBO+2 / fail -500)`],
  };
};

/**
 * Maestro ULT: FINALE - Convert combo to team score and give next success bonus
 */
export const handleMaestroUlt = (ctx: AbilityContext): AbilityResult => {
  const { singer, team, teamBuffs, teamScores } = ctx;

  const combo = singer.combo ?? 0;
  const gain = combo * 800;

  // Reset combo
  singer.combo = 0;

  // Add next success bonus
  const currentBonus = teamBuffs[team]?.nextSuccessBonus ?? 0;
  const updatedTeamBuffs = {
    A: { ...(teamBuffs.A || {}) },
    B: { ...(teamBuffs.B || {}) },
  };
  updatedTeamBuffs[team] = { ...(teamBuffs[team] || {}), nextSuccessBonus: currentBonus + 500 };

  // Create score change for team gain
  const scoreChanges = gain > 0 ? [{
    scope: 'TEAM' as const,
    target: `TEAM ${team}`,
    from: teamScores[team] ?? 0,
    to: (teamScores[team] ?? 0) + gain,
    delta: gain,
    reason: 'MAESTRO ULT (FINALE: combo x800)',
  }] : [];

  return {
    success: true,
    members: ctx.members,
    teamBuffs: updatedTeamBuffs,
    scoreChanges,
    logs: [`ULT MAESTRO: FINALE team +${gain}, next success +500`],
    logEntries: [
      ...ctx.logEntries,
      {
        ts: Date.now(),
        kind: 'ABILITY',
        actorName: singer.name,
        actorId: singer.id,
        team,
        title: 'MAESTRO ULT: FINALE',
        lines: [
          `Team score +${gain} (combo ${combo} × 800)`,
          `Next success bonus +500`,
        ],
      },
    ],
  };
};
