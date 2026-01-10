import type { RoleDef } from './types';

export const HypeRole: RoleDef = {
  id: 'hype',
  name: 'HYPE ENGINE',
  type: 'SUP',
  sigil: '✦',
  passive: 'VIBE：自分のターン開始時、チーム+400（結果に依存しない）。',
  skill: 'HYPE BOOST：選んだ味方の「次の2ターン成功時 +500」(1回)',
  ult: 'ROAR：以降3ターン味方全員の成功スコア +500',
  tone: 'from-rose-500/25 to-red-600/10',
  desc: '会場のボルテージを上げる着火剤。歌唱力関係なし、勢いだけで場を制す。',
};
