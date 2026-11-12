import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadFont } from '../src/fonts.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('dist に同梱している opentype.js のライセンス全文を、いま使っている版の名前で載せる', () => {
  const license = read('../node_modules/opentype.js/LICENSE').trim();
  const { version } = JSON.parse(read('../node_modules/opentype.js/package.json'));
  const licenses = read('../THIRD_PARTY_LICENSES.txt');
  assert.ok(licenses.includes(license));
  assert.ok(licenses.includes(`opentype.js ${version}\n`), `opentype.js ${version}`);
});

// opentype.js は、WOFF を読むための tiny-inflate を中に含めて配っている。dist やサイトのスクリプトにもそのまま入るので、
// opentype.js とは別に、tiny-inflate の著作権表示とライセンスも載せる。
test('opentype.js の中に含まれる tiny-inflate のライセンスも、その版の名前で載せる', () => {
  const bundled = read('../node_modules/opentype.js/dist/opentype.js').match(/\/\/ src\/tiny-inflate@(\d+\.\d+\.\d+)/);
  assert.ok(bundled, 'opentype.js が tiny-inflate を含まなくなったら、このテストと THIRD_PARTY_LICENSES.txt を見直す');
  const licenses = read('../THIRD_PARTY_LICENSES.txt');
  assert.ok(licenses.includes(`tiny-inflate ${bundled[1]} `), `tiny-inflate ${bundled[1]}`);
  assert.match(licenses, /Copyright \(c\) 2015-present Devon Govett/);
});

test('Unifont の一部を使うので、著作権表示とライセンスを fonts に置き、README からたどれる', () => {
  const license = read('../fonts/UNIFONT-LICENSE.txt');
  assert.match(license, /Copyright © 1998-2026 Roman Czyborra, Paul Hardy/);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.ok(read('../README.md').includes('(fonts/UNIFONT-LICENSE.txt)'));
});

test('フォントの中のライセンスの記載も、同梱のライセンスと同じ OFL 1.1 だけになっている', () => {
  const { license, licenseURL } = loadFont().names.windows;
  assert.match(license.en, /SIL Open Font License, Version 1\.1/);
  assert.doesNotMatch(license.en, /GPL/);
  assert.equal(licenseURL.en, 'https://openfontlicense.org');
});

test('README から同梱ソフトのライセンスをたどれる', () => {
  assert.ok(read('../README.md').includes('(THIRD_PARTY_LICENSES.txt)'));
});
