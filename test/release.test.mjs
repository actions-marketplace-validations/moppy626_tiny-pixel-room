import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { majorTagFor } from '../scripts/move-major-tag.mjs';
import { isolatedEnv } from './fixtures/env.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/move-major-tag.mjs', import.meta.url));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('リリースのタグのメジャー版のタグを付け替える', () => {
  assert.deepEqual(majorTagFor('v1.2.0', ['v1', 'v1.0.0', 'v1.1.0', 'v1.2.0']), { major: 'v1' });
  assert.deepEqual(majorTagFor('v2.0.0', ['v1', 'v1.5.0', 'v2.0.0']), { major: 'v2' });
});

test('版は数として比べる (v1.10.0 は v1.9.0 より新しい)', () => {
  assert.deepEqual(majorTagFor('v1.10.0', ['v1.9.0', 'v1.10.0']), { major: 'v1' });
  assert.match(majorTagFor('v1.9.1', ['v1.9.0', 'v1.9.1', 'v1.10.0']).skip, /v1\.10\.0/);
});

test('古い版を直して出し直したときは、新しい版から付け替えない', () => {
  const { major, skip } = majorTagFor('v1.0.1', ['v1', 'v1.0.0', 'v1.0.1', 'v1.1.0']);
  assert.equal(major, undefined);
  assert.match(skip, /^v1\.0\.1 は v1 のいちばん新しい版 \(v1\.1\.0\) ではないので、v1 は付け替えませんでした\n/);
  assert.match(skip, /\nDidn't move v1 because v1\.0\.1 isn't the newest v1 release \(v1\.1\.0\)$/);
});

test('ほかのメジャー版のタグと、正式な版ではないタグは比べない', () => {
  assert.deepEqual(majorTagFor('v1.5.1', ['v1.5.0', 'v1.5.1', 'v2.0.0', 'v10.0.0']), { major: 'v1' });
  assert.deepEqual(majorTagFor('v1.2.0', ['v1.2.0', 'v1.3.0-rc.1', 'v1.9', 'latest']), { major: 'v1' });
});

for (const tag of ['v1', '1.2.3', 'v1.2', 'v1.2.3-rc.1', 'v01.2.3', '']) {
  test(`リリースのタグが v1.2.3 の形でなければ、直し方を示す: ${JSON.stringify(tag)}`, () => {
    const { major, error } = majorTagFor(tag, [tag]);
    assert.equal(major, undefined);
    assert.equal(error, `リリースのタグは v1.2.3 の形にしてください: ${tag}\nThe release tag must look like v1.2.3: ${tag}`);
  });
}

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: isolatedEnv(),
  }).trim();

// リモートと、それを clone した作業コピー。作業コピーには v1.0.0 と、それを指す v1 がある。
function createRepos(t) {
  const root = mkdtempSync(join(tmpdir(), 'tiny-pixel-room-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, 'remote.git');
  const work = join(root, 'work');
  git(root, 'init', '--quiet', '--bare', '--initial-branch=main', remote);
  git(root, 'clone', '--quiet', remote, work);
  git(work, 'commit', '--quiet', '--allow-empty', '-m', 'v1.0.0');
  git(work, 'tag', 'v1.0.0');
  git(work, 'tag', 'v1');
  git(work, 'push', '--quiet', 'origin', 'HEAD', '--tags');
  return { remote, work };
}

const runScript = (cwd, tag) => spawnSync(process.execPath, [SCRIPT, tag], { cwd, encoding: 'utf8', env: isolatedEnv() });

test('新しい版を出したら、リモートの v1 をそのコミットに付け替え、注釈付きのタグでもコミットを指す', (t) => {
  const { remote, work } = createRepos(t);
  git(work, 'commit', '--quiet', '--allow-empty', '-m', 'v1.1.0');
  git(work, 'tag', '--annotate', 'v1.1.0', '-m', 'v1.1.0');
  git(work, 'push', '--quiet', 'origin', 'HEAD', 'v1.1.0');

  const result = runScript(work, 'v1.1.0');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'v1 を v1.1.0 に付け替えました\nMoved v1 to v1.1.0\n');
  assert.equal(git(remote, 'rev-parse', 'v1'), git(remote, 'rev-parse', 'v1.1.0^{commit}'));
  assert.equal(git(remote, 'cat-file', '-t', 'v1'), 'commit');
});

test('古い版を直して出し直したときは、リモートの v1 を動かさずに知らせる', (t) => {
  const { remote, work } = createRepos(t);
  git(work, 'commit', '--quiet', '--allow-empty', '-m', 'v1.1.0');
  git(work, 'tag', 'v1.1.0');
  git(work, 'tag', '--force', 'v1');
  git(work, 'push', '--quiet', '--force', 'origin', 'HEAD', '--tags');
  const before = git(remote, 'rev-parse', 'v1');
  git(work, 'checkout', '--quiet', 'v1.0.0');
  git(work, 'commit', '--quiet', '--allow-empty', '-m', 'v1.0.1');
  git(work, 'tag', 'v1.0.1');
  git(work, 'push', '--quiet', 'origin', 'v1.0.1');

  const result = runScript(work, 'v1.0.1');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^::notice::v1\.0\.1 は v1 のいちばん新しい版 \(v1\.1\.0\) ではないので、v1 は付け替えませんでした%0ADidn't move v1/);
  assert.equal(git(remote, 'rev-parse', 'v1'), before);
});

test('リリースのタグの形が違えば、1 行の注釈で直し方を示して止まり、タグは動かさない', (t) => {
  const { remote, work } = createRepos(t);
  const before = git(remote, 'rev-parse', 'v1');

  const result = runScript(work, 'release-1');

  assert.equal(result.status, 1);
  assert.equal(result.stderr, '::error::リリースのタグは v1.2.3 の形にしてください: release-1%0AThe release tag must look like v1.2.3: release-1\n');
  assert.equal(git(remote, 'rev-parse', 'v1'), before);
});

// タグを push できる権限で動くので、npm の依存パッケージ (opentype.js や esbuild など) を読まない。
test('タグを付け替えるスクリプトは、node: のものとこのリポジトリのファイルだけを読む', () => {
  const imports = [...read('../scripts/move-major-tag.mjs').matchAll(/^import .* from '([^']+)';$/gm)].map(([, from]) => from);
  assert.ok(imports.length > 0);
  for (const from of imports) assert.match(from, /^(node:|\.\.?\/)/, from);
  // 読んでいるこのリポジトリのファイルも、npm の依存パッケージを読まない。
  assert.doesNotMatch(read('../src/messages.mjs'), /^import /m);
});

// release.yml の、jobs: の下のジョブごとの部分。
function releaseJobs() {
  const jobs = read('../.github/workflows/release.yml').split(/^jobs:\n/m)[1];
  return Object.fromEntries([...jobs.matchAll(/^ {2}([\w-]+):\n([\s\S]*?)(?=^ {2}[\w-]+:\n|(?![\s\S]))/gm)].map(([, name, body]) => [name, body]));
}

test('リリースのワークフローでは、タグを push する権限を npm を動かさないジョブだけに付ける', () => {
  const workflow = read('../.github/workflows/release.yml');
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  const jobs = releaseJobs();
  assert.deepEqual(Object.keys(jobs), ['verify', 'move-tag']);
  assert.match(jobs.verify, /persist-credentials: false/);
  assert.doesNotMatch(jobs.verify, /contents: write/);
  assert.match(jobs['move-tag'], /^ {4}needs: verify$/m);
  assert.match(jobs['move-tag'], /^ {6}contents: write$/m);
  assert.doesNotMatch(jobs['move-tag'], /npm|cache:/);
  // タグの名前は、式で run に埋め込まず (シェルとして読まれないよう)、環境変数で渡す。
  assert.match(jobs['move-tag'], /^ {6}- run: node scripts\/move-major-tag\.mjs "\$TAG"$/m);
  assert.doesNotMatch(jobs['move-tag'], /run: .*\$\{\{/);
});
