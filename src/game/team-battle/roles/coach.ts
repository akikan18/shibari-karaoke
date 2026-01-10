import { RoleDef } from './types';

export const CoachRole: RoleDef = {
  id: 'coach',
  name: 'THE COACH',
  type: 'SUP',
  sigil: '✚',
  passive: 'GUIDANCE：味方ターン開始時、チーム+150（歌唱結果に依存しない）。',
  skill: 'TIMEOUT：指定味方にSAFE付与。次の失敗でもチーム+300。',
  ult: 'CLUTCH PLAY：指定した味方は次のターン成功になる',
};
