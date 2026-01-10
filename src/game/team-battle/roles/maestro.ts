import type { RoleDef } from './types';

export const MaestroRole: RoleDef = {
  id: 'maestro',
  name: 'THE MAESTRO',
  type: 'ATK',
  sigil: '⬢',
  passive: 'VIRTUOSO：成功でCOMBO+1(最大5)。成功ボーナス+250×COMBO。失敗でCOMBO消滅のみ（減点なし）。',
  skill: 'ACCELERANDO：このターン「成功なら追加でCOMBO+2 / 失敗なら-500」',
  ult: 'FINALE：COMBO×800をチーム付与しCOMBO消費。味方次成功+500(1回)',
  tone: 'from-cyan-500/30 to-blue-600/10',
  desc: '旋律を支配する絶対王者。ミス無き演奏が、天井知らずのスコアを叩き出す。',
};
