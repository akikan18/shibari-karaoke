import { RoleDef } from './types';

export const UnderdogRole: RoleDef = {
  id: 'underdog',
  name: 'UNDERDOG',
  type: 'DEF',
  sigil: '⬟',
  passive: '負けている時、自分のターン開始時に +500。',
  skill: 'SKILL：(3回) 現在の点差の20%を相手から奪う（最大2000）。',
  ult: 'ULT：(1回) 負けているとき：相手-2000まで追いつく／勝っているとき：チーム+2000',
};
