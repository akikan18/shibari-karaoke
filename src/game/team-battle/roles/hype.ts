import { RoleDef } from './types';

export const HypeRole: RoleDef = {
  id: 'hype',
  name: 'HYPE ENGINE',
  type: 'SUP',
  sigil: '✦',
  passive: '自分のターン開始時、チーム+400（結果に依存しない）。',
  skill: 'SKILL：(3回) 選んだ味方の「次の2ターン成功時 +500」(1回)',
  ult: 'ULT：(1回) 以降3ターン味方全員の成功スコア +500',
};
