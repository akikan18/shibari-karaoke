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
  teamScores?: { A: number; B: number };
  deck?: ThemeCard[];
  logs?: string[];
  logEntries?: LogEntry[];
  scoreChanges?: any[];
  oracleUltPick?: any;
  message?: string;
};

/**
 * Ability handler function type
 */
export type AbilityHandler = (context: AbilityContext) => Promise<AbilityResult> | AbilityResult;

/**
 * Context for passive ability handlers
 */
export type PassiveContext = {
  singer: any;
  isSuccess: boolean;
  sealed: boolean;
  sabotaged: boolean;
  team: TeamId;
  enemyTeam: TeamId;
  teamBuffs: any;
  notes: string[];
};

/**
 * Result from passive handlers
 */
export type PassiveResult = {
  scoreDelta?: number;
  reason?: string;
  enemyScoreDelta?: number;
  enemyReason?: string;
  notes?: string[];
  singerUpdates?: any;
};

/**
 * Passive handler function type
 */
export type PassiveHandler = (context: PassiveContext) => PassiveResult;
