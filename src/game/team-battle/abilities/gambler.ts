import { AbilityContext, AbilityResult } from './types';

/**
 * Gambler SKILL: DOUBLE DOWN (success x2 / fail -2000) + passive clamp
 */
export const handleGamblerSkill = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.doubleDown = true;
  singer.buffs.gamblerSkillClampPassive = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`SKILL GAMBLER: DOUBLE DOWN armed (success x2 / fail -2000) + passive clamp`],
  };
};

/**
 * Gambler ULT: HIGH STAKES - Triple or nothing
 */
export const handleGamblerUlt = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.highStakes = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`ULT GAMBLER: HIGH STAKES armed (success x3 / fail -3000)`],
  };
};
