// ブラウザ用のビルドで node:fs などの代わりに使う。
// サイトはフォントを fetch で読んで渡し、カードはファイルに書き出さないので、ここは呼ばれない。
const unavailable = (name) => () => {
  throw new Error(`${name} はブラウザでは使えません`);
};

export const readFileSync = unavailable('readFileSync');
export const readFile = unavailable('readFile');
export const writeFile = unavailable('writeFile');
export const mkdir = unavailable('mkdir');
export const join = unavailable('join');
export const dirname = unavailable('dirname');
