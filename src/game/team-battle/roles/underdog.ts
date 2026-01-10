import type { RoleDef } from './types';

export const UnderdogRole: RoleDef = {
  id: 'underdog',
  name: 'UNDERDOG',
  type: 'DEF',
  sigil: '⬟',
  passive: 'REBEL：負けている時、自分のターン開始時に +500。',
  skill: 'STEAL：現在の点差の20%を相手から奪う（最大2000）。',
  ult: 'TURNAROUND：「相手-2000まで追いつく」と「チーム+2000」のより良い方を獲得',
};
