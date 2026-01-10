import { TeamId } from './roles';
import { ScoreChange } from './types';
import { fmt } from './utils';
import { scoreModifierPassiveHandler } from './abilities';

/**
 * Check if a team has Ironwall passive
 */
export const hasIronwallPassive = (members: any[], team: TeamId): boolean =>
  members.some((m: any) => m.team === team && m.role?.id === 'ironwall');

/**
 * Mitigate negative delta based on team buffs (Ironwall skill/ult) and passive
 * @param team - The team receiving the delta
 * @param currentTeam - The team whose turn it is
 * @param delta - The score delta (can be negative)
 * @param reason - Description of the score change
 * @param negZeroActive - Whether IRONWALL ULT is active (negates all negative)
 * @param negHalfActive - Whether IRONWALL SKILL is active (halves negative)
 * @param members - All members array (for passive check)
 * @param sealed - Whether the team is sealed
 * @param notes - Array to append mitigation notes
 * @returns Mitigated delta value
 */
export const mitigateNegative = (
  team: TeamId,
  currentTeam: TeamId,
  delta: number,
  reason: string,
  negZeroActive: boolean,
  negHalfActive: boolean,
  members: any[],
  sealed: boolean,
  notes: string[]
): number => {
  if (delta >= 0) return delta;

  let d = delta;

  // ironwall skill/ult mitigation (active only on that team's turn)
  if (team === currentTeam) {
    if (negZeroActive) {
      notes.push(`NOTE TEAM ${team}: IRONWALL ULT -> negative blocked (${fmt(d)}) [${reason}]`);
      d = 0;
    } else if (negHalfActive) {
      const reduced = Math.round(d * 0.5);
      notes.push(`NOTE TEAM ${team}: IRONWALL SKILL -> -50% (${fmt(d)} -> ${fmt(reduced)}) [${reason}]`);
      d = reduced;
    }
  }

  // ironwall passive mitigation (disabled while sealed)
  if (d < 0) {
    const result = scoreModifierPassiveHandler({
      team,
      delta: d,
      reason,
      members,
      sealed,
    });

    if (result.modifiedDelta !== d) {
      d = result.modifiedDelta;
      if (result.note) {
        notes.push(`NOTE TEAM ${team}: ${result.note}`);
      }
    }
  }

  return d;
};

/**
 * Apply score delta to a singer and track changes
 * @param singer - The member receiving the score change
 * @param delta - The score delta
 * @param scope - The scope of the score change ('ME', 'TEAM', 'ENEMY_TEAM')
 * @param reason - Description of the score change
 * @param changes - Array to track score changes
 */
export const applySingerDelta = (
  singer: any,
  delta: number,
  scope: 'ME' | 'TEAM' | 'ENEMY_TEAM',
  reason: string,
  changes: ScoreChange[]
): void => {
  singer.score = (singer.score || 0) + delta;
  changes.push({ memberId: singer.id, memberName: singer.name, delta, scope, reason });
};

/**
 * Apply score delta to all members of a team
 * @param members - All members array
 * @param team - The target team
 * @param delta - The score delta
 * @param scope - The scope of the score change
 * @param reason - Description of the score change
 * @param changes - Array to track score changes
 */
export const applyTeamDelta = (
  members: any[],
  team: TeamId,
  delta: number,
  scope: 'ME' | 'TEAM' | 'ENEMY_TEAM',
  reason: string,
  changes: ScoreChange[]
): void => {
  members.forEach((m: any) => {
    if (m.team !== team) return;
    m.score = (m.score || 0) + delta;
    changes.push({ memberId: m.id, memberName: m.name, delta, scope, reason });
  });
};

/**
 * Decrement buff turns and remove expired buffs
 * @param teamBuffs - The team buffs object
 * @param team - The team whose buffs to decrement
 */
export const decrementBuffTurns = (teamBuffs: any, team: TeamId): void => {
  const tb = teamBuffs[team];
  if (!tb) return;

  // Decrement all turn-based buffs
  if (tb.negZeroTurns > 0) tb.negZeroTurns--;
  if (tb.negHalfTurns > 0) tb.negHalfTurns--;
  if (tb.sealedTurns > 0) tb.sealedTurns--;
  if (tb.nextSuccessBonus) {
    if (tb.nextSuccessBonus.turns > 0) {
      tb.nextSuccessBonus.turns--;
      if (tb.nextSuccessBonus.turns === 0) delete tb.nextSuccessBonus;
    }
  }
};

/**
 * Remove one-time debuffs from a member
 * @param member - The member to clean up
 */
export const cleanupMemberDebuffs = (member: any): void => {
  if (member.debuffs?.sealedOnce) delete member.debuffs.sealedOnce;
  if (member.debuffs?.challengeOverride) delete member.debuffs.challengeOverride;
};
