// 設定サイトの言葉。サイトは、カードの言葉 (language) と同じ言葉で表示する。
// index.html の文は日本語と英語を両方書いておき、<html data-lang> に合わせて片方だけ見せる (style.css)。
// ここには、スクリプトで出す文と、ページの title と説明 (scripts/build-site.mjs が <head> に入れる) を置く。
// 日本語と英語で同じ項目をそろえる (test/site.test.mjs で確かめている)。
import { NAME } from '../src/messages.mjs';

// 名前はカードのタイトルやコミットのメッセージと同じものを使う (src/messages.mjs)。
export { NAME };

export const TEXT = {
  ja: {
    // 検索で探されやすい言葉 (GitHub、プロフィール、README、ドット絵) を入れる。
    title: `${NAME.ja} | GitHub プロフィールの README に飾る、育つドット絵`,
    description:
      'GitHub で活動するほど育つドット絵のキャラクターを、プロフィールの README に飾れる GitHub Action です。キャラクターや表示する項目を選んでカードを試し、そのまま使えるワークフローを作れます。',
    imageAlt: 'ドット絵のおへやに、おうさまカブ、おうさまヒマワリ、おうさまサボテンが並んでいる',
    ready: '数字と育ち具合は見本です。実際のカードは、あなたの GitHub の活動で決まります。',
    failed: 'フォントを読み込めず、プレビューを描けませんでした。ページを読み込み直してください。下のコードはそのまま使えます。',
    sampleAlt: '見本のカード。おへやでカブが待っている',
    cardAlt: (pet, form, level) => `カードのプレビュー。${pet} (${form} Lv.${level}) のおへや`,
    dropped: (chars) => `名前に使えない文字を外しました: ${chars}`,
    truncated: (name, max) => `名前は ${max} 文字までなので、「${name}」にしました`,
    copied: 'コピーしました',
    selected: '選びました。Ctrl+C でコピーできます',
  },
  en: {
    title: `${NAME.en} | Growing pixel art for your GitHub profile README`,
    description:
      'A GitHub Action that puts a pixel-art character in your GitHub profile README. It grows as you contribute. Pick a character and the stats to show, preview your card, and copy a ready-to-use workflow.',
    imageAlt: 'A pixel-art room with King Turnip, King Sunflower, and King Cactus side by side',
    ready: 'The numbers and growth are samples. Your real card depends on your GitHub activity.',
    failed: "Couldn't load the font, so the preview can't be drawn. Please reload the page. The code below still works as is.",
    sampleAlt: 'A sample card. A turnip is waiting in its room',
    cardAlt: (pet, form, level) => `Card preview: ${pet}'s room (${form} Lv.${level})`,
    dropped: (chars) => `Removed characters that can't be used in the name: ${chars}`,
    truncated: (name, max) => `Names can be up to ${max} characters, so it was shortened to "${name}"`,
    copied: 'Copied',
    selected: 'Selected. Press Ctrl+C to copy',
  },
};
