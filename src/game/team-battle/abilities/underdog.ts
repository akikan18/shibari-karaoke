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
 * Underdog ULT: Catch up to opponent or gain bonus if winning
 */
export const handleUnderdogUlt = (ctx: AbilityContext): AbilityResult => {
  const { team, enemyTeam, teamScores } = ctx;

  const myScore = teamScores[team] ?? 0;
  const oppScore = teamScores[enemyTeam] ?? 0;

  let delta = 0;
  let reason = '';
  let logMessage = '';

  if (myScore < oppScore) {
    const targetScore = oppScore - 2000;
    delta = Math.max(0, targetScore - myScore);
    reason = 'UNDERDOG ULT (catch up to opp-2000)';
    logMessage = `ULT UNDERDOG: catch up (to opponent -2000) => +${delta}`;
  } else {
    delta = 2000;
    reason = 'UNDERDOG ULT (winning: +2000)';
    logMessage = `ULT UNDERDOG: winning => team +2000`;
  }

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
