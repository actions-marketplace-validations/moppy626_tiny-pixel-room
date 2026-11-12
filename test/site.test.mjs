import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import * as opentypeModule from 'opentype.js';
import { HIDEABLE, MAX_NAME_LENGTH } from '../src/card.mjs';
import { UNIFONT_URL, loadFont } from '../src/fonts.mjs';
import { DEFAULT_LANGUAGE, LANGUAGES } from '../src/growth.mjs';
import { THEMES, textPathData } from '../src/render.mjs';
import { PALETTE } from '../src/sprites.mjs';
import { SAMPLE_CARD_SIZE, bundleSite, ogImage, pageHtml, pixelPng, sampleCards, siteIcons, woff } from '../scripts/build-site.mjs';
import { SITE_FONT_PATH } from '../site/font.mjs';
import { NAME, TEXT } from '../site/i18n.mjs';
import { ITEMS } from '../site/items.mjs';
import { PAGES, SITE_URL } from '../site/pages.mjs';
import { DEFAULT_SETTINGS, hideValue, readmeSnippet, workflowYaml, yamlString } from '../site/workflow.mjs';
import { actionInputs } from './fixtures/action-inputs.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

// README はファイルを分ける。既定の言葉 (language: ja) に合わせて、GitHub で最初に出る README.md は日本語で書き、
// 英語は README.en.md に書く。2 つのファイルは、先頭で互いにリンクする。
const README = { ja: '../README.md', en: '../README.en.md' };
const japaneseReadme = () => read(README.ja);
const englishReadme = () => read(README.en);

// README の日本語の使い方のワークフロー。番号付きの手順の中にあるので、3 文字の字下げを外す。
function readmeWorkflow() {
  const block = japaneseReadme().match(/```yaml\n([\s\S]*?)\n\s*```/)[1];
  return `${block.replace(/^ {3}/gm, '')}\n`;
}

// 名前を変えるときは、src/messages.mjs の NAME と、ここで確かめる所をいっしょに変える。
// カードのタイトル、コミットのメッセージ、ワークフローの name、README に貼るコードは NAME から作る。
test('action.yml の name、README とサイトの見出しは、NAME と同じ名前にする', () => {
  assert.equal(read('../action.yml').match(/^name: (.+)$/m)[1], NAME.en);
  assert.equal(japaneseReadme().split('\n')[0], `# ${NAME.ja} (${NAME.en})`);
  assert.equal(englishReadme().split('\n')[0], `# ${NAME.en}`);
  assert.ok(read('../site/index.html').includes(`<h1 class="pixel"><span data-lang="ja">${NAME.ja}</span><span data-lang="en">${NAME.en}</span></h1>`));
});

// 日本語のページ (/) では、カードの言葉の最初の選択が ja になる (main.mjs)。README の日本語の使い方のワークフローも language: ja。
test('既定の設定のワークフローは、日本語のページで最初に出るもので、README の日本語の使い方のものと同じ', () => {
  assert.equal(DEFAULT_SETTINGS.language, DEFAULT_LANGUAGE);
  assert.equal(actionInputs().language, DEFAULT_LANGUAGE);
  const readme = readmeWorkflow();
  assert.match(readme, /^ {10}language: ja #/m);
  assert.equal(workflowYaml(DEFAULT_SETTINGS), readme);
});

test('examples/workflow.yml は、先頭の置き場所の説明のほかは README の使い方のワークフローと同じ', () => {
  const example = read('../examples/workflow.yml');
  assert.match(example, /^# .*\.github\/workflows\/tiny-pixel-room\.yml/);
  assert.equal(example.replace(/^(#.*\n)+/, ''), readmeWorkflow());
});

test('英語を選ぶと、ワークフローと README に貼るコードの説明も英語にする', () => {
  const english = { ...DEFAULT_SETTINGS, language: 'en' };
  assert.doesNotMatch(workflowYaml(english), JAPANESE);
  assert.doesNotMatch(readmeSnippet('en'), JAPANESE);
  // 違うのは名前とコメントだけで、ワークフローの動きは日本語のものと同じ。
  const strip = (yaml) => yaml.replace(/^name: .*$/m, '').replace(/ *#.*$/gm, '');
  assert.equal(strip(workflowYaml(english)), strip(workflowYaml(english, 'ja')));
});

// README の項目の表 (日本語は「カードに出す項目」、英語は「Items on the card」)。| 項目 | `hide` に書く名前 | 説明 | の行を読む。
// 見出しの深さは日本語と英語で違うので問わない。
function readmeItems(heading, path) {
  const section = read(path).split(new RegExp(`\\n#+ ${heading}\\n`))[1].split(/\n#+ /)[0];
  const rows = [...section.matchAll(/^\| (.+?) \| `(\w+)` \| (.+?) \|$/gm)];
  return rows.map(([, label, key, description]) => [key, { label, description }]);
}

const itemsIn = (lang) => Object.entries(ITEMS).map(([key, { label, description }]) => [key, { label, description: description[lang] }]);

test('設定サイトの項目の名前と日本語の説明は、README の「カードに出す項目」の表と同じ', () => {
  assert.deepEqual(Object.keys(ITEMS), HIDEABLE);
  assert.deepEqual(readmeItems('カードに出す項目', README.ja), itemsIn('ja'));
});

test('既定の言葉に合わせて、README.md は日本語で書いて英語の README.en.md とリンクし合い、action.yml の説明は日本語を先に書く', () => {
  const japanese = japaneseReadme();
  const english = englishReadme();
  assert.equal(japanese.split('\n')[2], '日本語 | [English](README.en.md)');
  assert.equal(english.split('\n')[2], '[日本語](README.md) | English');
  assert.doesNotMatch(japanese, /\n#+ English\n/);
  // 先頭のサンプルのカードは、それぞれの言葉のカード。代わりの文もその言葉で書く。
  const sample = (readme) => readme.match(/<img alt="([^"]+)" src="([^"]+)"/).slice(1);
  const [japaneseAlt, japaneseCard] = sample(japanese);
  const [englishAlt, englishCard] = sample(english);
  assert.match(japaneseAlt, JAPANESE);
  assert.doesNotMatch(englishAlt, JAPANESE);
  assert.equal(japaneseCard, 'examples/samples/card-light.svg');
  assert.equal(englishCard, 'examples/samples/card-en-light.svg');
  // action.yml の説明は「日本語 / 英語」。最後の日本語の字より後に「 / 」があり、そのあとは英語だけ。
  const descriptions = [...read('../action.yml').matchAll(/^ *description: (.+)$/gm)].map(([, text]) => text);
  assert.ok(descriptions.length > 1);
  for (const text of descriptions) {
    const lastJapanese = Math.max(...[...text.matchAll(new RegExp(JAPANESE.source, 'gu'))].map(({ index }) => index));
    assert.ok(lastJapanese >= 0 && /\s\/\s+[A-Za-z]/.test(text.slice(lastJapanese)), text);
  }
});

// SECURITY.md は、リポジトリの Security タブにも出る。README と同じく日本語の節を先に書き、
// どちらの節だけを読んでも、非公開で報告する窓口が分かるようにする。
test('SECURITY.md も日本語の節を先に書き、どちらの節にも非公開で報告する窓口を書く', () => {
  const policy = read('../SECURITY.md');
  assert.ok(policy.includes('\n## 日本語\n') && policy.indexOf('\n## 日本語\n') < policy.indexOf('\n## English\n'));
  const [japanese, english] = policy.split('\n## 日本語\n')[1].split('\n## English\n');
  assert.doesNotMatch(english, JAPANESE);
  const advisory = '(https://github.com/moppy626/tiny-pixel-room/security/advisories/new)';
  assert.ok(english.includes(advisory) && japanese.includes(advisory));
});

// 非公開の活動をカードに入れる方法は、使う人に案内しない。プロフィールの設定 (Private contributions)、
// ワークフローを非公開リポジトリで動かすこと (既定のトークンで読めるそのリポジトリが数に入る)、
// 非公開リポジトリを読めるトークンを渡すこと (渡せば数に入る) のどれも書かない。
// トークンについては、自分のトークンを渡す使い方はサポートしていない、とだけ書く。トークンの作り方や渡し方
// (personal access token、secrets など) も書かない。
// 案内に従って設定を変えた結果 (非公開の活動の数がプロフィールに出るなど) に、責任を持てないため。
// サイトの文は index.html のほか、スクリプトで出す文 (i18n.mjs、items.mjs) や、作るワークフロー (workflow.mjs) にもあるので、
// site のファイルはすべて確かめる。
const GUIDANCE = [
  // プロフィールの設定。日本語の画面の言葉で書いたときも見つける。
  /Private contributions|Contribution settings|Contributions (?:&|and) activity|プライベート(?:な| )?コントリビューション|非公開の(?:コントリビューション|貢献)|非公開の活動を(?:含め|入れ|表示)/i,
  // 非公開リポジトリで動かすこと。
  /非公開リポジトリで動か|in a private repositor|count private|include private|including private|private repositories too|非公開リポジトリの分も数え|非公開の活動も/i,
  // 非公開リポジトリを読めるトークンを作って渡すこと。
  /非公開リポジトリを読める|personal access token|個人用アクセス ?トークン|fine-grained|secrets\.|\bPATs?\b/i,
];

test('README、サイト、action.yml、examples では、非公開の活動をカードに入れる方法を案内しない', () => {
  const site = readdirSync(new URL('../site/', import.meta.url)).map((name) => `../site/${name}`);
  const paths = [README.ja, README.en, ...site, '../action.yml', '../SECURITY.md', '../examples/workflow.yml', '../examples/readme-snippet.html'];
  assert.ok(site.includes('../site/index.html') && site.includes('../site/i18n.mjs'));
  for (const path of paths) {
    for (const guidance of GUIDANCE) assert.doesNotMatch(read(path), guidance, path);
  }
});

// 隠せる項目の名前は、Marketplace やエディタの補完で action.yml の説明だけを読む人にも分かるよう、日本語と英語の両方に書く。
test('action.yml の hide の説明は、日本語と英語のどちらにも隠せる項目の名前を HIDEABLE の順に書く', () => {
  const description = read('../action.yml').match(/^ {2}hide:\n {4}description: (.+)$/m)[1];
  const names = `(${HIDEABLE.join(', ')})`;
  const [japanese, english] = description.split(' / ');
  assert.ok(english.includes(names), english);
  assert.ok(japanese.includes(names), japanese);
});

// 番号付きの手順の中にあるコードは、3 文字の字下げを外す。
const codeBlocks = (markdown, lang) =>
  [...markdown.matchAll(new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\\n\\s*\`\`\``, 'g'))].map(([, block]) => `${block.replace(/^ {3}/gm, '')}\n`);

test('README.en.md は英語だけで書き、ワークフローと貼るコードは英語を選んだサイトのものと同じ', () => {
  const english = englishReadme();
  // 日本語の README へのリンクの「日本語」のほかは、英語だけで書く。
  assert.doesNotMatch(english.replace('[日本語](README.md)', ''), JAPANESE);
  assert.deepEqual(codeBlocks(english, 'yaml'), [workflowYaml({ ...DEFAULT_SETTINGS, language: 'en' })]);
  assert.deepEqual(codeBlocks(english, 'html'), [readmeSnippet('en', 'auto'), readmeSnippet('en', 'light')]);
});

test('設定サイトの項目の名前と英語の説明は、README の「Items on the card」の表と同じ', () => {
  assert.deepEqual(readmeItems('Items on the card', README.en), itemsIn('en'));
});

// GitHub が README の見出しに付けるアンカー。小文字にし、記号を外し、空白を - にする。
const anchorOf = (heading) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

const anchorsIn = (file) => [...read(`../${file}`).matchAll(/^#+ (.+)$/gm)].map(([, heading]) => anchorOf(heading));

// このリポジトリの中を指すリンク (README.en.md#inputs、#設定、examples/samples/card-light.svg など) を { file, anchor } で返す。
// コードのブロックの中は、使う人のリポジトリに貼るコードなので読まない。
function localLinks(file) {
  const text = read(`../${file}`).replace(/```[\s\S]*?```/g, '');
  const targets = [...text.matchAll(/\]\(([^)\s]+)\)/g), ...text.matchAll(/ src(?:set)?="([^"]+)"/g)].map(([, target]) => target);
  return targets
    .filter((target) => !/^https?:/.test(target))
    .map((target) => {
      const [path, anchor] = target.split('#');
      return { file: path || file, anchor };
    });
}

test('README のリンクと、設定サイトから README へのリンクは、あるファイルと見出しを指す', () => {
  const links = ['README.md', 'README.en.md'].flatMap(localLinks);
  // 設定サイトは、日本語のページから README.md へ、英語のページから README.en.md へリンクする。
  const site = /href="https:\/\/github\.com\/moppy626\/tiny-pixel-room(?:\/blob\/main\/([\w.]+))?#([^"]+)"/g;
  const fromSite = [...read('../site/index.html').matchAll(site)].map(([, file = 'README.md', anchor]) => ({ file, anchor }));
  assert.ok(links.some(({ file }) => file === 'README.en.md') && links.some(({ file }) => file === 'README.md'));
  assert.deepEqual(fromSite, [{ file: 'README.md', anchor: '非公開の活動の扱い' }, { file: 'README.en.md', anchor: 'private-activity' }]);
  for (const { file, anchor } of [...links, ...fromSite]) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
    if (anchor) assert.ok(anchorsIn(file).includes(anchor), `${file}#${anchor}`);
  }
});

// README の設定の表 (日本語は「設定」、英語は「Inputs」)。| `名前` | 既定値 | 説明 | の行を [名前, 既定値] で返す。
function readmeInputs(heading, path) {
  const section = read(path).split(`\n${heading}\n`)[1].split(/\n#+ /)[0];
  return [...section.matchAll(/^\| `([\w-]+)` \| (.+?) \|/gm)].map(([, name, value]) => [name, value]);
}

test('README の設定の表は、action.yml と同じ入力を並べ、同じ既定値を書く', () => {
  const inputs = actionInputs();
  for (const [heading, path] of [['## 設定', README.ja], ['## Inputs', README.en]]) {
    const rows = readmeInputs(heading, path);
    assert.deepEqual(rows.map(([name]) => name).sort(), Object.keys(inputs).sort(), heading);
    // 既定値をコードで書いた行だけを比べる (「空」「リポジトリの持ち主」などは文で書いている)。
    // 式の既定値 (${{ github.token }}) は、表には中身だけを書いている。
    for (const [name, value] of rows) {
      const code = value.match(/^`(.+)`$/)?.[1];
      if (code) assert.equal(code, inputs[name].replace(/^\$\{\{ (.+) \}\}$/, '$1'), `${heading}: ${name}`);
    }
  }
});

// output-dir の既定を変えたら、README に貼るコードの読む場所と、サイトの手順のフォルダの名前も変える。
test('README に貼るコードとサイトの手順は、action.yml の output-dir の既定のフォルダを指す', () => {
  const folder = actionInputs()['output-dir'];
  for (const lang of LANGUAGES) {
    for (const theme of ['auto', 'light', 'dark']) {
      const paths = [...readmeSnippet(lang, theme).matchAll(/ src(?:set)?="([^"]+)"/g)].map(([, path]) => path);
      assert.ok(paths.length > 0 && paths.every((path) => path.startsWith(`${folder}/card-`)), `${lang} ${theme}: ${paths}`);
    }
  }
  assert.ok(read('../site/index.html').includes(`<code>${folder}</code>`));
});

// ワークフローのファイルの名前が push の paths と違うと、ワークフローをコミットしても Action が動かず、カードができない。
test('README とサイトでワークフローを置く場所は、ワークフローの push の paths と同じ', () => {
  const path = workflowYaml(DEFAULT_SETTINGS).match(/^ {4}paths:\n {6}- (.+)$/m)[1];
  assert.ok(read('../README.md').includes(`\`${path}\` を作り`));
  assert.ok(englishReadme().includes(`create \`${path}\``));
  const html = read('../site/index.html');
  assert.ok(html.includes(`<code>${path}</code> を作り`));
  assert.ok(html.includes(`create <code>${path}</code>`));
  assert.ok(html.includes(`<span class="file">${path}</span>`));
});

// <picture> のあとに <br> を挟み、細いカード (hide: all) でも、リンクがカードの横ではなく下に出るようにする。
test('README に貼るコードは、カードの下に、カードの言葉のサイトのページへの小さなリンクを付ける', () => {
  for (const lang of LANGUAGES) {
    for (const theme of ['auto', 'light', 'dark']) {
      const link = `</picture>\n<br>\n<sub><a href="${SITE_URL}${PAGES[lang]}">${NAME[lang]}</a></sub>\n`;
      assert.ok(readmeSnippet(lang, theme).endsWith(link), `${lang} ${theme}`);
    }
  }
});

// リンクを消したい人のために、消し方を README とサイトの手順に書いている。行の数を変えたら、説明も直す。
test('README とサイトの手順に、リンクの行の消し方を書く', () => {
  for (const lang of LANGUAGES) {
    const lines = readmeSnippet(lang).trimEnd().split('\n');
    assert.equal(lines.length - lines.indexOf('<br>'), 2, lang);
  }
  assert.ok(read('../README.md').includes('`<br>` からあとの 2 行を消してください'));
  assert.ok(englishReadme().includes('delete the last two lines, starting from `<br>`'));
  const html = read('../site/index.html');
  assert.ok(html.includes('<code>&lt;br&gt;</code> からあとの 2 行を消してください'));
  assert.ok(html.includes('delete the last two lines, starting from <code>&lt;br&gt;</code>'));
});

test('日本語の README に貼るコードは、examples/readme-snippet.html と同じ', () => {
  assert.equal(readmeSnippet('ja'), read('../examples/readme-snippet.html'));
});

// README の使い方の、README に貼るコード。番号付きの手順の中にあるので、3 文字の字下げを外す。
const readmeHtmlBlocks = () =>
  [...read('../README.md').matchAll(/```html\n([\s\S]*?)\n\s*```/g)].map(([, block]) => `${block.replace(/^ {3}/gm, '')}\n`);

test('背景を自動にすると、昼と夜を切り替えるコードにする。README の使い方にも、自動と昼のコードがある', () => {
  assert.equal(readmeSnippet('ja', 'auto'), readmeSnippet('ja'));
  assert.match(readmeSnippet('ja', 'auto'), /prefers-color-scheme: dark/);
  assert.ok(readmeHtmlBlocks().includes(readmeSnippet('ja', 'auto')));
  assert.ok(readmeHtmlBlocks().includes(readmeSnippet('ja', 'light')));
});

test('背景を昼か夜にすると、その背景のカードだけを使い、動きを減らす設定の人には動かないカードを見せる', () => {
  for (const [theme, other] of [['light', 'dark'], ['dark', 'light']]) {
    const snippet = readmeSnippet('en', theme);
    assert.match(snippet, new RegExp(`srcset="tiny-pixel-room/card-${theme}-still\\.svg"`));
    assert.match(snippet, new RegExp(`src="tiny-pixel-room/card-${theme}\\.svg"`));
    assert.doesNotMatch(snippet, new RegExp(`${other}|prefers-color-scheme`));
  }
});

test('スクリプトで出す文と項目の説明は、日本語と英語の両方がある', () => {
  assert.deepEqual(Object.keys(TEXT.en), Object.keys(TEXT.ja));
  const english = [NAME.en, ...Object.values(TEXT.en), ...Object.values(ITEMS).map(({ description }) => description.en)];
  for (const value of english) {
    assert.doesNotMatch(typeof value === 'function' ? value('name', 'form', 1) : value, JAPANESE);
  }
  for (const { description } of Object.values(ITEMS)) assert.ok(description.ja);
});

const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input', 'link', 'meta']);

// index.html の <body> の文のうち、日本語の要素 (data-lang="ja" か lang="ja") の外にあるもの。
function textOutsideJapanese(body) {
  const open = []; // 開いている要素ごとに、日本語の要素かどうか
  let text = '';
  for (const [, closing, name, attrs, chunk] of body.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    if (chunk !== undefined) {
      if (!open.includes(true)) text += chunk;
    } else if (closing) {
      open.pop();
    } else if (!VOID_ELEMENTS.has(name)) {
      open.push(/\s(data-)?lang="ja"/.test(attrs));
    }
  }
  return text;
}

test('サイトの文は日本語と英語を組で書き、日本語の文は data-lang="ja" の要素に入れる', () => {
  const html = read('../site/index.html');
  const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
  const count = (lang) => body.split(` data-lang="${lang}"`).length - 1;
  assert.ok(count('ja') > 0);
  assert.equal(count('en'), count('ja'));
  // 言葉を選ぶボタンの「日本語」と「English」は、どちらの言葉のときも出すので、data-lang ではなく lang で言葉を示す。
  assert.match(body, /<span class="pixel" lang="ja">日本語<\/span>/);
  assert.match(body, /<span class="pixel" lang="en">English<\/span>/);
  assert.doesNotMatch(textOutsideJapanese(body), JAPANESE);
});

// ページとカードの言葉の切り替えは、どこまで読み進めていても探せるよう、ページの上 (見出しの所) に 1 組だけ置く。
test('ページとカードの言葉の切り替えは、ページの上の見出しの所に 1 組だけ置く', () => {
  const html = read('../site/index.html');
  const header = html.slice(html.indexOf('<header class="masthead">'), html.indexOf('</header>'));
  const radios = (part) => part.match(/<input type="radio" name="language" value="(\w+)">/g) ?? [];
  // 既定の日本語を先に並べる (LANGUAGES の順)。
  assert.deepEqual(radios(header).map((input) => input.match(/value="(\w+)"/)[1]), LANGUAGES);
  assert.equal(radios(html).length, LANGUAGES.length);
});

test('サイトの言葉は <html data-lang> で切り替え、ブラウザの翻訳で変わる <html lang> は使わない', () => {
  const css = read('../site/style.css');
  assert.match(css, /html\[data-lang='ja'\] \[data-lang='en'\]/);
  assert.doesNotMatch(css, /html\[lang/);
});

test('名前の説明の文字数は、Action の上限と同じ', () => {
  const html = read('../site/index.html');
  assert.ok(html.includes(`${MAX_NAME_LENGTH} 文字まで`));
  assert.ok(html.includes(`Up to ${MAX_NAME_LENGTH} characters`));
});

test('名前は一重引用符で囲み、引用符と Actions の式を書き換える', () => {
  assert.equal(yamlString(''), "''");
  assert.equal(yamlString("O'Neil"), "'O''Neil'");
  assert.equal(yamlString('a${{b'), "'a${{ ''${{'' }}b'");
  assert.equal(yamlString('# ひまり: 1'), "'# ひまり: 1'");
});

test('選んだ設定だけをワークフローに足す', () => {
  const yaml = workflowYaml({ character: 'cactus', petName: '  とげまる ', language: 'ja', hide: ['repos', 'langs'], motion: false });
  assert.match(yaml, /^ {10}character: cactus #/m);
  assert.match(yaml, /^ {10}pet-name: 'とげまる'$/m);
  assert.match(yaml, /^ {10}language: ja #/m);
  // 項目は HIDEABLE の順に並べる。
  assert.match(yaml, /^ {10}hide: langs, repos$/m);
  assert.match(yaml, /^ {10}motion: false$/m);
  assert.doesNotMatch(workflowYaml(DEFAULT_SETTINGS), /hide:|motion:/);
});

test('すべての項目を隠すときは all と書く', () => {
  assert.equal(hideValue([...HIDEABLE].reverse()), 'all');
  assert.equal(hideValue(HIDEABLE.slice(1)), HIDEABLE.slice(1).join(', '));
});

test('サイトのスクリプトは、Node でしか使えないものを含まずにブラウザ用にまとめられる', async () => {
  const result = await bundleSite({ write: false, minify: false, metafile: true });
  assert.deepEqual(result.errors, []);
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some((path) => path.endsWith('src/render.mjs')));
  assert.ok(inputs.every((path) => !path.startsWith('node:')));
});

// build-site.mjs が作る PNG (IDAT が 1 つで、フィルタなしの RGBA) の、(x, y) の色を [r, g, b, a] で返す。
function pngPixel(png, x, y) {
  const size = png.readUInt32BE(16);
  // IDAT は、署名 (8 バイト) と IHDR (25 バイト) のすぐあと。
  const raw = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
  const at = y * (size * 4 + 1) + 1 + x * 4;
  return [...raw.subarray(at, at + 4)];
}

const rgba = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);

test('サイトのアイコンは、カブのドット絵から作り、index.html から読む', () => {
  const icons = Object.fromEntries(siteIcons());
  const html = read('../site/index.html');
  for (const name of Object.keys(icons)) assert.ok(html.includes(`href="${name}"`), name);

  assert.match(icons['favicon.svg'], /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 16 16" /);
  // 32px のアイコンは 1 ドットが 2px。まわりは透明で、上の端の 3 ドット目から葉の縁 (k) がある。
  const favicon = icons['favicon.png'];
  assert.deepEqual([favicon.readUInt32BE(16), favicon.readUInt32BE(20)], [32, 32]);
  assert.equal(pngPixel(favicon, 0, 0)[3], 0);
  assert.deepEqual(pngPixel(favicon, 4, 0), rgba(PALETTE.k));
  // ホーム画面のアイコンは 180px。1 ドットが 8px で、まわり 26px に壁の色を敷く。
  const touch = icons['apple-touch-icon.png'];
  assert.deepEqual([touch.readUInt32BE(16), touch.readUInt32BE(20)], [180, 180]);
  assert.deepEqual(pngPixel(touch, 0, 0), rgba(THEMES.light.wall));
  assert.deepEqual(pngPixel(touch, 26 + 16, 26), rgba(PALETTE.k));
  assert.deepEqual(pngPixel(touch, 179, 179), rgba(THEMES.light.wall));
});

test('PNG の画像からはみ出す四角は、はみ出した分を塗らず、隣の行にも回り込ませない', () => {
  const color = '#FF0000';
  const png = pixelPng(4, 4, { rects: [{ x: -2, y: -2, width: 3, height: 3, color }, { x: 3, y: 1, width: 3, height: 1, color }] });
  assert.deepEqual(pngPixel(png, 0, 0), rgba(color));
  assert.equal(pngPixel(png, 1, 0)[3], 0);
  assert.deepEqual(pngPixel(png, 3, 1), rgba(color));
  // 右の端からはみ出した分が、次の行の左の端に出ない。
  assert.equal(pngPixel(png, 0, 2)[3], 0);
  assert.equal(pngPixel(png, 1, 2)[3], 0);
});

test('SNS 向けの画像は 1200 × 630 で、カードと同じ色の枠で囲み、壁と床の色を塗る', () => {
  const image = ogImage();
  assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [1200, 630]);
  assert.deepEqual(pngPixel(image, 0, 0), rgba(THEMES.light.frame));
  assert.deepEqual(pngPixel(image, 1199, 629), rgba(THEMES.light.frame));
  assert.deepEqual(pngPixel(image, 40, 40), rgba(THEMES.light.wall));
  assert.deepEqual(pngPixel(image, 40, 600), rgba(THEMES.light.floor));
});

// 設定サイトのフォント。作るのに少し時間がかかるので、1 回だけ作る。
let siteFont;
const siteFontBytes = () => (siteFont ??= woff(readFileSync(UNIFONT_URL)));

test('設定サイトのフォントは WOFF にして小さくし、表の中身は元の OTF と同じにする', () => {
  const otf = readFileSync(UNIFONT_URL);
  const file = siteFontBytes();
  const numTables = otf.readUInt16BE(4);
  assert.equal(SITE_FONT_PATH, 'fonts/unifont_jp-subset-18.0.01.woff');
  assert.equal(file.toString('latin1', 0, 4), 'wOFF');
  assert.equal(file.toString('latin1', 4, 8), otf.toString('latin1', 0, 4));
  assert.equal(file.readUInt32BE(8), file.length);
  assert.equal(file.readUInt16BE(12), numTables);
  // OTF の表の一覧 (タグ → 中身と checksum)。
  const originals = new Map(Array.from({ length: numTables }, (_, i) => {
    const record = 12 + i * 16;
    const [checksum, offset, length] = [4, 8, 12].map((n) => otf.readUInt32BE(record + n));
    return [otf.toString('latin1', record, record + 4), { checksum, data: otf.subarray(offset, offset + length) }];
  }));
  let sfntSize = 12 + 16 * numTables;
  // 表は一覧のすぐあとから、一覧と同じ順に、4 バイトの区切りごとに隙間なく並ぶ (ブラウザはそうでない WOFF を読まない)。
  let next = 44 + 20 * numTables;
  const tags = [];
  for (let i = 0; i < numTables; i += 1) {
    const entry = 44 + i * 20;
    const tag = file.toString('latin1', entry, entry + 4);
    const [offset, compLength, origLength, checksum] = [4, 8, 12, 16].map((n) => file.readUInt32BE(entry + n));
    const stored = file.subarray(offset, offset + compLength);
    const original = originals.get(tag);
    assert.equal(offset, next, tag);
    assert.ok(compLength <= origLength, tag);
    assert.deepEqual(compLength < origLength ? inflateSync(stored) : stored, original.data, tag);
    assert.equal(checksum, original.checksum, tag);
    tags.push(tag);
    sfntSize += Math.ceil(origLength / 4) * 4;
    next = offset + Math.ceil(compLength / 4) * 4;
  }
  assert.deepEqual(tags, [...originals.keys()].sort());
  assert.equal(next, file.length);
  assert.equal(file.readUInt32BE(16), sfntSize);
  assert.ok(file.length < otf.length / 2, `${file.length} / ${otf.length}`);
});

test('サイトで opentype.js が読む WOFF のフォントは、Action の OTF と同じ字の形を描く', () => {
  const opentype = opentypeModule.default ?? opentypeModule;
  const bytes = siteFontBytes();
  const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const text = 'ドットのおへや Tiny Pixel Room ひまり 漢字 é ★';
  assert.equal(textPathData(font, text, 0, 16, 16), textPathData(loadFont(), text, 0, 16, 16));
  assert.equal(font.glyphs.length, loadFont().glyphs.length);
});

test('言葉ごとのページに、その言葉の title と説明、正規の URL、もう一方の言葉のページを書く', () => {
  const template = read('../site/index.html');
  for (const lang of Object.keys(PAGES)) {
    const html = pageHtml(template, lang);
    const url = `${SITE_URL}${PAGES[lang]}`;
    assert.ok(html.startsWith(`<!doctype html>\n<html lang="${lang}" data-lang="${lang}">`), lang);
    assert.ok(html.includes(`<title>${TEXT[lang].title}</title>`), lang);
    assert.ok(html.includes(`<meta name="description" content="${TEXT[lang].description}">`), lang);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), lang);
    assert.ok(html.includes(`<meta property="og:url" content="${url}">`), lang);
    for (const key of Object.keys(PAGES)) {
      assert.ok(html.includes(`<link rel="alternate" hreflang="${key}" href="${SITE_URL}${PAGES[key]}">`), `${lang} → ${key}`);
    }
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}${PAGES.en}">`), lang);
    assert.ok(!html.includes('<!-- page-meta -->'), lang);
    // スクリプトが動かなくても、その言葉の見本のカードと、その言葉の説明を出す。
    const { width, height } = SAMPLE_CARD_SIZE;
    const card = `<img id="card" src="samples/card-${lang}-light-still.svg" width="${width}" height="${height}" alt="${TEXT[lang].sampleAlt}">`;
    assert.ok(html.includes(card), lang);
    assert.ok(!html.includes('<!-- sample-card -->'), lang);
    // en/ のページは、スタイルやスクリプトをサイトの一番上から読むので、相対 URL より前に <base> を置く。
    const base = html.indexOf('<base href="../">');
    if (PAGES[lang]) assert.ok(base > 0 && base < html.indexOf(' href="favicon.png"'), lang);
    else assert.equal(base, -1);
  }
});

test('ページに入れる文の $& などは、そのまま書く', () => {
  const template = read('../site/index.html');
  const { description } = TEXT.en;
  try {
    TEXT.en.description = 'Save $$ and $& here';
    assert.ok(pageHtml(template, 'en').includes('<meta name="description" content="Save $$ and $&amp; here">'));
  } finally {
    TEXT.en.description = description;
  }
});

test('見本のカードは、言葉と背景ごとに、最初のプレビューと同じ設定で作り、ページの <img> と同じ大きさにする', () => {
  const cards = Object.fromEntries(sampleCards());
  const names = LANGUAGES.flatMap((lang) => ['light', 'dark'].map((mode) => `samples/card-${lang}-${mode}-still.svg`));
  assert.deepEqual(Object.keys(cards).sort(), names.sort());
  for (const svg of Object.values(cards)) {
    const [, width, height] = svg.match(/<svg[^>]* width="(\d+)" height="(\d+)"/);
    assert.deepEqual({ width: Number(width), height: Number(height) }, SAMPLE_CARD_SIZE);
  }
  assert.match(cards['samples/card-ja-light-still.svg'], new RegExp(`の${NAME.ja}`));
  assert.match(cards['samples/card-en-light-still.svg'], new RegExp(`&apos;s ${NAME.en}`));
});
