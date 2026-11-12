// Action の実行結果に出す文 (エラー、警告、お知らせ)。日本語の行のあとに、同じ内容の英語の行を続ける。
// カードの言葉 (language) にかかわらず、いつも両方を出す。入力の誤りや GitHub API のエラーは、
// language を読む前や、language を知らない所 (github.mjs など) でも起きるため。
export const bilingual = (ja, en) => `${ja}\n${en}`;

// ワークフローコマンド (::error:: など) に入れる文。コマンドは 1 行で読まれるので、改行が残ると 2 行目以降が注釈から落ちる。
// Action (index.mjs) と、リリースのときにタグを付け替えるスクリプト (scripts/move-major-tag.mjs) で使う。
export const encodeCommand = (message) => message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

// このツールの、言葉ごとの名前。英語の名前は action.yml の name (GitHub Marketplace の名前) と同じにする。
// カードのタイトル (render.mjs)、コミットのメッセージ (index.mjs)、設定サイト (site/i18n.mjs) で使う。
// action.yml、README、設定サイトの見出しと同じかは test/site.test.mjs で確かめている。
export const NAME = { ja: 'ドットのおへや', en: 'Tiny Pixel Room' };
