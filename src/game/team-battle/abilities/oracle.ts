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
  const { singer, team, enemyTeam, members, deck, pool } = ctx;

  const enemies = members.filter((m: any) => m.team === enemyTeam);

  const items = enemies.map((enemy: any) => {
    const d = drawFromDeck(deck, pool, 3);
    return {
      targetId: enemy.id,
      targetName: enemy.name,
      team: enemyTeam,
      choices: d.choices || [],
    };
  });

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
    oracleUltPick,
    logs: [`ULT ORACLE: choosing themes for TEAM ${enemyTeam} (${enemies.length} enemies)`],
  };
};
