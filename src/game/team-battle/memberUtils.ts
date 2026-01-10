import { RoleId, getDefaultRoleUses } from './roles';
import { sortByTurn } from './scoring';

export type Member = {
  id: string;
  name: string;
  avatar: string;
  team: 'A' | 'B';
  score: number;
  combo: number;
  buffs: Record<string, any>;
  debuffs: Record<string, any>;
  role: {
    id: RoleId;
    name: string;
    skillUses: number;
    ultUses: number;
  } | null;
  candidates: any[] | null;
  challenge: any | null;
  turnOrder?: number;
  online?: boolean;
};

/**
 * Normalize a single member object with default values
 */
export const normalizeMember = (m: any): Member => {
  const rid: RoleId | undefined = m.role?.id;
  const uses = getDefaultRoleUses(rid);
  const role = m.role
    ? {
        ...m.role,
        skillUses: m.role.skillUses ?? uses.skillUses,
        ultUses: m.role.ultUses ?? uses.ultUses,
      }
    : null;

  return {
    ...m,
    score: m.score ?? 0,
    combo: m.combo ?? 0,
    buffs: m.buffs ?? {},
    debuffs: m.debuffs ?? {},
    role,
    candidates: Array.isArray(m.candidates) ? m.candidates : null,
    challenge: m.challenge ?? null,
  };
};

/**
 * Normalize and sort members array
 */
export const normalizeMembers = (data: any[]): Member[] =>
  (data || []).map(normalizeMember).slice().sort(sortByTurn);
