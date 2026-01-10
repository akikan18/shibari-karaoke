import { RoleId } from '../roles';
import type { AbilityHandler, PassiveHandler, TurnStartPassiveHandler, ScoreModifierPassiveHandler } from './types';
import { handleMaestroSkill, handleMaestroUlt, handleMaestroPassive } from './maestro';
import { handleShowmanSkill, handleShowmanUlt, handleShowmanPassive } from './showman';
import { handleIronwallSkill, handleIronwallUlt, handleIronwallScoreModifier } from './ironwall';
import { handleCoachSkill, handleCoachUlt, handleCoachTurnStartPassive } from './coach';
import { handleOracleSkill, handleOracleUlt } from './oracle';
import { handleMimicSkill, handleMimicUlt, handleMimicPassive } from './mimic';
import { handleHypeSkill, handleHypeUlt, handleHypeTurnStartPassive } from './hype';
import { handleSaboteurSkill, handleSaboteurUlt, handleSaboteurPassive } from './saboteur';
import { handleUnderdogSkill, handleUnderdogUlt, handleUnderdogTurnStartPassive } from './underdog';
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
 * Passive handlers for each role (turn result passives)
 *
 * Implemented: maestro, showman, saboteur, gambler, mimic
 */
export const passiveHandlers: Partial<Record<RoleId, PassiveHandler>> = {
  maestro: handleMaestroPassive,
  showman: handleShowmanPassive,
  saboteur: handleSaboteurPassive,
  gambler: handleGamblerPassive,
  mimic: handleMimicPassive,
};

/**
 * Turn-start passive handlers (Coach, Hype, Underdog)
 */
export const turnStartPassiveHandlers: Partial<Record<RoleId, TurnStartPassiveHandler>> = {
  coach: handleCoachTurnStartPassive,
  hype: handleHypeTurnStartPassive,
  underdog: handleUnderdogTurnStartPassive,
};

/**
 * Score modifier passive handler (Ironwall)
 */
export const scoreModifierPassiveHandler: ScoreModifierPassiveHandler = handleIronwallScoreModifier;

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

/**
 * Get turn-start passive handler for a role
 * @param roleId - The role ID
 * @returns The turn-start passive handler function, or null if not found
 */
export const getTurnStartPassiveHandler = (roleId: RoleId): TurnStartPassiveHandler | null => {
  return turnStartPassiveHandlers[roleId] || null;
};

export * from './types';
export * from './helpers';
