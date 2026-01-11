import type { AbilityContext, AbilityResult, TurnStartPassiveContext, TurnStartPassiveResult } from './types';
import { validateAllyTarget } from './helpers';

/**
 * Coach PASSIVE: +150 at ally turn start
 */
export const handleCoachTurnStartPassive = (ctx: TurnStartPassiveContext): TurnStartPassiveResult | null => {
  const { members, team } = ctx;

  const coachInTeam = members.some((m) => m.team === team && m.role?.id === 'coach');
  if (coachInTeam) {
    return { delta: 150, reason: 'COACH PASSIVE' };
  }

  return null;
};

/**
 * Coach SKILL: TIMEOUT - Set target ally as SAFE (immune to fail penalty)
 */
export const handleCoachSkill = (ctx: AbilityContext): AbilityResult => {
  const { members, targetId, team } = ctx;

  const target = validateAllyTarget(members, targetId, team);
  if (!target) {
    return { success: false, message: 'Invalid target for Coach SKILL' };
  }

  target.buffs.coachSkill = true;

  return {
    success: true,
    members,
    logs: [`SKILL COACH: TIMEOUT -> ${target.name} (SAFE)`],
  };
};

/**
 * Coach ULT: Set target ally with forced success on next turn
 */
export const handleCoachUlt = (ctx: AbilityContext): AbilityResult => {
  const { members, targetId, team, singer } = ctx;

  const target = validateAllyTarget(members, targetId, team);
  if (!target) {
    return { success: false, message: 'Invalid target for Coach ULT' };
  }

  target.buffs.forcedSuccess = { by: singer.id };

  return {
    success: true,
    members,
    logs: [`ULT COACH: ${target.name} next turn FORCED SUCCESS`],
  };
};
