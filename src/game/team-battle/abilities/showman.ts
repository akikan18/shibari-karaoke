import type { AbilityContext, AbilityResult, PassiveContext, PassiveResult } from './types';

/**
 * Showman PASSIVE: +500 on success
 */
export const handleShowmanPassive = (ctx: PassiveContext): PassiveResult => {
  const { isSuccess } = ctx;

  if (isSuccess) {
    return {
      scoreDelta: 500,
      reason: 'SHOWMAN PASSIVE (+500 on success)',
    };
  }

  return {};
};

/**
 * Showman SKILL: Arm encore buff (+500 on success)
 */
export const handleShowmanSkill = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.showmanSkill = true;

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

  singer.buffs.showmanUlt = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`ULT SHOWMAN: armed (success enemy -2000)`],
  };
};
