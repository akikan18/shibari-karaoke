import { RoleId } from '../roles';
import { AbilityHandler } from './types';

/**
 * Skill handlers for each role
 *
 * TODO: Extract actual skill logic from GamePlayTeamScreen.tsx
 * Each handler should be in a separate file (e.g., maestro.ts, showman.ts, etc.)
 */
export const skillHandlers: Partial<Record<RoleId, AbilityHandler>> = {
  // maestro: handleMaestroSkill,
  // showman: handleShowmanSkill,
  // ironwall: handleIronwallSkill,
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
 * TODO: Extract actual ult logic from GamePlayTeamScreen.tsx
 */
export const ultHandlers: Partial<Record<RoleId, AbilityHandler>> = {
  // maestro: handleMaestroUlt,
  // showman: handleShowmanUlt,
  // ironwall: handleIronwallUlt,
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
