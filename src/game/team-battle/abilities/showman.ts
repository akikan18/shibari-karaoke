import { AbilityContext, AbilityResult } from './types';

/**
 * Showman SKILL: Arm encore buff (+500 on success)
 */
export const handleShowmanSkill = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.encore = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`SKILL SHOWMAN: armed (+500 on success)`],
  };
};

/**
 * Showman ULT: Arm spotlight buff (success enemy -2000)
 */
export const handleShowmanUlt = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.spotlight = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`ULT SHOWMAN: armed (success enemy -2000)`],
  };
};
