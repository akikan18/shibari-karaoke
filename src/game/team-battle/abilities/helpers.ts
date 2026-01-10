import { TeamId } from '../roles';

/**
 * Find a member by ID
 */
export const findMember = (members: any[], targetId: string): any | null =>
  members.find((m: any) => m.id === targetId) || null;

/**
 * Find a member index by ID
 */
export const findMemberIndex = (members: any[], targetId: string): number =>
  members.findIndex((m: any) => m.id === targetId);

/**
 * Validate target exists and is on the correct team
 * @param members - All members
 * @param targetId - Target member ID
 * @param expectedTeam - Expected team ('A', 'B', or null for any)
 * @returns The target member, or null if validation fails
 */
export const validateTarget = (
  members: any[],
  targetId: string | undefined,
  expectedTeam: TeamId | null = null
): any | null => {
  if (!targetId) return null;

  const target = findMember(members, targetId);
  if (!target) return null;

  if (expectedTeam !== null && target.team !== expectedTeam) return null;

  return target;
};

/**
 * Validate ally target (same team)
 */
export const validateAllyTarget = (
  members: any[],
  targetId: string | undefined,
  currentTeam: TeamId
): any | null => validateTarget(members, targetId, currentTeam);

/**
 * Validate enemy target (opposite team)
 */
export const validateEnemyTarget = (
  members: any[],
  targetId: string | undefined,
  currentTeam: TeamId
): any | null => {
  const enemyTeam: TeamId = currentTeam === 'A' ? 'B' : 'A';
  return validateTarget(members, targetId, enemyTeam);
};

/**
 * Record team score change
 * Helper to build score change records
 */
export const createTeamScoreRecord = (
  team: TeamId,
  delta: number,
  reason: string
): { team: TeamId; delta: number; reason: string } => ({
  team,
  delta,
  reason,
});
