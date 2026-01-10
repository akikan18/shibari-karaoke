import { AbilityContext, AbilityResult } from './types';

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
  teamBuffs[team] = { ...(teamBuffs[team] || {}), nextSuccessBonus: currentBonus + 500 };

  return {
    success: true,
    members: ctx.members,
    teamBuffs,
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
