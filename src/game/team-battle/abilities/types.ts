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

/**
 * Context for turn-start passive handlers (Coach, Hype, Underdog)
 */
export type TurnStartPassiveContext = {
  members: any[];
  nextSinger: any;
  team: TeamId;
  enemyTeam: TeamId;
  teamScores: { A: number; B: number };
  teamBuffs: any;
};

/**
 * Result from turn-start passive handlers
 */
export type TurnStartPassiveResult = {
  delta?: number;
  reason?: string;
};

/**
 * Turn-start passive handler function type
 */
export type TurnStartPassiveHandler = (context: TurnStartPassiveContext) => TurnStartPassiveResult | null;

/**
 * Context for score modifier passive handlers (Ironwall)
 */
export type ScoreModifierContext = {
  team: TeamId;
  delta: number;
  reason: string;
  members: any[];
  sealed: boolean;
};

/**
 * Result from score modifier passive handlers
 */
export type ScoreModifierResult = {
  modifiedDelta: number;
  note?: string;
};

/**
 * Score modifier passive handler function type
 */
export type ScoreModifierPassiveHandler = (context: ScoreModifierContext) => ScoreModifierResult;
