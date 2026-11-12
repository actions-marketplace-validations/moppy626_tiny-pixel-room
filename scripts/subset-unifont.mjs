// GNU Unifont JP から、カードで使う字だけを取り出して fonts/ に書き出す。
// fontTools を使うので、python3 から fontTools を読めるようにしておく (python3 -m pip install fonttools)。
// 使い方: node scripts/subset-unifont.mjs <unifont_jp-18.0.01.otf のパス>
// 元のフォントは https://ftp.gnu.org/gnu/unifont/unifont-18.0.01/ にある。版を変えたら UNIFONT_URL のファイル名も変える。
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_UNICODE_VERSION, UNIFONT_RANGES, UNIFONT_URL, codeOf, isDrawnChar } from '../src/fonts.mjs';

// どの字を入れるかは、このスクリプトを動かす Node の Unicode のデータ (\p{C} など) で決まるので、
// 同じ手順でも、Unicode の版が違えば中身が変わる。作った版は FONT_UNICODE_VERSION に書いておく。
// 新しい版の Node で作り直すときは、FONT_UNICODE_VERSION をその版に変える。
// そのとき新しく割り当てられた字も入るが、古い版の Node で動いても、フォントにある字はそのまま描ける。

const source = process.argv[2];
if (!source) {
  console.error('使い方: node scripts/subset-unifont.mjs <unifont_jp-18.0.01.otf のパス>');
  process.exit(1);
}
if (process.versions.unicode !== FONT_UNICODE_VERSION) {
  console.error(
    `この Node は Unicode ${process.versions.unicode} です。src/fonts.mjs の FONT_UNICODE_VERSION (${FONT_UNICODE_VERSION}) を ` +
      `${process.versions.unicode} に変えてから作り直すか、Unicode ${FONT_UNICODE_VERSION} の Node で動かしてください`,
  );
  process.exit(1);
}

// カードで描かない字 (isDrawnChar) は入れない。名前は NFC にそろえてから描くので、NFC で別の字に変わる字
// (CJK 互換漢字の多く、Ω など) も要らない。
const needed = (char) => isDrawnChar(char) && char.normalize('NFC') === char;
const chars = UNIFONT_RANGES.flatMap(([first, last]) =>
  Array.from({ length: last - first + 1 }, (_, i) => String.fromCodePoint(first + i)),
).filter(needed);

// この一部のフォントは SIL Open Font License 1.1 で配る (fonts/UNIFONT-LICENSE.txt)。元のフォントの名前の表には
// OFL と GPL の両方が書いてあるので、ライセンスの説明 (name ID 13) と URL (name ID 14) を OFL だけに書き換える。
// 作り直しても同じファイルになるよう、更新日時は元のまま残す。
const RELICENSE = `
import sys
from fontTools.ttLib import TTFont
path, license, url = sys.argv[1:]
font = TTFont(path, recalcTimestamp=False)
font['name'].setName(license, 13, 3, 1, 0x409)
font['name'].setName(url, 14, 3, 1, 0x409)
font.save(path)
`;
const LICENSE = 'This subset of GNU Unifont JP is licensed under the SIL Open Font License, Version 1.1.';
const LICENSE_URL = 'https://openfontlicense.org';

const dir = mkdtempSync(join(tmpdir(), 'unifont-'));
try {
  const list = join(dir, 'unicodes.txt');
  writeFileSync(list, chars.map(codeOf).join('\n'));
  // 途中で止まっても fonts/ のフォントが壊れないよう、一時フォルダで作り終えてから置き換える。
  const subset = join(dir, 'subset.otf');
  // python3 は、今のフォルダのファイルも import する。知らないファイルを読まないよう、作ったばかりの一時フォルダで動かす。
  const python = (args) => execFileSync('python3', args, { cwd: dir, stdio: 'inherit' });
  // 著作権の記載を残すため、名前の表はすべて残す。
  python([
    '-m', 'fontTools.subset',
    resolve(source),
    `--unicodes-file=${list}`,
    `--output-file=${subset}`,
    '--name-IDs=*',
    '--name-languages=*',
    '--notdef-outline',
    '--layout-features=',
  ]);
  python(['-c', RELICENSE, subset, LICENSE, LICENSE_URL]);
  // 一時フォルダは別のドライブにあることがあり、そこからは名前を変えて移せない。fonts/ に写してから名前を変えると、
  // 置き換えは一度に済み、写している途中で止まっても元のフォントが残る。
  const output = fileURLToPath(UNIFONT_URL);
  const partial = `${output}.partial`;
  try {
    copyFileSync(subset, partial);
    renameSync(partial, output);
  } finally {
    rmSync(partial, { force: true });
  }
  console.log(`${output} に字を書き出しました (${statSync(output).size} バイト)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
