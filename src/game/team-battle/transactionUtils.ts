import type { TeamId } from './types';

/**
 * Initialize team scores with fallback values
 */
export const initializeTeamScores = (
  scores?: { A?: number; B?: number },
  fallback?: { A: number; B: number }
): { A: number; B: number } => {
  const ts = scores || fallback || { A: 0, B: 0 };
  return { A: ts.A ?? 0, B: ts.B ?? 0 };
};

/**
 * Normalize current turn index to a valid ready member
 */
export const normalizeCurrentIndex = (
  idx: number,
  members: any[],
  isReadyForTurn: (member: any) => boolean,
  findFirstReadyIndex: (members: any[]) => number
): number => {
  let current = idx >= members.length ? 0 : idx;
  if (members.length > 0 && !isReadyForTurn(members[current])) {
    current = findFirstReadyIndex(members);
  }
  return current;
};

/**
 * Decrement a team buff counter
 */
export const decrementTeamBuffCounter = (
  teamBuffs: any,
  team: TeamId,
  key: string
): void => {
  const current = teamBuffs?.[team]?.[key] ?? 0;
  if (current > 0) {
    teamBuffs[team][key] = Math.max(0, current - 1);
  }
};
