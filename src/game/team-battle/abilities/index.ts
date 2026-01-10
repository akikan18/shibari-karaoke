import { RoleId } from '../roles';
import type { AbilityHandler, PassiveHandler } from './types';
import { handleMaestroSkill, handleMaestroUlt, handleMaestroPassive } from './maestro';
import { handleShowmanSkill, handleShowmanUlt, handleShowmanPassive } from './showman';
import { handleIronwallSkill, handleIronwallUlt } from './ironwall';
import { handleCoachSkill, handleCoachUlt } from './coach';
import { handleOracleSkill, handleOracleUlt } from './oracle';
import { handleMimicSkill, handleMimicUlt, handleMimicPassive } from './mimic';
import { handleHypeSkill, handleHypeUlt } from './hype';
import { handleSaboteurSkill, handleSaboteurUlt, handleSaboteurPassive } from './saboteur';
import { handleUnderdogSkill, handleUnderdogUlt } from './underdog';
import { handleGamblerSkill, handleGamblerUlt, handleGamblerPassive } from './gambler';

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
 * Passive handlers for each role
 *
 * Implemented: maestro, showman, saboteur, gambler, mimic
 * No passive: ironwall, coach, oracle, hype, underdog
 */
export const passiveHandlers: Partial<Record<RoleId, PassiveHandler>> = {
  maestro: handleMaestroPassive,
  showman: handleShowmanPassive,
  saboteur: handleSaboteurPassive,
  gambler: handleGamblerPassive,
  mimic: handleMimicPassive,
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

/**
 * Get passive handler for a role
 * @param roleId - The role ID
 * @returns The passive handler function, or null if not found
 */
export const getPassiveHandler = (roleId: RoleId): PassiveHandler | null => {
  return passiveHandlers[roleId] || null;
};

export * from './types';
export * from './helpers';
