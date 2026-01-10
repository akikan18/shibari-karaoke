import { RoleDef } from './types';

export const MimicRole: RoleDef = {
  id: 'mimic',
  name: 'MIMIC',
  type: 'TEC',
  sigil: '◈',
  passive: 'MIRROR：直前の味方成功の獲得点30%を、自分成功時に上乗せ。',
  skill: 'ECHO：直前のスコア変動を50%コピー（成功/失敗問わず）。',
  ult: 'MIRROR GIFT：発動後、味方全員の「次の自分のターン」に MIMIC パッシブを付与（そのターンのみ）。',
};
