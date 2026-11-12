// カードの文字のフォント。GNU Unifont JP (漢字とかなが日本の字の形の Unifont) で描く。
// 1 em が 16 ドットで、半角の字は 8 ドット、全角の字は 16 ドットの幅。
import { readFileSync } from 'node:fs';
import * as opentypeModule from 'opentype.js';

const opentype = opentypeModule.default ?? opentypeModule;
// Unifont JP から、カードで使える字だけを取り出したもの。scripts/subset-unifont.mjs で作る。
export const UNIFONT_URL = new URL('../fonts/unifont_jp-subset-18.0.01.otf', import.meta.url);
// 1 em のドットの数。フォントを替えたら見直す (テストで、字の角がこのドットの格子にあるか確かめている)。
export const DOTS_PER_EM = 16;
// フォントを作った Node の Unicode の版。どの字を入れるかは、Unicode のデータ (\p{C} など) で決まる。
// テストは、同じ版の Node のときだけ、フォントの字がこの選び方のとおりか確かめる。
export const FONT_UNICODE_VERSION = '16.0';

// Unifont JP から取り出す字の範囲。文字は 1 字ずつ形にするので、前後の字で形が変わる文字
// (アラビア文字、タイ文字、インドの文字など)、右から左に書く文字、ハングルの組み合わせ用の字母は入れない。
// 点字は、空白の点字が見えない名前に使われるので入れない。
// このうち、isDrawnChar で外す字と、NFC で別の字に変わる字も除く (scripts/subset-unifont.mjs)。
export const UNIFONT_RANGES = [
  [0x0020, 0x02ff], // ラテン文字 (基本、Latin-1、拡張 A / B)、IPA 拡張、修飾文字
  [0x0370, 0x03ff], // ギリシャ文字
  [0x0400, 0x052f], // キリル文字
  [0x0530, 0x058f], // アルメニア文字
  [0x10a0, 0x10ff], // ジョージア文字
  [0x1e00, 0x1fff], // ラテン文字の追加 (ベトナム語など) と、ギリシャ文字の拡張
  [0x2000, 0x205e], // 空白と句読点
  [0x2070, 0x27bf], // 上付き・下付き、通貨、矢印、数学記号、囲み文字、罫線、図形、記号、装飾記号
  [0x2b00, 0x2bff], // その他の記号と矢印
  [0x2e80, 0x2fdf], // 部首
  [0x3000, 0x33ff], // CJK の記号と句読点、かな、注音、ハングルの互換字母、囲み文字
  [0x3400, 0x4dbf], // 漢字 (拡張 A)
  [0x4e00, 0x9fff], // 漢字
  [0xac00, 0xd7a3], // ハングルの音節
  [0xf900, 0xfaff], // CJK 互換漢字
  [0xfb00, 0xfb06], // ラテン文字の合字
  [0xfe10, 0xfe19], // 縦書きの形
  [0xfe30, 0xfe6f], // CJK 互換形、小字形
  [0xff01, 0xffef], // 全角・半角の形
  [0x20000, 0x323af], // 漢字 (拡張 B 以降)
];

// 見えない字: 制御文字、空白、改行、ハングルの埋め字など。点字の空白 (U+2800) も、見えない名前に使われるので含める。
const INVISIBLE = /[\p{C}\p{Z}\p{Default_Ignorable_Code_Point}\u{2800}]/u;
export const isInvisibleChar = (char) => INVISIBLE.test(char);
export const isCombiningMark = (char) => /\p{M}/u.test(char);

// カードで描かない字。Unifont JP に形があっても、フォントを作るときに外す (scripts/subset-unifont.mjs)。
// - 結合文字: 1 字ずつ形にするので、前の字に重ねられない。
// - 空白 (\p{Zs}) のほかの見えない字: Unifont では点線の箱や空白の字になる。
// 色つきで表示される絵文字 (✨ や ☕ など) は、VS15 (U+FE0E) で字として描くよう指定されたときは描くので、
// フォントには入れておき、名前を作るときに外す (card.mjs の isEmoji)。
export const isDrawnChar = (char) => !isCombiningMark(char) && (/\p{Zs}/u.test(char) || !isInvisibleChar(char));

// 字の番号を U+200B の形で返す。
export const codeOf = (char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

// 読むたびに新しいフォントを返す。ふだんは loadFont を使う。
export function parseFont(url = UNIFONT_URL) {
  const bytes = readFileSync(url);
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

// フォントは実行中に変わらないので、1 回だけ読む。
let cached;
export function loadFont() {
  cached ??= parseFont();
  return cached;
}
