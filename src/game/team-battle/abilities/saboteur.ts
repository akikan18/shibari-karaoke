import type { AbilityContext, AbilityResult, PassiveContext, PassiveResult } from './types';
import { validateEnemyTarget } from './helpers';

/**
 * Saboteur PASSIVE: Enemy -300 on success
 */
export const handleSaboteurPassive = (ctx: PassiveContext): PassiveResult => {
  const { isSuccess } = ctx;

  if (isSuccess) {
    return {
      enemyScoreDelta: -300,
      enemyReason: 'SABOTEUR PASSIVE (enemy -300 on success)',
    };
  }

  return {};
};

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
 * Saboteur ULT: Reset enemy team buffs and seal all enemies for one turn
 */
export const handleSaboteurUlt = (ctx: AbilityContext): AbilityResult => {
  const { members, team, enemyTeam, teamBuffs, singer } = ctx;

  // Reset enemy team buffs
  teamBuffs[enemyTeam] = {
    ...(teamBuffs[enemyTeam] || {}),
    lastTeamDelta: 0,
    nextSuccessBonus: 0,
    hypeUltTurns: 0,
    negHalfTurns: 0,
    negZeroTurns: 0,
    sealedTurns: 0,
  };

  // Seal all enemies
  const affected: string[] = [];
  for (let i = 0; i < members.length; i++) {
    if (members[i]?.team === enemyTeam) {
      const name = members[i]?.name;
      members[i] = {
        ...members[i],
        buffs: {},
        debuffs: { sealedOnce: { by: singer.id, ts: Date.now() } },
      };
      if (name) affected.push(name);
    }
  }

  const logs = [
    `ULT SABOTEUR: TEAM ${enemyTeam} effects RESET`,
    `ULT SABOTEUR: SEALED (PERSONAL) applied to ALL enemies for their next personal turn`,
  ];
  if (affected.length) logs.push(`AFFECTED: ${affected.join(', ')}`);

  return {
    success: true,
    members,
    teamBuffs,
    logs,
  };
};
