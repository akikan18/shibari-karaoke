import { RoleId } from '../roles';
import { AbilityHandler } from './types';
import { handleMaestroSkill, handleMaestroUlt } from './maestro';
import { handleShowmanSkill, handleShowmanUlt } from './showman';
import { handleIronwallSkill, handleIronwallUlt } from './ironwall';

/**
 * Skill handlers for each role
 *
 * Implemented: maestro, showman, ironwall
 * TODO: coach, oracle, mimic, hype, saboteur, underdog, gambler
 */
export const skillHandlers: Partial<Record<RoleId, AbilityHandler>> = {
  maestro: handleMaestroSkill,
  showman: handleShowmanSkill,
  ironwall: handleIronwallSkill,
  // coach: handleCoachSkill,
  // oracle: handleOracleSkill,
  // mimic: handleMimicSkill,
  // hype: handleHypeSkill,
  // saboteur: handleSaboteurSkill,
  // underdog: handleUnderdogSkill,
  // gambler: handleGamblerSkill,
};

/**
 * ULT handlers for each role
 *
 * Implemented: maestro, showman, ironwall
 * TODO: coach, oracle, mimic, hype, saboteur, underdog, gambler
 */
export const ultHandlers: Partial<Record<RoleId, AbilityHandler>> = {
  maestro: handleMaestroUlt,
  showman: handleShowmanUlt,
  ironwall: handleIronwallUlt,
  // coach: handleCoachUlt,
  // oracle: handleOracleUlt,
  // mimic: handleMimicUlt,
  // hype: handleHypeUlt,
  // saboteur: handleSaboteurUlt,
  // underdog: handleUnderdogUlt,
  // gambler: handleGamblerUlt,
};

/**
 * Get ability handler for a role
 * @param roleId - The role ID
 * @param kind - 'skill' or 'ult'
 * @returns The ability handler function, or null if not found
 */
export const getAbilityHandler = (roleId: RoleId, kind: 'skill' | 'ult'): AbilityHandler | null => {
  const handlers = kind === 'skill' ? skillHandlers : ultHandlers;
  return handlers[roleId] || null;
};

export * from './types';
export * from './helpers';
