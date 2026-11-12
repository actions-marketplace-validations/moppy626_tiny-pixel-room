// キャラクターの成長ルール。GitHub のステータスとは別に数える。
export const THRESHOLDS = [0, 50, 200, 500, 1000];
export const EXP_PER_LEVEL = 20;
// 既定は日本語。言葉を並べて見せるとき (入力の誤りの文など) も、日本語を先にする。
export const LANGUAGES = ['ja', 'en'];
export const DEFAULT_LANGUAGE = 'ja';

export const CHARACTERS = {
  turnip: {
    en: { label: 'Turnip', forms: ['Seed', 'Sprout', 'Turnip', 'Big Turnip', 'King Turnip'] },
    ja: { label: 'カブ', forms: ['たね', 'ふたば', 'カブ', 'おおきなカブ', 'おうさまカブ'] },
  },
  sunflower: {
    en: { label: 'Sunflower', forms: ['Seed', 'Sprout', 'Bud', 'Sunflower', 'King Sunflower'] },
    ja: { label: 'ヒマワリ', forms: ['たね', 'ふたば', 'つぼみ', 'ヒマワリ', 'おうさまヒマワリ'] },
  },
  cactus: {
    en: { label: 'Cactus', forms: ['Pebble', 'Baby Cactus', 'Cactus', 'Big Cactus', 'King Cactus'] },
    ja: { label: 'サボテン', forms: ['こつぶ', 'ちびサボテン', 'サボテン', 'おおきなサボテン', 'おうさまサボテン'] },
  },
};

export function describeGrowth(character, exp, language = DEFAULT_LANGUAGE) {
  if (!Object.hasOwn(CHARACTERS, character)) throw new Error(`unknown character: ${character}`);
  const kind = CHARACTERS[character][language];
  const stage = THRESHOLDS.filter((t) => exp >= t).length - 1;
  const next = THRESHOLDS[stage + 1];
  return {
    character,
    exp,
    stage,
    level: Math.floor(exp / EXP_PER_LEVEL) + 1,
    levelExp: exp % EXP_PER_LEVEL,
    formName: kind.forms[stage],
    nextForm: kind.forms[stage + 1] ?? null,
    toNext: next === undefined ? 0 : next - exp,
  };
}
