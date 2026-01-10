import { RoleDef } from './types';

export const OracleRole: RoleDef = {
  id: 'oracle',
  name: 'ORACLE',
  type: 'TEC',
  sigil: '⟁',
  passive: '自分のターンはお題3択。',
  skill: 'SKILL：(3回) 自分or味方のお題を引き直し（3択で1番目は現在のお題）',
  ult: 'ULT：(1回) 次の相手チーム全員のお題を「ORACLE側が」3択から選んで確定（相手は選べない）',
};
