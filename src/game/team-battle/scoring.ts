import { TeamId } from './roles';
import { turnStartPassiveHandlers } from './abilities';

// =========================
// Turn Order Helpers
// =========================
export const sortByTurn = (a: any, b: any) => (a.turnOrder ?? 9999) - (b.turnOrder ?? 9999);

export const computeTeamScores = (mems: any[]) => {
  const A = mems.filter((m) => m.team === 'A').reduce((s, m) => s + (m.score ?? 0), 0);
  const B = mems.filter((m) => m.team === 'B').reduce((s, m) => s + (m.score ?? 0), 0);
  return { A, B };
};

export const isReadyForTurn = (m: any) => (m?.team === 'A' || m?.team === 'B') && !!m?.role?.id;

export const findNextReadyIndex = (mems: any[], fromIndex: number) => {
  const n = mems.length;
  if (n === 0) return 0;
  for (let offset = 1; offset <= n; offset++) {
    const i = (fromIndex + offset) % n;
    if (isReadyForTurn(mems[i])) return i;
  }
  return fromIndex;
};

export const findFirstReadyIndex = (mems: any[]) => {
  const n = mems.length;
  for (let i = 0; i < n; i++) if (isReadyForTurn(mems[i])) return i;
  return 0;
};

// =========================
// TeamBuff normalize
// =========================
export const normalizeTeamBuffs = (tbLike: any) => {
  const A = tbLike?.A && typeof tbLike.A === 'object' ? tbLike.A : {};
  const B = tbLike?.B && typeof tbLike.B === 'object' ? tbLike.B : {};
  return { A: { ...A }, B: { ...B } };
};

// =========================
// Turn Start Auras
// =========================
type AuraPlan = { team: TeamId; delta: number; reason: string };

export const planStartAuras = (
  mems: any[],
  nextSinger: any,
  teamScores: { A: number; B: number },
  teamBuffs: any
) => {
  const plans: AuraPlan[] = [];
  if (!nextSinger) return plans;

  const team = nextSinger.team as TeamId | undefined;
  if (!team) return plans;

  const enemyTeam: TeamId = team === 'A' ? 'B' : 'A';

  // Check all turn-start passive handlers (all roles, as some check team-wide conditions like COACH)
  for (const [roleId, handler] of Object.entries(turnStartPassiveHandlers)) {
    if (!handler) continue;

    const result = handler({
      members: mems,
      nextSinger,
      team,
      enemyTeam,
      teamScores,
      teamBuffs,
    });

    if (result && result.delta && result.reason) {
      plans.push({ team, delta: result.delta, reason: result.reason });
    }
  }

  return plans;
};
