import type { AbilityContext, AbilityResult, TurnStartPassiveContext, TurnStartPassiveResult } from './types';
import { clamp } from '../utils';
import type { ScoreChange, TeamId } from '../types';

/**
 * Underdog PASSIVE: +500 when losing at turn start
 */
export const handleUnderdogTurnStartPassive = (ctx: TurnStartPassiveContext): TurnStartPassiveResult | null => {
  const { nextSinger, team, teamScores } = ctx;

  if (nextSinger.role?.id === 'underdog') {
    const myScore = teamScores[team];
    const oppTeam: TeamId = team === 'A' ? 'B' : 'A';
    const oppScore = teamScores[oppTeam];
    if (myScore < oppScore) {
      return { delta: 500, reason: 'UNDERDOG PASSIVE' };
    }
  }

  return null;
};

/**
 * Underdog SKILL: Steal 20% of score difference (up to 2000)
 */
export const handleUnderdogSkill = (ctx: AbilityContext): AbilityResult => {
  const { team, enemyTeam, teamScores } = ctx;

  const diff = Math.abs((teamScores.A ?? 0) - (teamScores.B ?? 0));
  const steal = clamp(Math.round(diff * 0.2), 0, 2000);

  const scoreChanges: ScoreChange[] = [
    {
      scope: 'TEAM',
      target: `TEAM ${team}`,
      from: teamScores[team] ?? 0,
      to: (teamScores[team] ?? 0) + steal,
      delta: steal,
      reason: 'UNDERDOG SKILL (steal 20% up to 2000)',
    },
    {
      scope: 'TEAM',
      target: `TEAM ${enemyTeam}`,
      from: teamScores[enemyTeam] ?? 0,
      to: (teamScores[enemyTeam] ?? 0) - steal,
      delta: -steal,
      reason: `UNDERDOG SKILL (stolen by TEAM ${team})`,
    },
  ];

  return {
    success: true,
    members: ctx.members,
    scoreChanges,
    logs: [`SKILL UNDERDOG: steal ${steal} from TEAM ${enemyTeam}`],
  };
};

/**
 * Underdog ULT: Choose better option between catching up to opp-2000 or +2000
 */
export const handleUnderdogUlt = (ctx: AbilityContext): AbilityResult => {
  const { team, enemyTeam, teamScores } = ctx;

  const myScore = teamScores[team] ?? 0;
  const oppScore = teamScores[enemyTeam] ?? 0;

  // Calculate both options
  const targetScore = oppScore - 2000;
  const catchUpDelta = targetScore - myScore;
  const flatBonus = 2000;

  // Choose the better option (Math.max handles negative catchUpDelta)
  const delta = Math.max(catchUpDelta, flatBonus);

  const reason = delta === catchUpDelta
    ? 'UNDERDOG ULT (catch up to opp-2000)'
    : 'UNDERDOG ULT (+2000)';

  const logMessage = delta === catchUpDelta
    ? `ULT UNDERDOG: catch up (to opponent -2000) => +${delta}`
    : `ULT UNDERDOG: +2000`;

  const scoreChanges: ScoreChange[] = delta > 0 ? [{
    scope: 'TEAM',
    target: `TEAM ${team}`,
    from: myScore,
    to: myScore + delta,
    delta,
    reason,
  }] : [];

  return {
    success: true,
    members: ctx.members,
    scoreChanges,
    logs: [logMessage],
  };
};
