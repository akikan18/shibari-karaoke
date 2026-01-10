// =========================
// Theme Card
// =========================
export type ThemeCard = string | { title: string; criteria?: string };

export const cardTitle = (c: ThemeCard | null | undefined) => {
  if (!c) return '...';
  return typeof c === 'string' ? c : c.title || '...';
};

export const cardCriteria = (c: ThemeCard | null | undefined) => {
  if (!c) return '...';
  return typeof c === 'string' ? '—' : c.criteria || '—';
};

export const DEFAULT_THEME_POOL: ThemeCard[] = [
  { title: 'FREE THEME', criteria: '好きな曲でOK' },
  { title: 'J-POP', criteria: 'J-POP を歌う' },
  { title: 'アニソン', criteria: 'アニメ関連曲を歌う' },
  { title: 'バラード', criteria: 'バラード系を歌う' },
  { title: 'ロック', criteria: 'ロック系を歌う' },
  { title: '盛り上げ', criteria: '場を盛り上げる曲' },
  { title: '昭和', criteria: '昭和の曲' },
  { title: '平成', criteria: '平成の曲' },
  { title: '令和', criteria: '令和の曲' },
  { title: '英語曲', criteria: '英語の曲' },
];

export const shuffle = <T,>(arr: T[]) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const normalizeThemePool = (poolLike: any): ThemeCard[] => {
  const pool = Array.isArray(poolLike) ? poolLike : [];
  const normalized: ThemeCard[] = pool
    .map((x: any) => {
      if (!x) return null;
      if (typeof x === 'string') return { title: x, criteria: '—' } as ThemeCard;
      if (typeof x === 'object') {
        const title = x.title ?? x.name ?? '';
        const criteria = x.criteria ?? x.condition ?? x.clear ?? '—';
        if (!title) return null;
        return { title, criteria } as ThemeCard;
      }
      return null;
    })
    .filter(Boolean) as ThemeCard[];

  return normalized.length > 0 ? normalized : DEFAULT_THEME_POOL;
};

export const drawFromDeck = <T,>(deckLike: any, pool: T[], n: number) => {
  let d: T[] = Array.isArray(deckLike) ? (deckLike as T[]).slice() : [];
  const p = pool.slice();

  const reshuffle = () => shuffle(p);

  if (!d || d.length === 0) d = reshuffle();

  const picks: T[] = [];
  for (let i = 0; i < n; i++) {
    if (d.length === 0) d = reshuffle();
    const item = d.pop();
    if (item !== undefined) picks.push(item);
  }

  if (n === 1) return { nextDeck: d, picked: picks[0] ?? null, choices: null as T[] | null };
  return { nextDeck: d, picked: null as T | null, choices: picks };
};
