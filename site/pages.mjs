// 設定サイトの URL。言葉ごとにページを分ける (日本語は /、英語は /en/)。
// ブラウザの言葉で表示を変えるだけだと、検索エンジンのクローラーは英語のブラウザとして読むので、日本語のページが見つからない。
// ページを分けて hreflang で互いを知らせると、検索した人の言葉に合ったページが検索結果に出る。
// サイトを作るとき (scripts/build-site.mjs) と、README に貼るコードのリンク (workflow.mjs) で使う。
export const SITE_URL = 'https://moppy626.github.io/tiny-pixel-room/';
export const PAGES = { ja: '', en: 'en/' };
