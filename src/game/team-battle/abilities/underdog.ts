import { AbilityContext, AbilityResult } from './types';
import { clamp } from '../utils';

/**
 * Underdog SKILL: Steal 20% of score difference (up to 2000)
 */
export const handleUnderdogSkill = (ctx: AbilityContext): AbilityResult => {
  const { team, enemyTeam, teamScores } = ctx;

  const diff = Math.abs((teamScores.A ?? 0) - (teamScores.B ?? 0));
  const steal = clamp(Math.round(diff * 0.2), 0, 2000);

  return {
    success: true,
    members: ctx.members,
    logs: [
      `SKILL UNDERDOG: steal ${steal} from TEAM ${enemyTeam}`,
      `NOTE: Score adjustment handled in game logic`,
    ],
  };
};

/**
 * Underdog ULT: Massive comeback bonus based on score deficit
 */
export const handleUnderdogUlt = (ctx: AbilityContext): AbilityResult => {
  const { team, enemyTeam, teamScores } = ctx;

  const myScore = teamScores[team] ?? 0;
  const enemyScore = teamScores[enemyTeam] ?? 0;
  const deficit = Math.max(0, enemyScore - myScore);
  const comeback = clamp(Math.round(deficit * 0.5), 0, 5000);

  return {
    success: true,
    members: ctx.members,
    logs: [
      `ULT UNDERDOG: COMEBACK BONUS +${comeback} (50% of deficit, max 5000)`,
      `NOTE: Score adjustment handled in game logic`,
    ],
  };
};
