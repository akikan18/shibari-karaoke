import { AbilityContext, AbilityResult } from './types';
import { validateEnemyTarget } from './helpers';

/**
 * Saboteur SKILL: Sabotage enemy (success +0 / fail -1000)
 */
export const handleSaboteurSkill = (ctx: AbilityContext): AbilityResult => {
  const { members, targetId, team, singer } = ctx;

  const target = validateEnemyTarget(members, targetId, team);
  if (!target) {
    return { success: false, message: 'Invalid target for Saboteur SKILL' };
  }

  target.debuffs.sabotaged = { by: singer.id, fail: -1000 };

  return {
    success: true,
    members,
    logs: [`SKILL SABOTEUR: sabotaged -> ${target.name} (success +0 / fail -1000)`],
  };
};

/**
 * Saboteur ULT: Seal enemy for one turn (disable abilities)
 */
export const handleSaboteurUlt = (ctx: AbilityContext): AbilityResult => {
  const { members, targetId, team } = ctx;

  const target = validateEnemyTarget(members, targetId, team);
  if (!target) {
    return { success: false, message: 'Invalid target for Saboteur ULT' };
  }

  target.debuffs.sealedOnce = true;

  return {
    success: true,
    members,
    logs: [`ULT SABOTEUR: ${target.name} SEALED (next turn abilities disabled)`],
  };
};
