// 設定サイトで、選んだ設定からワークフローと README に貼るコードを作る。
// コメントなどの言葉は、サイトと同じくカードの言葉 (language) に合わせる。
// 日本語のページ (/) で最初に出るワークフロー (既定の設定) は、README の日本語の使い方のものと同じになる
// (test/site.test.mjs で確かめている)。
import { HIDEABLE } from '../src/card.mjs';
import { NAME } from './i18n.mjs';
import { PAGES, SITE_URL } from './pages.mjs';

// theme は README に貼るコードだけに使う。auto は見る人の設定に合わせて昼と夜を切り替え、light と dark はいつもその背景にする。
export const DEFAULT_SETTINGS = { character: 'turnip', petName: '', language: 'ja', hide: [], motion: true, theme: 'auto' };

const COMMENTS = {
  ja: {
    cron: '毎日 00:17 (日本時間)',
    language: 'ja (日本語) / en (英語)',
  },
  en: {
    cron: 'every day at 15:17 UTC',
    language: 'ja (Japanese) / en (English)',
  },
};

const head = (lang) => `name: ${NAME[lang]}

on:
  schedule:
    - cron: '17 15 * * *' # ${COMMENTS[lang].cron}
  workflow_dispatch:
  push:
    paths:
      - .github/workflows/tiny-pixel-room.yml

permissions:
  contents: write

concurrency:
  group: tiny-pixel-room

jobs:
  card:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: moppy626/tiny-pixel-room@v1
        with:`;

// カードの下に小さく出す、設定サイトへのリンク。カードを見た人が、同じカードの作り方をたどれる。
// リンク先は、カードの言葉のページ (日本語は /、英語は /en/)。<br> で、細いカードでも横に並ばず、カードの下に出す。
// 要らない人は、<br> からあとの 2 行を消せばよい (README とサイトの手順に書いている)。
const siteLink = (lang) => `<br>
<sub><a href="${SITE_URL}${PAGES[lang]}">${NAME[lang]}</a></sub>
`;

// どの背景でも、動きを減らす設定の人には動かないカード (-still) を見せる。
export function readmeSnippet(lang, theme = DEFAULT_SETTINGS.theme) {
  if (theme === 'auto') {
    return `<picture>
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="tiny-pixel-room/card-dark-still.svg">
  <source media="(prefers-reduced-motion: reduce)" srcset="tiny-pixel-room/card-light-still.svg">
  <source media="(prefers-color-scheme: dark)" srcset="tiny-pixel-room/card-dark.svg">
  <img alt="${NAME[lang]}" src="tiny-pixel-room/card-light.svg">
</picture>
${siteLink(lang)}`;
  }
  return `<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="tiny-pixel-room/card-${theme}-still.svg">
  <img alt="${NAME[lang]}" src="tiny-pixel-room/card-${theme}.svg">
</picture>
${siteLink(lang)}`;
}

// YAML の一重引用符の文字列にする。with: の値の ${{ は Actions の式として読まれるので、式で ${{ と書く。
export function yamlString(value) {
  const literal = value.replaceAll('${{', "${{ '${{' }}");
  return `'${literal.replaceAll("'", "''")}'`;
}

// すべて隠すときは all と書く。あとで項目が増えても、キャラクターだけの細いカードのままになる。
export function hideValue(hide) {
  if (HIDEABLE.every((key) => hide.includes(key))) return 'all';
  return HIDEABLE.filter((key) => hide.includes(key)).join(', ');
}

// lang はコメントの言葉。サイトではカードの言葉と同じにする。
export function workflowYaml({ character, petName, language, hide, motion } = DEFAULT_SETTINGS, lang = language) {
  const inputs = [
    `character: ${character} # turnip / sunflower / cactus`,
    `pet-name: ${yamlString(petName.trim())}`,
    `language: ${language} # ${COMMENTS[lang].language}`,
  ];
  if (hide.length) inputs.push(`hide: ${hideValue(hide)}`);
  if (!motion) inputs.push('motion: false');
  return `${head(lang)}\n${inputs.map((line) => `          ${line}`).join('\n')}\n`;
}
