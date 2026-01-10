import type { RoleDef } from './types';

export const MimicRole: RoleDef = {
  id: 'mimic',
  name: 'MIMIC',
  type: 'TEC',
  sigil: '◈',
  passive: 'MIRROR：直前の味方成功の獲得点30%を、自分成功時に上乗せ。',
  skill: 'ECHO：直前のスコア変動を50%コピー（成功/失敗問わず）。',
  ult: 'MIRROR GIFT：発動後、味方全員の「次の自分のターン」に MIMIC パッシブを付与（そのターンのみ）。',
  tone: 'from-slate-500/25 to-zinc-500/10',
  desc: '変幻自在のトリックスター。他者の才能を模倣し、己の力として還元する。',
};
