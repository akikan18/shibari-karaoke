import { AbilityContext, AbilityResult } from './types';
import { validateAllyTarget, findMemberIndex } from './helpers';
import { drawFromDeck } from '../theme';

/**
 * Oracle SKILL: Reroll ally's 3 choices (keep first as current)
 */
export const handleOracleSkill = (ctx: AbilityContext): AbilityResult => {
  const { members, targetId, team, deck, pool } = ctx;

  const target = validateAllyTarget(members, targetId, team);
  if (!target) {
    return { success: false, message: 'Invalid target for Oracle SKILL' };
  }

  const targetIdx = findMemberIndex(members, targetId);
  if (targetIdx === -1) {
    return { success: false, message: 'Target not found' };
  }

  // Reroll 3 choices with first fixed
  const currentChallenge = target.challenge || { title: 'FREE THEME', criteria: '—' };
  const d = drawFromDeck(deck, pool, 2);
  const choices = [currentChallenge, ...(d.choices || [])];

  target.candidates = choices;
  target.challenge = currentChallenge;
  members[targetIdx] = target;

  return {
    success: true,
    members,
    deck: d.nextDeck,
    logs: [`SKILL ORACLE: REROLL -> ${target.name} (opt1=current)`],
  };
};

/**
 * Oracle ULT: Choose enemy themes (3 choices for each enemy)
 */
export const handleOracleUlt = (ctx: AbilityContext): AbilityResult => {
  const { singer, team, enemyTeam, members, deck, pool, rerollThreeChoicesKeepFirst } = ctx;

  // Get ready enemies
  const enemyReady = members.filter((m: any) => {
    // isReadyForTurn check from original implementation
    const hasChallenge = m.challenge && m.challenge.title;
    const isReady = m.team === enemyTeam && hasChallenge;
    return isReady;
  });

  let currentDeck = deck;
  const items = [];

  for (const em of enemyReady) {
    const cur = em.challenge ?? { title: 'FREE THEME', criteria: '—' };
    const d2 = drawFromDeck(currentDeck, pool, 2);
    currentDeck = d2.nextDeck;

    const extra = d2.choices || [];
    const choices = [cur, extra[0] ?? { title: 'FREE THEME', criteria: '—' }, extra[1] ?? { title: 'FREE THEME', criteria: '—' }];
    items.push({ targetId: em.id, targetName: em.name, team: em.team, choices });
  }

  if (items.length === 0) {
    return {
      success: true,
      members,
      logs: [`ULT ORACLE: no enemy targets`],
    };
  }

  const logs = [
    `ULT ORACLE: choose themes for ALL enemies (enemy cannot choose)`,
    `TARGETS: ${items.map((x) => x.targetName).join(', ')}`,
  ];

  const oracleUltPick = {
    active: true,
    createdAt: Date.now(),
    byId: singer.id,
    byName: singer.name,
    targetTeam: enemyTeam,
    idx: 0,
    items,
  };

  return {
    success: true,
    members,
    deck: currentDeck,
    oracleUltPick,
    logs,
  };
};
