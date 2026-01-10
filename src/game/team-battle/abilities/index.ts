import { RoleId } from '../roles';
import { AbilityHandler } from './types';
import { handleMaestroSkill, handleMaestroUlt } from './maestro';
import { handleShowmanSkill, handleShowmanUlt } from './showman';
import { handleIronwallSkill, handleIronwallUlt } from './ironwall';
import { handleCoachSkill, handleCoachUlt } from './coach';
import { handleOracleSkill, handleOracleUlt } from './oracle';
import { handleMimicSkill, handleMimicUlt } from './mimic';
import { handleHypeSkill, handleHypeUlt } from './hype';
import { handleSaboteurSkill, handleSaboteurUlt } from './saboteur';
import { handleUnderdogSkill, handleUnderdogUlt } from './underdog';
import { handleGamblerSkill, handleGamblerUlt } from './gambler';

/**
 * Skill handlers for each role (ALL 10 ROLES IMPLEMENTED)
 */
export const skillHandlers: Partial<Record<RoleId, AbilityHandler>> = {
  maestro: handleMaestroSkill,
  showman: handleShowmanSkill,
  ironwall: handleIronwallSkill,
  coach: handleCoachSkill,
  oracle: handleOracleSkill,
  mimic: handleMimicSkill,
  hype: handleHypeSkill,
  saboteur: handleSaboteurSkill,
  underdog: handleUnderdogSkill,
  gambler: handleGamblerSkill,
};

/**
 * ULT handlers for each role (ALL 10 ROLES IMPLEMENTED)
 */
export const ultHandlers: Partial<Record<RoleId, AbilityHandler>> = {
  maestro: handleMaestroUlt,
  showman: handleShowmanUlt,
  ironwall: handleIronwallUlt,
  coach: handleCoachUlt,
  oracle: handleOracleUlt,
  mimic: handleMimicUlt,
  hype: handleHypeUlt,
  saboteur: handleSaboteurUlt,
  underdog: handleUnderdogUlt,
  gambler: handleGamblerUlt,
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
