import { RoleDef } from './types';

export const IronwallRole: RoleDef = {
  id: 'ironwall',
  name: 'IRON WALL',
  type: 'DEF',
  sigil: '▣',
  passive: 'FORTRESS：チームが受ける「マイナス」を30%軽減（歌唱の失敗0は対象外）。',
  skill: 'FORTIFY：次の自チームのターン、受けるマイナス-50%',
  ult: 'BARRIER：次の自チームのターン、受けるマイナスをすべて0',
};
