import type { AbilityContext, AbilityResult, PassiveContext, PassiveResult } from './types';

/**
 * Mimic PASSIVE: On success, +30% of last ally success
 */
export const handleMimicPassive = (ctx: PassiveContext): PassiveResult => {
  const { singer, isSuccess, team, teamBuffs } = ctx;

  const mimicSharedTurns = singer.buffs?.mimicPassiveTurns ?? 0;
  const isMimicRole = singer.role?.id === 'mimic';

  // If MIMIC role has shared passive active, only trigger shared version (not both)
  const canUse = mimicSharedTurns > 0 || isMimicRole;

  if (canUse && isSuccess) {
    const last = teamBuffs[team]?.lastTeamDelta ?? 0;
    if (last > 0) {
      const bonus = Math.round(last * 0.3);
      const reason = mimicSharedTurns > 0
        ? `MIMIC PASSIVE (shared) (30% of last ally success ${last})`
        : `MIMIC PASSIVE (30% of last ally success ${last})`;

      return {
        scoreDelta: bonus,
        reason,
      };
    }
  }

  return {};
};

/**
 * Mimic SKILL: Copy 50% of last turn delta immediately
 */
export const handleMimicSkill = (ctx: AbilityContext): AbilityResult => {
  const { singer } = ctx;

  // MIMIC skill needs access to the last turn delta at activation time
  // For now, we'll store it in the singer's buffs when available
  // The actual score calculation will happen when we have the last turn data
  const lastTurn = singer.lastTurnDelta ?? 0;
  const add = Math.round(lastTurn * 0.5);

  // Apply score immediately to the singer
  const currentScore = singer.score ?? 0;
  singer.score = currentScore + add;

  const scoreChanges = [{
    scope: 'PLAYER' as const,
    target: singer.name,
    from: currentScore,
    to: currentScore + add,
    delta: add,
    reason: `MIMIC SKILL (ECHO 50% of last turn ${lastTurn >= 0 ? '+' : ''}${lastTurn})`,
  }];

  return {
    success: true,
    members: ctx.members,
    scoreChanges,
    logs: [`SKILL MIMIC: ECHO ${add >= 0 ? '+' : ''}${add} (50% of last turn ${lastTurn >= 0 ? '+' : ''}${lastTurn})`],
  };
};

/**
 * Mimic ULT: Grant MIMIC PASSIVE to all allies for their next personal turn
 */
export const handleMimicUlt = (ctx: AbilityContext): AbilityResult => {
  const { members, team } = ctx;

  // Set turns to team member count so effect lasts for all team members
  const teamMemberCount = members.filter((m) => m.team === team).length;

  const affected: string[] = [];
  for (let i = 0; i < members.length; i++) {
    if (members[i]?.team === team) {
      members[i] = {
        ...members[i],
        buffs: {
          ...(members[i].buffs || {}),
          mimicPassiveTurns: teamMemberCount,
        },
      };
      affected.push(members[i]?.name);
    }
  }

  const logs = [`ULT MIMIC: grant MIMIC PASSIVE to ALL allies for their next personal turn`];
  if (affected.length) logs.push(`AFFECTED: ${affected.join(', ')}`);

  return {
    success: true,
    members,
    logs,
  };
};
