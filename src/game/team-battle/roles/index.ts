import { RoleDef, RoleId } from './types';
import { MaestroRole } from './maestro';
import { ShowmanRole } from './showman';
import { IronwallRole } from './ironwall';
import { CoachRole } from './coach';
import { OracleRole } from './oracle';
import { MimicRole } from './mimic';
import { HypeRole } from './hype';
import { SaboteurRole } from './saboteur';
import { UnderdogRole } from './underdog';
import { GamblerRole } from './gambler';

// 全ロールのリスト
export const ALL_ROLES: RoleDef[] = [
  MaestroRole,
  ShowmanRole,
  IronwallRole,
  CoachRole,
  OracleRole,
  MimicRole,
  HypeRole,
  SaboteurRole,
  UnderdogRole,
  GamblerRole,
];

// ロールID別検索
export const getRoleById = (id?: RoleId) =>
  ALL_ROLES.find((r) => r.id === id);

// デフォルトスキル使用回数
export const getDefaultRoleUses = (_roleId?: RoleId) => {
  const skillUses = 3;
  const ultUses = 1;
  return { skillUses, ultUses };
};

// Re-export types
export * from './types';
