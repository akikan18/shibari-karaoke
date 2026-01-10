import { RoleDef } from './types';

export const CoachRole: RoleDef = {
  id: 'coach',
  name: 'THE COACH',
  type: 'SUP',
  sigil: '✚',
  passive: '味方ターン開始時、チーム+150（歌唱結果に依存しない）。',
  skill: 'SKILL：(3回) TIMEOUT：指定味方にSAFE付与。次の失敗でもチーム+300。',
  ult: 'ULT：(1回) 指定した味方は次のターン成功になる',
};
