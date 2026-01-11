// =========================
// Role Types
// =========================

export type TeamId = 'A' | 'B';

export type RoleId =
  | 'maestro'
  | 'showman'
  | 'ironwall'
  | 'coach'
  | 'oracle'
  | 'mimic'
  | 'hype'
  | 'saboteur'
  | 'underdog'
  | 'gambler';

export type RoleDef = {
  id: RoleId;
  name: string;
  type: 'ATK' | 'DEF' | 'SUP' | 'TEC';
  sigil: string;
  passive: string;
  skill: string;
  ult: string;
  // UI Meta
  tone: string; // Tailwind gradient classes
  desc: string; // Role description/catchphrase
};
