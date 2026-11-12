// 設定サイト。選んだ設定でカードを描き、貼り付けるワークフローを作る。
// カードは Action と同じコード (src) で描くので、見た目は実際のカードと同じになる。数字は見本。
import * as opentypeModule from 'opentype.js';
import { HIDEABLE, MAX_NAME_LENGTH, buildView } from '../src/card.mjs';
import { CHARACTERS, LANGUAGES } from '../src/growth.mjs';
import { cardRenderer } from '../src/render.mjs';
import { formOf } from '../src/sprites.mjs';
import { SITE_FONT_PATH } from './font.mjs';
import { TEXT } from './i18n.mjs';
import { ITEMS } from './items.mjs';
import { PREVIEW_EXP, sampleAccount } from './sample.mjs';
import { spriteSvg } from './sprite.mjs';
import { DEFAULT_SETTINGS, readmeSnippet, workflowYaml } from './workflow.mjs';

const opentype = opentypeModule.default ?? opentypeModule;

const $ = (id) => document.getElementById(id);
const media = (query) => window.matchMedia(query);

// カードの言葉の最初の選択は、ページの言葉 (<html data-lang>)。日本語のページ (/) は ja、英語のページ (/en/) は en。
// <html lang> はブラウザの翻訳で書き換わることがあるので、data-lang を読む。
const pageLanguage = document.documentElement.dataset.lang;
const account = sampleAccount();
const settings = {
  ...DEFAULT_SETTINGS,
  language: LANGUAGES.includes(pageLanguage) ? pageLanguage : DEFAULT_SETTINGS.language,
  hide: [...DEFAULT_SETTINGS.hide],
};
const prefersDark = media('(prefers-color-scheme: dark)');
const modeOfBrowser = () => (prefersDark.matches ? 'dark' : 'light');
// mode は、背景が自動のときのプレビューの見え方。README に貼るコードは変えずに、昼と夜の両方を確かめられる。
// 最初は、このページを見ているブラウザの設定に合わせる。
const preview = { mode: modeOfBrowser(), stage: 0 };
// フォントの読み込み。loading のあいだは、index.html の「準備しています」を出しておく。
let fontState = 'loading';
let font = null;
let draw = null;
let cardUrl = null;

// サイトの言葉は、カードの言葉と同じ。
const text = () => TEXT[settings.language];

// プレビューのカードの背景。背景が自動なら見え方 (preview.mode) に、昼か夜なら、いつもその背景にする。
const cardMode = () => (settings.theme === 'auto' ? preview.mode : settings.theme);

function buildCharacterTiles() {
  const box = $('characters');
  box.replaceChildren();
  for (const key of Object.keys(CHARACTERS)) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="character" value="${key}"><span class="tile"><span class="sprite"></span><span class="pixel name"></span></span>`;
    box.append(label);
  }
}

// 項目ごとに、マウスを重ねるかキーボードで選ぶと出る説明を付ける。
// 説明は label の外に置き、チェックボックスの名前に混ざらないようにする。読み上げでは説明として読む。
function buildItemChecks() {
  const box = $('items');
  for (const key of HIDEABLE) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<label class="check"><input type="checkbox" name="item" value="${key}" aria-describedby="tip-${key}"><span class="pixel"></span></label><span class="tip" id="tip-${key}" role="tooltip"></span>`;
    // site/items.mjs に書き忘れた項目も、名前だけは出して、ページ全体は動くようにする。
    item.querySelector('.pixel').textContent = ITEMS[key]?.label ?? key;
    // 説明は下の項目に重なるので、説明をクリックやタップしても閉じられるようにする。
    item.querySelector('.tip').addEventListener('click', () => {
      item.dataset.tipClosed = '';
    });
    // 閉じた説明は、マウスやフォーカスが項目から離れると、また出るようにする。
    const reopen = () => delete item.dataset.tipClosed;
    item.addEventListener('mouseleave', reopen);
    item.addEventListener('focusout', reopen);
    box.append(item);
  }
}

// 育ち具合に合わせて、キャラクター選びの絵も育てる。名前はカードの言葉に合わせる。
function updateTiles() {
  for (const label of $('characters').children) {
    const input = label.querySelector('input');
    input.checked = input.value === settings.character;
    label.querySelector('.sprite').innerHTML = spriteSvg(formOf(input.value, preview.stage).rows);
    label.querySelector('.name').textContent = CHARACTERS[input.value][settings.language].label;
  }
}

// サイトの言葉を、カードの言葉に合わせる。HTML の文は style.css が <html data-lang> で切り替えるので、
// ここではスクリプトで出す文を変える。プレビューまわりの文は renderPreview で変える。
// 項目の説明は aria-describedby で読むので、両方の言葉を入れて片方を隠すのではなく、いまの言葉だけを入れる。
function applyLanguage() {
  document.documentElement.lang = settings.language;
  document.documentElement.dataset.lang = settings.language;
  document.title = text().title;
  for (const key of HIDEABLE) $(`tip-${key}`).textContent = ITEMS[key]?.description[settings.language] ?? '';
  updateStatus();
}

// プレビューの状態の文。aria-live で読み上げるので、フォントを読み終えたときと、言葉を変えたときだけ書き換える。
// 読み込み中は、index.html の「準備しています」を出しておく。
function updateStatus() {
  if (fontState !== 'loading') $('preview-status').textContent = text()[fontState];
}

function syncMode() {
  for (const input of document.querySelectorAll('input[name="mode"]')) input.checked = input.value === preview.mode;
}

function syncControls() {
  updateTiles();
  for (const input of document.querySelectorAll('input[name="language"]')) input.checked = input.value === settings.language;
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked = input.value === settings.theme;
  syncMode();
  for (const input of document.querySelectorAll('input[name="item"]')) input.checked = !settings.hide.includes(input.value);
  $('motion').checked = settings.motion;
  $('stage').value = String(preview.stage);
}

function showCard(svg, alt) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = $('card');
  // キャラクターだけのカードは幅が狭いので、カードの大きさに合わせる。
  const [, width, height] = svg.match(/<svg[^>]* width="(\d+)" height="(\d+)"/);
  img.width = Number(width);
  img.height = Number(height);
  img.src = url;
  img.alt = alt;
  if (cardUrl) URL.revokeObjectURL(cardUrl);
  cardUrl = url;
}

function renderPreview() {
  const kind = CHARACTERS[settings.character][settings.language];
  $('pet-name').placeholder = kind.label;
  // 名前の説明は index.html に両方の言葉で書いてあり、種類名だけをそれぞれの言葉で入れる。
  for (const span of $('pet-hint').querySelectorAll('.kind')) {
    span.textContent = CHARACTERS[settings.character][span.closest('[data-lang]').dataset.lang].label;
  }
  $('stage-name').textContent = kind.forms[preview.stage];
  $('workflow').textContent = workflowYaml(settings);
  $('snippet').textContent = readmeSnippet(settings.language, settings.theme);
  // 見え方の切り替えは、背景が自動のときだけ出す。昼か夜なら、プレビューもその背景にする。
  $('preview-mode').hidden = settings.theme !== 'auto';
  // フォントを読み終えるまでと、読めなかったときは、見本のカード (scripts/build-site.mjs が言葉ごとに作る) を出しておく。
  if (!font) {
    $('card').src = `samples/card-${settings.language}-${cardMode()}-still.svg`;
    $('card').alt = text().sampleAlt;
    return;
  }

  const view = buildView(account, { ...settings, exp: PREVIEW_EXP[preview.stage] }, font);
  // 動きを減らす設定の人には、README と同じく動かないカードを見せる。
  const motion = settings.motion && !media('(prefers-reduced-motion: reduce)').matches;
  const svg = draw({ ...view, mode: cardMode(), motion });
  showCard(svg, text().cardAlt(view.petName, view.growth.formName, view.growth.level));

  // 名前の警告。buildView の warn は Action の実行結果に出す日本語と英語の 2 行なので、view.nameIssues からサイトの言葉で作る。
  const { dropped, truncated } = view.nameIssues;
  const warnings = [];
  if (dropped.length) warnings.push(text().dropped(dropped.join(' ')));
  if (truncated) warnings.push(text().truncated(view.petName, MAX_NAME_LENGTH));
  // aria-live で読み上げるので、警告が変わったときだけ書き換える。
  const list = $('pet-warnings');
  if (warnings.join('\n') === [...list.children].map((item) => item.textContent).join('\n')) return;
  list.replaceChildren(
    ...warnings.map((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }),
  );
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    renderPreview();
  });
}

function bindControls() {
  $('characters').addEventListener('change', (event) => {
    settings.character = event.target.value;
    updateTiles();
    schedule();
  });
  $('pet-name').addEventListener('input', (event) => {
    settings.petName = event.target.value;
    schedule();
  });
  for (const input of document.querySelectorAll('input[name="language"]')) {
    input.addEventListener('change', () => {
      settings.language = input.value;
      applyLanguage();
      updateTiles();
      schedule();
    });
  }
  $('items').addEventListener('change', () => {
    settings.hide = [...document.querySelectorAll('input[name="item"]')].filter((input) => !input.checked).map((input) => input.value);
    schedule();
  });
  // 項目の説明は、下の項目に重なることがあるので、Esc で閉じられるようにする。
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const item of $('items').querySelectorAll('.item:is(:hover, :focus-within)')) item.dataset.tipClosed = '';
  });
  $('motion').addEventListener('change', (event) => {
    settings.motion = event.target.checked;
    schedule();
  });
  for (const input of document.querySelectorAll('input[name="theme"]')) {
    input.addEventListener('change', () => {
      settings.theme = input.value;
      schedule();
    });
  }
  for (const input of document.querySelectorAll('input[name="mode"]')) {
    input.addEventListener('change', () => {
      preview.mode = input.value;
      schedule();
    });
  }
  // ブラウザの昼と夜の設定が変わったら、見え方もそれに合わせる。
  prefersDark.addEventListener('change', () => {
    preview.mode = modeOfBrowser();
    syncMode();
    schedule();
  });
  $('stage').addEventListener('input', (event) => {
    preview.stage = Number(event.target.value);
    updateTiles();
    schedule();
  });
  media('(prefers-reduced-motion: reduce)').addEventListener('change', schedule);

  for (const button of document.querySelectorAll('[data-copy]')) {
    // 「コピー」は index.html に両方の言葉で書いてある。知らせたあと、それに戻す。
    const idle = [...button.childNodes];
    let timer;
    button.addEventListener('click', async () => {
      const code = $(button.dataset.copy).textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = text().copied;
      } catch {
        // クリップボードを使えないときは、選んだ状態にして自分でコピーしてもらう。
        const range = document.createRange();
        range.selectNodeContents($(button.dataset.copy));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        button.textContent = text().selected;
      }
      button.dataset.done = '';
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.replaceChildren(...idle);
        delete button.dataset.done;
      }, 2400);
    });
  }
}

// フォントは、カードを描くのと、ページの見出しなどの両方に使う。
// 見出しのフォント (FontFace) をブラウザが受け付けなくても、カードは opentype.js で描けるので、プレビューは出す。
async function loadFont() {
  let bytes = null;
  try {
    // WOFF は表ごとに縮めてあり、opentype.js も FontFace もそのまま読める (scripts/build-site.mjs の woff)。
    const response = await fetch(SITE_FONT_PATH);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = await response.arrayBuffer();
    font = opentype.parse(bytes);
    draw = cardRenderer(font);
    fontState = 'ready';
  } catch (error) {
    console.error(error);
    fontState = 'failed';
  }
  updateStatus();
  renderPreview();
  if (!font) return;
  // 見出しが読めなくなるわけではない (style.css のほかのフォントで出る) ので、失敗しても知らせるだけにする。
  // opentype.js は読んだ bytes をあとでも使うので、FontFace には写しを渡す。
  try {
    document.fonts.add(await new FontFace('Dot Unifont', bytes.slice(0)).load());
  } catch (error) {
    console.error(error);
  }
}

buildCharacterTiles();
buildItemChecks();
syncControls();
applyLanguage();
bindControls();
renderPreview();
loadFont();
