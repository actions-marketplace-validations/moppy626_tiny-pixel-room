// 設定サイト (GitHub Pages) を _site に作る。使い方: npm run site
// カードを描くコードは Action と同じ src を使い、Node でしか使えない部分 (node:fs など) だけを差し替える。
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { build } from 'esbuild';
import { buildCards } from '../src/card.mjs';
import { UNIFONT_URL } from '../src/fonts.mjs';
import { CHARACTERS, LANGUAGES } from '../src/growth.mjs';
import { THEMES, escapeXml } from '../src/render.mjs';
import { PALETTE, formOf } from '../src/sprites.mjs';
import { SITE_FONT_PATH } from '../site/font.mjs';
import { NAME, TEXT } from '../site/i18n.mjs';
import { PAGES, SITE_URL } from '../site/pages.mjs';
import { PREVIEW_EXP, sampleAccount } from '../site/sample.mjs';
import { spriteSvg } from '../site/sprite.mjs';
import { DEFAULT_SETTINGS } from '../site/workflow.mjs';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const OUT = root('_site/');

// node: で始まる import を site/node-stub.mjs に向ける。
const nodeStub = {
  name: 'node-stub',
  setup(builder) {
    builder.onResolve({ filter: /^node:/ }, () => ({ path: root('site/node-stub.mjs') }));
  },
};

export function bundleSite(options = {}) {
  return build({
    entryPoints: [root('site/main.mjs')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    plugins: [nodeStub],
    logLevel: 'warning',
    ...options,
  });
}

const LOCALES = { ja: 'ja_JP', en: 'en_US' };
const HTML_TAG = '<html lang="ja" data-lang="ja">';
const PAGE_META = '<!-- page-meta -->';
const SAMPLE_CARD = '<!-- sample-card -->';
const OG_IMAGE = { name: 'og-image.png', width: 1200, height: 630 };
// 見本のカードの大きさ。すべての項目を出したカードの大きさ (test/site.test.mjs で sampleCards と同じか確かめている)。
export const SAMPLE_CARD_SIZE = { width: 840, height: 616 };

// site/index.html から、lang の言葉のページを作る。<html> の言葉を変え、<!-- page-meta --> に <head> の情報を、
// <!-- sample-card --> にその言葉の見本のカードを入れる。
export function pageHtml(template, lang) {
  for (const marker of [HTML_TAG, PAGE_META, SAMPLE_CARD]) {
    if (!template.includes(marker)) throw new Error(`site/index.html には ${marker} が要ります`);
  }
  const url = `${SITE_URL}${PAGES[lang]}`;
  const { title, description, imageAlt, sampleAlt } = TEXT[lang];
  const others = Object.keys(PAGES).filter((other) => other !== lang);
  const depth = PAGES[lang].split('/').length - 1;
  const meta = [
    // en/ のページも、スタイルやスクリプトやフォントは、サイトの一番上のものを読む。
    ...(depth ? [`<base href="${'../'.repeat(depth)}">`] : []),
    `<title>${escapeXml(title)}</title>`,
    `<meta name="description" content="${escapeXml(description)}">`,
    `<link rel="canonical" href="${url}">`,
    ...Object.keys(PAGES).map((key) => `<link rel="alternate" hreflang="${key}" href="${SITE_URL}${PAGES[key]}">`),
    // 日本語でも英語でもない言葉で探した人には、英語のページを出す。
    `<link rel="alternate" hreflang="x-default" href="${SITE_URL}${PAGES.en}">`,
    // SNS などにリンクを貼ったときに出る、タイトル、説明、画像。
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${escapeXml(NAME[lang])}">`,
    `<meta property="og:title" content="${escapeXml(title)}">`,
    `<meta property="og:description" content="${escapeXml(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE_URL}${OG_IMAGE.name}">`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}">`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}">`,
    `<meta property="og:image:alt" content="${escapeXml(imageAlt)}">`,
    `<meta property="og:locale" content="${LOCALES[lang]}">`,
    ...others.map((other) => `<meta property="og:locale:alternate" content="${LOCALES[other]}">`),
    '<meta name="twitter:card" content="summary_large_image">',
  ];
  // スクリプトが動かなくても、見本のカードだと分かるよう、alt はその言葉で書いておく。
  const { width, height } = SAMPLE_CARD_SIZE;
  const card = `<img id="card" src="samples/card-${lang}-light-still.svg" width="${width}" height="${height}" alt="${escapeXml(sampleAlt)}">`;
  // 置き換える文字列の $& などが特別な意味にならないよう、置き換えは関数で渡す。
  return template
    .replace(HTML_TAG, () => `<html lang="${lang}" data-lang="${lang}">`)
    .replace(PAGE_META, () => meta.join('\n  '))
    .replace(SAMPLE_CARD, () => card);
}

// フォントを読み終えるまでと、読めなかったときにプレビューに出す見本のカード。[書き出す名前, 中身] の組で返す。
// 最初のプレビューと同じ設定 (既定の設定で、いちばん小さい育ち具合) で、言葉と背景ごとに、動かないカードを作る。
export function sampleCards() {
  return LANGUAGES.flatMap((language) => {
    const cards = buildCards(sampleAccount(), { ...DEFAULT_SETTINGS, language, exp: PREVIEW_EXP[0] });
    return ['light', 'dark'].map((mode) => [`samples/card-${language}-${mode}-still.svg`, cards[`card-${mode}-still.svg`]]);
  });
}

const WOFF_HEADER_SIZE = 44;
const WOFF_ENTRY_SIZE = 20;
const pad4 = (length) => Math.ceil(length / 4) * 4;

// OTF のフォントを WOFF 1.0 (https://www.w3.org/TR/WOFF/) にする。字の形などの中身は変えず、表ごとに zlib で縮める。
// フォントは 4 MB を超えるが、OTF のままだと、Pages が縮めずに送ったときにプレビューが重くなる。
// opentype.js (中の tiny-inflate) とブラウザの FontFace は、どちらも WOFF をそのまま読める。
export function woff(sfnt) {
  const numTables = sfnt.readUInt16BE(4);
  // OTF の表の一覧は、タグの順に並んでいる。WOFF の表の一覧も、同じくタグの順にする。
  const tables = Array.from({ length: numTables }, (_, i) => {
    const record = 12 + i * 16;
    const offset = sfnt.readUInt32BE(record + 8);
    const length = sfnt.readUInt32BE(record + 12);
    const data = sfnt.subarray(offset, offset + length);
    const compressed = deflateSync(data, { level: 9 });
    return {
      tag: sfnt.subarray(record, record + 4),
      checksum: sfnt.readUInt32BE(record + 4),
      length,
      // 縮めても小さくならない表は、縮めずに入れる (WOFF の決まり)。
      data: compressed.length < length ? compressed : data,
    };
  }).sort((a, b) => Buffer.compare(a.tag, b.tag));

  // 表は一覧のすぐあとから、一覧と同じ順に、4 バイトの区切りまで 0 で埋めて並べる。
  let offset = WOFF_HEADER_SIZE + WOFF_ENTRY_SIZE * numTables;
  const directory = Buffer.alloc(offset);
  tables.forEach(({ tag, checksum, length, data }, i) => {
    const entry = WOFF_HEADER_SIZE + i * WOFF_ENTRY_SIZE;
    tag.copy(directory, entry);
    directory.writeUInt32BE(offset, entry + 4);
    directory.writeUInt32BE(data.length, entry + 8);
    directory.writeUInt32BE(length, entry + 12);
    directory.writeUInt32BE(checksum, entry + 16);
    offset += pad4(data.length);
  });
  directory.write('wOFF', 0, 'latin1');
  directory.writeUInt32BE(sfnt.readUInt32BE(0), 4); // 元のフォントの種類 (CFF の字の形なら OTTO)
  directory.writeUInt32BE(offset, 8); // WOFF 全体の大きさ
  directory.writeUInt16BE(numTables, 12);
  // 元に戻したときの OTF の大きさ。版、メタデータ、私用データの欄は 0 のままにする。
  const sfntSize = 12 + 16 * numTables + tables.reduce((sum, { length }) => sum + pad4(length), 0);
  directory.writeUInt32BE(sfntSize, 16);
  const blocks = tables.map(({ data }) => Buffer.concat([data, Buffer.alloc(pad4(data.length) - data.length)]));
  return Buffer.concat([directory, ...blocks]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const rgba = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);

// RGBA の画素 (1 画素 4 バイト、左上から順) を PNG にする。
function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // 行の先頭に、フィルタなし (0) の 1 バイトを置く
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 ビットの RGBA
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ドット絵の PNG を作る。background (なければ透明) の上に、rects の四角と、sprites のキャラクターを順に塗る。
// sprites は { rows, scale, left, top } で、キャラクターの 1 ドットを scale px の正方形にする。
// 画像からはみ出した分は塗らない (隣の行に回り込ませない)。
export function pixelPng(width, height, { background, rects = [], sprites = [] }) {
  const pixels = Buffer.alloc(width * height * 4);
  const fill = (x, y, w, h, color) => {
    const value = rgba(color);
    const [left, right] = [Math.max(x, 0), Math.min(x + w, width)];
    const [top, bottom] = [Math.max(y, 0), Math.min(y + h, height)];
    for (let row = top; row < bottom; row++) for (let col = left; col < right; col++) pixels.set(value, (row * width + col) * 4);
  };
  if (background) fill(0, 0, width, height, background);
  for (const { x, y, width: w, height: h, color } of rects) fill(x, y, w, h, color);
  for (const { rows, scale, left, top } of sprites) {
    rows.forEach((row, dy) => {
      Array.from(row).forEach((key, dx) => {
        if (key !== '.') fill(left + dx * scale, top + dy * scale, scale, scale, PALETTE[key]);
      });
    });
  }
  return encodePng(width, height, pixels);
}

// size px 四方の真ん中に、1 ドットを scale px にしたキャラクターを置く。
const centered = (rows, scale, size) => ({
  rows,
  scale,
  left: Math.floor((size - rows[0].length * scale) / 2),
  top: Math.floor((size - rows.length * scale) / 2),
});

// サイトのアイコンにするカブ。この姿は 16 × 16 ドットなので、16px のアイコンで 1 ドットがちょうど 1px になる。
const ICON_ROWS = formOf('turnip', 2).rows;

// サイトのアイコン。[書き出す名前, 中身] の組で返す。
// iPhone などのホーム画面のアイコン (apple-touch-icon) は、透明なところが黒くなるので、昼のおへやの壁の色を敷く。
export function siteIcons() {
  return [
    ['favicon.svg', spriteSvg(ICON_ROWS, 1)],
    ['favicon.png', pixelPng(32, 32, { sprites: [centered(ICON_ROWS, 2, 32)] })],
    ['apple-touch-icon.png', pixelPng(180, 180, { background: THEMES.light.wall, sprites: [centered(ICON_ROWS, 8, 180)] })],
  ];
}

// SNS などにリンクを貼ったときの画像。昼のおへやの床のラグに、3 つのキャラクターの最後の姿を並べ、カードと同じ色の枠で囲む。
export function ogImage() {
  const { width, height } = OG_IMAGE;
  const c = THEMES.light;
  const scale = 12;
  const gap = 90;
  const floor = 450; // 床の上端
  const frame = 12;
  const forms = Object.keys(CHARACTERS).map((key) => formOf(key, 4).rows);
  const total = forms.reduce((sum, rows) => sum + rows[0].length * scale, 0) + gap * (forms.length - 1);
  let left = Math.floor((width - total) / 2);
  const sprites = forms.map((rows) => {
    const sprite = { rows, scale, left, top: floor + 36 - rows.length * scale };
    left += rows[0].length * scale + gap;
    return sprite;
  });
  const rugLeft = sprites[0].left - 60;
  return pixelPng(width, height, {
    background: c.wall,
    rects: [
      { x: 0, y: floor, width, height: height - floor, color: c.floor },
      { x: rugLeft, y: floor + 24, width: width - rugLeft * 2, height: 24, color: c.rug },
      { x: 0, y: 0, width, height: frame, color: c.frame },
      { x: 0, y: height - frame, width, height: frame, color: c.frame },
      { x: 0, y: 0, width: frame, height, color: c.frame },
      { x: width - frame, y: 0, width: frame, height, color: c.frame },
    ],
    sprites,
  });
}

// テストから bundleSite などだけを使えるよう、直接動かしたときだけ書き出す。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await bundleSite({ outfile: `${OUT}main.js` });
  const template = await readFile(root('site/index.html'), 'utf8');
  for (const lang of Object.keys(PAGES)) {
    await mkdir(`${OUT}${PAGES[lang]}`, { recursive: true });
    await writeFile(`${OUT}${PAGES[lang]}index.html`, pageHtml(template, lang));
  }
  const copies = [
    ['site/style.css', 'style.css'],
    ['fonts/UNIFONT-LICENSE.txt', 'fonts/UNIFONT-LICENSE.txt'],
    ['THIRD_PARTY_LICENSES.txt', 'THIRD_PARTY_LICENSES.txt'],
  ];
  for (const [from, to] of copies) await cp(root(from), `${OUT}${to}`);
  // プレビューで使うフォント。OTF を WOFF にして、main.mjs が読む SITE_FONT_PATH に置く。
  await mkdir(dirname(`${OUT}${SITE_FONT_PATH}`), { recursive: true });
  await writeFile(`${OUT}${SITE_FONT_PATH}`, woff(await readFile(UNIFONT_URL)));
  await mkdir(`${OUT}samples`, { recursive: true });
  for (const [name, content] of [...siteIcons(), ...sampleCards()]) await writeFile(`${OUT}${name}`, content);
  await writeFile(`${OUT}${OG_IMAGE.name}`, ogImage());
  console.log(`${OUT} にサイトを書き出しました`);
}
