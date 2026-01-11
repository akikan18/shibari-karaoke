import type { RoleDef } from './types';

export const GamblerRole: RoleDef = {
  id: 'gambler',
  name: 'GAMBLER',
  type: 'TEC',
  sigil: '🎲',
  passive: 'ROLL：成功時に0〜1000のランダムで追加ボーナス。失敗時に0〜-1000からランダムで減点（100刻み）。',
  skill: 'DOUBLE DOWN：成功×2 / 失敗-2000。スキル使用時パッシブがマイナスなった場合でも0にとどまる。',
  ult: 'ALL IN：表なら +5000 ／ 裏なら -1000。',
  tone: 'from-teal-500/20 to-emerald-500/10',
  desc: 'スリルを愛する勝負師。丁か半か、その歌声ですべての運命を賭ける。',
};
