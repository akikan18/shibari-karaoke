import type { RoleDef } from './types';

export const OracleRole: RoleDef = {
  id: 'oracle',
  name: 'ORACLE',
  type: 'TEC',
  sigil: '⟁',
  passive: 'FORESIGHT：自分のターンはお題3択。',
  skill: 'REROLL：自分or味方のお題を引き直し（3択で1番目は現在のお題）',
  ult: 'DIVINATION：次の相手チーム全員のお題を「ORACLE側が」3択から選んで確定（相手は選べない）',
  tone: 'from-indigo-500/25 to-cyan-500/10',
  desc: '運命をハックする預言者。お題選びやイベントを操作し、盤面を支配する。',
};
