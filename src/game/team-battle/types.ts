// =========================
// Team Battle Game Types
// =========================

import { TeamId } from './roles';

export type LogKind = 'SYSTEM' | 'TURN' | 'RESULT' | 'SKILL' | 'ULT';

export type LogEntry = {
  ts: number;
  kind: LogKind;
  actorName?: string;
  actorId?: string;
  team?: TeamId;
  title: string;
  lines: string[];
};

export type ScoreScope = 'PLAYER' | 'TEAM';

export type ScoreChange = {
  scope: ScoreScope;
  target: string;
  from: number;
  to: number;
  delta: number;
  reason: string;
};

export { TeamId };
