import type { RoleDef } from './types';

export const ShowmanRole: RoleDef = {
  id: 'showman',
  name: 'SHOWMAN',
  type: 'ATK',
  sigil: '◆',
  passive: 'STAR POWER：成功時、常時 +500。',
  skill: 'ENCORE：成功時さらに+500（このターンのみ）',
  ult: 'SPOTLIGHT：成功なら敵チーム-2000（このターンのみ）',
  tone: 'from-yellow-500/30 to-orange-600/10',
  desc: '舞台を沸かすエンターテイナー。堅実な稼ぎと、ここ一番の爆発力を併せ持つ。',
};
