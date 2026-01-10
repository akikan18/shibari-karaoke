import { RoleDef } from './types';

export const ShowmanRole: RoleDef = {
  id: 'showman',
  name: 'SHOWMAN',
  type: 'ATK',
  sigil: '◆',
  passive: 'STAR POWER：成功時、常時 +500。',
  skill: 'ENCORE：成功時さらに+500（このターンのみ）',
  ult: 'SPOTLIGHT：成功なら敵チーム-2000（このターンのみ）',
};
