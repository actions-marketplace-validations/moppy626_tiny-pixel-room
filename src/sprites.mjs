// ドット絵のデータと、コマ送りの段取り。
import data from './sprites.json' with { type: 'json' };

export const PALETTE = {
  k: '#17122F', g: '#7FE08A', d: '#3FB56A', w: '#F4FFE9', p: '#FF9DC4', s: '#C9925A',
  v: '#B79CFF', y: '#FFD24F', o: '#FF9A3D', r: '#F2668B', n: '#5A4033', b: '#C08A4E', q: '#E08A5B',
};

export const TICK_MS = 150;

const TIMELINE = [
  ['n', 5], ['s', 3], ['n', 4], ['l', 3], ['n', 2], ['r', 3], ['n', 4],
  ['b', 1], ['n', 2], ['b', 1], ['n', 4],
  ['s', 2], ['l', 1, 10], ['n', 1, 20], ['n', 2, 30], ['r', 1, 20], ['n', 1, 10], ['s', 2], ['n', 3],
];

export function formOf(character, stage) {
  const form = data[character]?.[stage];
  if (!form) throw new Error(`no sprite for ${character} stage ${stage}`);
  return form;
}

export function allForms() {
  return Object.entries(data).flatMap(([character, forms]) =>
    forms.map((form, stage) => ({ character, stage, form })),
  );
}

export function framesOf(form) {
  const { rows, squash, leaves, blink } = form;
  const blank = '.'.repeat(rows[0].length);
  return {
    n: rows,
    s: [blank, ...rows.slice(0, squash), ...rows.slice(squash + 1)],
    b: rows.map((row, i) => blink[i] ?? row),
    l: rows.map((row, i) => (i < leaves ? `${row.slice(1)}.` : row)),
    r: rows.map((row, i) => (i < leaves ? `.${row.slice(0, -1)}` : row)),
  };
}

export function stepsOf(form) {
  return TIMELINE.flatMap(([frame, ticks, lift = 0]) =>
    Array.from({ length: ticks }, () => ({ frame, lift: Math.min(lift, form.hop) })),
  );
}
