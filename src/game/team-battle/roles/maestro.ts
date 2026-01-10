import { RoleDef } from './types';

export const MaestroRole: RoleDef = {
  id: 'maestro',
  name: 'THE MAESTRO',
  type: 'ATK',
  sigil: '⬢',
  passive: '成功でCOMBO+1(最大5)。成功ボーナス+250×COMBO。失敗でCOMBO消滅のみ（減点なし）。',
  skill: 'SKILL：(3回) このターン「成功なら追加でCOMBO+2 / 失敗なら-500」',
  ult: 'ULT：(1回) COMBO×800をチーム付与しCOMBO消費。味方次成功+500(1回)',
};
