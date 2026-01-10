import type { RoleDef } from './types';

export const SaboteurRole: RoleDef = {
  id: 'saboteur',
  name: 'SABOTEUR',
  type: 'TEC',
  sigil: '☒',
  passive: 'JAMMING：自分成功で敵チーム-300。',
  skill: 'SABOTAGE：敵1人指定：その敵が成功時 +0 / 失敗時 -1000（1回）',
  ult: 'BLACKOUT：次の敵チーム全員の「次の自分の番」1回分、特殊効果をリセットしパッシブ/スキル/ULTを無効化（味方は対象外）',
  tone: 'from-red-500/20 to-orange-500/10',
  desc: '影から崩す攪乱工作員。敵のペースを乱し、知らぬ間に勝利を奪い取る。',
};
