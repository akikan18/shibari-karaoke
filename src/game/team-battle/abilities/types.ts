import { TeamId, RoleId } from '../roles';
import { ThemeCard } from '../theme';
import { LogEntry } from '../types';

/**
 * Context passed to ability handlers
 */
export type AbilityContext = {
  // Player info
  singer: any;
  singerId: string;
  team: TeamId;
  enemyTeam: TeamId;
  roleId: RoleId;

  // Game state
  members: any[];
  teamBuffs: any;
  teamScores: { A: number; B: number };

  // Deck state
  deck: ThemeCard[];
  pool: ThemeCard[];

  // Ability state
  kind: 'skill' | 'ult';
  targetId?: string;

  // Output
  logs: string[];
  logEntries: LogEntry[];
};

/**
 * Result returned by ability handlers
 */
export type AbilityResult = {
  success: boolean;
  members?: any[];
  teamBuffs?: any;
  deck?: ThemeCard[];
  logs?: string[];
  logEntries?: LogEntry[];
  oracleUltPick?: any;
  message?: string;
};

/**
 * Ability handler function type
 */
export type AbilityHandler = (context: AbilityContext) => Promise<AbilityResult> | AbilityResult;
