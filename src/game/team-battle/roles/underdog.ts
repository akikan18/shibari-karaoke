import type { RoleDef } from './types';

export const UnderdogRole: RoleDef = {
  id: 'underdog',
  name: 'UNDERDOG',
  type: 'DEF',
  sigil: '⬟',
  passive: 'REBEL：負けている時、自分のターン開始時に +700。',
  skill: 'STEAL：現在の点差の20%を相手から奪う（最大2000）。',
  ult: 'TURNAROUND：「相手-1000まで追いつく」と「チーム+2000」のより良い方を獲得',
  tone: 'from-amber-500/20 to-yellow-500/10',
  desc: '逆境でこそ輝く反逆者。点差が開くほど牙を研ぎ、土壇場で全てを覆す。',
};
