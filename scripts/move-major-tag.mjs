// リリースを出したとき (.github/workflows/release.yml)、同じメジャー版のタグ (v1 など) を、そのリリースのコミットに付け替える。
// 使い方: node scripts/move-major-tag.mjs <リリースのタグ (v1.2.3 など)>
// 使う人のワークフローは moppy626/tiny-pixel-room@v1 と書くので、v1 を付け替えると、次の実行から新しい版が動く。
// タグを push できる権限で動くので、npm の依存パッケージは読まない。node: のものと、このリポジトリのファイルだけを読む
// (test/release.test.mjs で確かめている)。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bilingual, encodeCommand } from '../src/messages.mjs';

// 正式な版のタグ。v1.2.3-rc.1 のようなプレリリースのタグと、v01.2.3 のように 0 で始まる数は扱わない。
const VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const parse = (tag) => tag.match(VERSION)?.slice(1).map(Number) ?? null;
// 数として比べる (v1.10.0 は v1.9.0 より新しい)。
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// tag (リリースのタグ) を出したときに付け替える、メジャー版のタグを major で返す。tags はリポジトリにあるタグの名前。
// 付け替えないときはそのわけを skip に、タグの形が違うときは直し方を error に入れて返す。
export function majorTagFor(tag, tags) {
  const version = parse(tag);
  if (!version) {
    return { error: bilingual(`リリースのタグは v1.2.3 の形にしてください: ${tag}`, `The release tag must look like v1.2.3: ${tag}`) };
  }
  const major = `v${version[0]}`;
  // 同じメジャー版の正式な版のうち、いちばん新しいもの。古い版を直して出し直したときは、新しい版から戻さない。
  const latest = tags
    .map((name) => ({ name, version: parse(name) }))
    .filter((other) => other.version?.[0] === version[0])
    .reduce((a, b) => (compare(b.version, a.version) > 0 ? b : a), { name: tag, version });
  if (latest.name !== tag) {
    return {
      skip: bilingual(
        `${tag} は ${major} のいちばん新しい版 (${latest.name}) ではないので、${major} は付け替えませんでした`,
        `Didn't move ${major} because ${tag} isn't the newest ${major} release (${latest.name})`,
      ),
    };
  }
  return { major };
}

// テストから majorTagFor だけを使えるよう、直接動かしたときだけタグを付け替える。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2] ?? '';
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  try {
    const { major, skip, error } = majorTagFor(tag, git('tag', '--list').split('\n').filter(Boolean));
    if (error) throw new Error(error);
    if (skip) {
      console.log(`::notice::${encodeCommand(skip)}`);
    } else {
      // 注釈付きのタグを出しても、メジャー版のタグはコミットを指すようにする。
      git('tag', '--force', major, `${tag}^{commit}`);
      git('push', '--force', 'origin', `refs/tags/${major}`);
      console.log(bilingual(`${major} を ${tag} に付け替えました`, `Moved ${major} to ${tag}`));
    }
  } catch (error) {
    console.error(`::error::${encodeCommand(error.message)}`);
    process.exit(1);
  }
}
