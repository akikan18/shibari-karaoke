import { RoleDef } from './types';

export const ShowmanRole: RoleDef = {
  id: 'showman',
  name: 'SHOWMAN',
  type: 'ATK',
  sigil: '◆',
  passive: 'PASSIVE：成功時、常時 +500。',
  skill: 'SKILL：(3回) 成功時さらに+500（このターンのみ）',
  ult: 'ULT：(1回) 成功なら敵チーム-2000（このターンのみ）',
};
