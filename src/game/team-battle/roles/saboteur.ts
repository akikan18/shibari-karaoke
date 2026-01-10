import { RoleDef } from './types';

export const SaboteurRole: RoleDef = {
  id: 'saboteur',
  name: 'SABOTEUR',
  type: 'TEC',
  sigil: '☒',
  passive: '自分成功で敵チーム-300。',
  skill: 'SKILL：(3回) 敵1人指定：その敵が成功時 +0 / 失敗時 -1000（1回）',
  ult: 'ULT：(1回) 次の敵チーム全員の「次の自分の番」1回分、特殊効果をリセットしパッシブ/スキル/ULTを無効化（味方は対象外）',
};
