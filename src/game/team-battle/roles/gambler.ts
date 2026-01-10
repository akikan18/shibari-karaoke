import { RoleDef } from './types';

export const GamblerRole: RoleDef = {
  id: 'gambler',
  name: 'GAMBLER',
  type: 'TEC',
  sigil: '🎲',
  passive: 'PASSIVE：成功時に0〜1000のランダムで追加ボーナス。失敗時に0〜-1000からランダムで減点（100刻み）。',
  skill: 'SKILL：(3回) 成功×2 / 失敗-2000。スキル使用時パッシブがマイナスなった場合でも0にとどまる。',
  ult: 'ULT：(1回) 表なら +5000 ／ 裏なら -1000。',
};
