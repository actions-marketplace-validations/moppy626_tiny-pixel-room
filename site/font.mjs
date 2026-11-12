// 設定サイトのプレビューで使うフォントの場所。
// scripts/build-site.mjs が fonts/ の OTF を WOFF にしてここに書き出し、main.mjs がここから読む。
import { UNIFONT_URL } from '../src/fonts.mjs';

export const SITE_FONT_PATH = `fonts/${UNIFONT_URL.pathname.split('/').pop().replace(/\.[^.]+$/, '.woff')}`;
