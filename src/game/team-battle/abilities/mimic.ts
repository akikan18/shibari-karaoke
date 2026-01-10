import type { AbilityContext, AbilityResult, PassiveContext, PassiveResult } from './types';

/**
 * Mimic PASSIVE: On success, +30% of last ally success
 */
export const handleMimicPassive = (ctx: PassiveContext): PassiveResult => {
  const { singer, isSuccess, team, teamBuffs } = ctx;

  const mimicSharedTurns = singer.buffs?.mimicPassiveTurns ?? 0;
  const canUse = singer.role?.id === 'mimic' || mimicSharedTurns > 0;

  if (canUse && isSuccess) {
    const last = teamBuffs[team]?.lastTeamDelta ?? 0;
    if (last > 0) {
      const bonus = Math.round(last * 0.3);
      const reason = singer.role?.id === 'mimic'
        ? `MIMIC PASSIVE (30% of last ally success ${last})`
        : `MIMIC PASSIVE (shared) (30% of last ally success ${last})`;

      return {
        scoreDelta: bonus,
        reason,
      };
    }
  }

  return {};
};

/**
 * Mimic SKILL: Arm echo buff (copy 50% of last turn delta)
 */
export const handleMimicSkill = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  singer.buffs.echo = true;

  return {
    success: true,
    members: ctx.members,
    logs: [`SKILL MIMIC: ECHO armed (copy 50% last turn delta)`],
  };
};

/**
 * Mimic ULT: Copy another ally's role skill/ult uses
 */
export const handleMimicUlt = (ctx: AbilityContext): AbilityResult => {
  const { members, targetId, team, singer } = ctx;

  if (!targetId) {
    return { success: false, message: 'No target specified for Mimic ULT' };
  }

  const target = members.find((m: any) => m.id === targetId && m.team === team);
  if (!target || !target.role) {
    return { success: false, message: 'Invalid target for Mimic ULT' };
  }

  singer.buffs.mimicUltCopy = {
    roleId: target.role.id,
    roleName: target.role.name,
  };

  return {
    success: true,
    members,
    logs: [`ULT MIMIC: copied ${target.name}'s role (${target.role.name})`],
  };
};
