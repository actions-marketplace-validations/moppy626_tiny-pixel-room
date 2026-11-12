import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RATE_LIMIT_WAIT_MS, RETRY_DELAYS_MS, fetchAccount, retryTimer } from '../src/github.mjs';

const forbidden = {
  data: { user: null },
  errors: [{ type: 'FORBIDDEN', path: ['user'], message: 'Resource not accessible by integration' }],
};

// 草の最後の日 (2026-11-08) が、草の日付での今日になる。
const profileCalendar = { weeks: [{ contributionDays: [{ date: '2026-11-01' }, { date: '2026-11-02' }] }, { contributionDays: [{ date: '2026-11-08' }] }] };
// 範囲を指定しない contributionsCollection。コミットの数は、この草の期間 (およそ過去 1 年) の値を使う。
// restricted は非公開の活動数で、Private contributions がオンのときだけ 0 より大きくなる。
const profileWith = (restricted) => ({
  data: {
    user: {
      contributionsCollection: {
        contributionYears: [2026, 2025],
        totalCommitContributions: 3,
        restrictedContributionsCount: restricted,
        contributionCalendar: profileCalendar,
      },
    },
  },
});
const profileResponse = profileWith(0);

const defaultYears = {
  data: {
    user: {
      y2026: { contributionCalendar: { totalContributions: 5, weeks: [{ contributionDays: [{ date: '2026-01-01', contributionCount: 5 }] }] } },
      y2025: { contributionCalendar: { totalContributions: 3, weeks: [{ contributionDays: [{ date: '2025-01-01', contributionCount: 3 }] }] } },
    },
  },
};

// スターの多い順に並んだ、1 ページ分のリポジトリのスター数。totalCount は、すべてのページを合わせたリポジトリの数。
const starsPage = (counts, hasNextPage = false, totalCount = counts.length) => ({
  data: {
    user: {
      repositories: {
        totalCount,
        pageInfo: { hasNextPage, endCursor: hasNextPage ? `after-${counts.join('-')}` : null },
        nodes: counts.map((stargazerCount) => ({ stargazerCount })),
      },
    },
  },
});

// 1 ページ分のリポジトリの言語。names は 1 リポジトリに 1 つずつ入れる言語の名前。
const languagesPage = (names, hasNextPage = false) => ({
  data: {
    user: {
      repositories: {
        pageInfo: { hasNextPage, endCursor: hasNextPage ? `after-${names.join('-')}` : null },
        nodes: names.map((name) => ({ languages: { edges: [{ size: 10, node: { name } }] } })),
      },
    },
  },
});

// クエリの内容ごとの応答を差し替えて fetch を置きかえる。
// 応答は、本文のオブジェクトか、Response を返す関数で書く。配列なら 1 回ごとに順に返し、最後の 1 つを繰り返す。
function stubApi(t, overrides = {}) {
  const defaults = {
    profile: profileResponse,
    pullRequests: { data: { user: { pullRequests: { totalCount: 4 } } } },
    issues: { data: { user: { issues: { totalCount: 2 } } } },
    stars: starsPage([3]),
    languages: languagesPage(['Go']),
    years: defaultYears,
  };
  const responses = { ...defaults, ...overrides };
  // failures は、どの問い合わせかに関係なく最初の数回だけ返す失敗。
  // 数字は HTTP の状態コード、Error は通信エラー、それ以外はそのまま fetch の結果にする。
  const failures = [...(responses.failures ?? [])];
  t.mock.method(retryTimer, 'wait', async () => {});
  const next = (key) => {
    const entry = responses[key];
    const value = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry;
    return typeof value === 'function' ? value() : Response.json(value);
  };
  // 応答は、そのクエリにしかない項目で選ぶ。ほかのクエリに項目を足しても、行き先が変わらない。
  const pick = (query) => {
    if (query.includes('contributionYears')) return next('profile');
    if (query.includes('pullRequests {')) return next('pullRequests');
    if (query.includes('issues {')) return next('issues');
    if (query.includes('languages(')) return next('languages');
    if (query.includes('stargazerCount')) return next('stars');
    if (query.includes('contributionsCollection(from:')) return next('years');
    throw new Error(`知らないクエリです: ${query}`);
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const failure = failures.shift();
    if (failure instanceof Error) throw failure;
    if (typeof failure === 'number') return Response.json({ message: 'failure' }, { status: failure });
    if (failure) return failure;
    assert.equal(String(url), 'https://api.github.com/graphql');
    return pick(JSON.parse(init.body).query);
  });
}

const graphqlCalls = () => globalThis.fetch.mock.calls.map((call) => JSON.parse(call.arguments[1].body));

test('アカウント全体の数字をまとめる', async (t) => {
  stubApi(t);
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalContributions, 8);
  assert.equal(account.totalCommits, 3);
  assert.equal(account.totalPullRequests, 4);
  assert.equal(account.totalIssues, 2);
  assert.equal(account.stars, 3);
  assert.equal(account.totalRepositories, 1);
  assert.equal(account.days.length, 2);
});

test('スター、リポジトリの数、言語は、トークンで読める非公開リポジトリも数える', async (t) => {
  stubApi(t);
  await fetchAccount('octocat', 'token');
  const queries = graphqlCalls().map(({ query }) => query).filter((query) => query.includes('repositories('));
  assert.equal(queries.length, 2);
  for (const query of queries) assert.doesNotMatch(query, /privacy:/);
});

test('github-readme-stats と同じく、スターはフォークも数え、言語はフォークを除く', async (t) => {
  stubApi(t);
  const account = await fetchAccount('octocat', 'token');
  const queries = graphqlCalls().map(({ query }) => query);
  assert.doesNotMatch(queries.find((query) => query.includes('stargazerCount')), /isFork/);
  assert.match(queries.find((query) => query.includes('languages(')), /isFork: false/);
  assert.deepEqual(account.repositories, [{ languages: [{ name: 'Go', size: 10 }] }]);
});

test('スターは次のページも足し、スターが 0 のリポジトリが出たら次のページは取らない', async (t) => {
  stubApi(t, { stars: [starsPage([10, 5], true), starsPage([2, 0], true), starsPage([99])] });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.stars, 17);
  const afters = graphqlCalls().filter(({ query }) => query.includes('stargazerCount')).map(({ variables }) => variables.after);
  assert.deepEqual(afters, [null, 'after-10-5']);
});

test('リポジトリの数は、スターと同じく、フォークも含めた自分のリポジトリを数える', async (t) => {
  // スターを数え終えて途中のページで止めても、すべてのページを合わせた数になる。
  // ページを取るあいだにリポジトリが増えても、1 ページ目の数を使う。
  stubApi(t, { stars: [starsPage([10, 5], true, 250), starsPage([2, 0], true, 251)] });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalRepositories, 250);
  const query = graphqlCalls().map(({ query }) => query).find((query) => query.includes('stargazerCount'));
  assert.match(query, /ownerAffiliations: OWNER/);
  assert.match(query, /totalCount/);
});

test('言語は先頭 100 件で止めず、次のページのリポジトリも数える', async (t) => {
  stubApi(t, { languages: [languagesPage(['Go', 'C'], true), languagesPage(['Rust'])] });
  const account = await fetchAccount('octocat', 'token');
  assert.deepEqual(account.repositories.map((repo) => repo.languages[0].name), ['Go', 'C', 'Rust']);
  const afters = graphqlCalls().filter(({ query }) => query.includes('languages(')).map(({ variables }) => variables.after);
  assert.deepEqual(afters, [null, 'after-Go-C']);
});

test('PR の権限だけがなければ、PR は不明にして残りは取る', async (t) => {
  stubApi(t, { pullRequests: forbidden });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalPullRequests, null);
  assert.equal(account.totalIssues, 2);
  assert.equal(account.totalContributions, 8);
});

test('権限以外のエラーは隠さない', async (t) => {
  stubApi(t, { issues: { data: null, errors: [{ type: 'INTERNAL', message: 'boom' }] } });
  await assert.rejects(fetchAccount('octocat', 'token'), /boom/);
});

test('回数の上限ではない 403 は、GitHub が返した理由も示して止まる', async (t) => {
  const sso = 'Resource protected by organization SAML enforcement. You must grant your Personal Access token access to this organization.';
  stubApi(t, { profile: () => Response.json({ message: sso }, { status: 403 }) });
  const expected = `GitHub API が 403 を返しました: ${sso}\nGitHub API returned 403: ${sso}`;
  await assert.rejects(fetchAccount('octocat', 'token'), (error) => error.message === expected);
});

test('理由のない失敗は、状態コードだけを示す', async (t) => {
  stubApi(t, { profile: () => new Response('', { status: 404 }) });
  const expected = 'GitHub API が 404 を返しました\nGitHub API returned 404';
  await assert.rejects(fetchAccount('octocat', 'token'), (error) => error.message === expected);
});

test('GraphQL のエラーは、GitHub が返した理由を日本語と英語の行の両方に入れる', async (t) => {
  stubApi(t, { issues: { data: null, errors: [{ type: 'INTERNAL', message: 'boom' }] } });
  const expected = 'GitHub API がエラーを返しました: boom\nGitHub API returned an error: boom';
  await assert.rejects(fetchAccount('octocat', 'token'), (error) => error.message === expected);
});

test('contributions が取れないときは、間違った数字を出さずに止まる', async (t) => {
  stubApi(t, { years: forbidden });
  await assert.rejects(fetchAccount('octocat', 'token'), /Resource not accessible/);
});

test('草の最後の日を、草の日付での今日にする', async (t) => {
  stubApi(t);
  assert.equal((await fetchAccount('octocat', 'token')).today, '2026-11-08');
});

test('草の日付が読めなければ、間違った日付で数えずに止まる', async (t) => {
  const empty = { data: { user: { contributionsCollection: { contributionYears: [2026], contributionCalendar: { weeks: [] } } } } };
  stubApi(t, { profile: empty });
  await assert.rejects(fetchAccount('octocat', 'token'), /今日の日付を読めませんでした/);
});

// GitHub は、見つからないユーザー (組織の名前も) を、user が null の応答に NOT_FOUND のエラーを付けて返す。
const notFound = {
  data: { user: null },
  errors: [{ type: 'NOT_FOUND', path: ['user'], message: "Could not resolve to a User with the login of 'octocat'." }],
};

for (const [label, profile] of [['NOT_FOUND のエラーが付いた', notFound], ['エラーのない', { data: { user: null } }]]) {
  test(`ユーザーが見つからなければ、username の直し方を示して止まる: ${label}応答`, async (t) => {
    stubApi(t, { profile });
    await assert.rejects(
      fetchAccount('octocat', 'token'),
      (error) =>
        /^GitHub のユーザー octocat が見つかりません。username には GitHub のユーザー名を書いてください \(組織の名前は使えません\)\n/.test(error.message) &&
        /\nGitHub user octocat was not found\. Set username to a GitHub username \(organization names can't be used\)$/.test(error.message),
    );
  });
}

// 既定のトークンでは非公開リポジトリのコミットを検索できないので、コミット検索はしない (stubApi は GraphQL 以外の通信で失敗する)。
test('コミットは、Private contributions がオンでも、草の期間の公開リポジトリの分だけ数える', async (t) => {
  stubApi(t, { profile: profileWith(40) });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalCommits, 3);
});

test('コミットは草の期間だけで数え、年ごとの草の問い合わせには入れない', async (t) => {
  stubApi(t, { profile: profileWith(40) });
  await fetchAccount('octocat', 'token');
  const years = graphqlCalls().map(({ query }) => query).filter((query) => query.includes('y2026:'));
  assert.ok(years.length > 0);
  for (const query of years) assert.doesNotMatch(query, /Commit/);
});

const waits = () => retryTimer.wait.mock.calls.map((call) => call.arguments[0]);
const connectionReset = () => Object.assign(new TypeError('fetch failed'), { cause: new Error('read ECONNRESET') });

test('GitHub が一時的に 5xx を返したら、間をあけてやり直す', async (t) => {
  stubApi(t, { failures: [502, 503] });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalContributions, 8);
  assert.deepEqual(waits(), RETRY_DELAYS_MS);
});

test('通信エラーもやり直す', async (t) => {
  stubApi(t, { failures: [connectionReset()] });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalContributions, 8);
  assert.equal(waits().length, 1);
});

test('やり直しても 5xx なら止まる', async (t) => {
  stubApi(t, { failures: [502, 502, 502] });
  await assert.rejects(fetchAccount('octocat', 'token'), /502/);
  assert.equal(waits().length, RETRY_DELAYS_MS.length);
});

test('やり直しても通信できなければ、理由を示して止まる', async (t) => {
  stubApi(t, { failures: [connectionReset(), connectionReset(), connectionReset()] });
  await assert.rejects(fetchAccount('octocat', 'token'), /接続できませんでした: read ECONNRESET/);
});

test('どの通信にもタイムアウトを付ける', async (t) => {
  stubApi(t);
  await fetchAccount('octocat', 'token');
  for (const call of globalThis.fetch.mock.calls) assert.ok(call.arguments[1].signal instanceof AbortSignal);
});

test('トークンが無効なら、やり直さずに直し方を示して止まる', async (t) => {
  stubApi(t, { failures: [401] });
  await assert.rejects(fetchAccount('octocat', 'token'), /有効期限が切れている.*既定のトークンに戻して/);
  assert.equal(waits().length, 0);
});

test('権限で断られたときは、やり直さない', async (t) => {
  stubApi(t, { pullRequests: forbidden });
  await fetchAccount('octocat', 'token');
  assert.equal(waits().length, 0);
});

const rateLimited = (status, headers = {}) => () => Response.json({ message: 'You have exceeded a secondary rate limit' }, { status, headers });

test('回数の上限に当たったら、GitHub が示す時間だけ待ってやり直す', async (t) => {
  stubApi(t, { profile: [rateLimited(429, { 'retry-after': '5' }), profileResponse] });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalContributions, 8);
  assert.deepEqual(waits(), [5000]);
});

test('待つ時間が示されない回数の上限は、1 分待ってやり直す', async (t) => {
  stubApi(t, { profile: [rateLimited(403), profileResponse] });
  await fetchAccount('octocat', 'token');
  assert.deepEqual(waits(), [RATE_LIMIT_WAIT_MS]);
});

test('回数の上限が長く続くときは、やり直さずに理由を示して止まる', async (t) => {
  const reset = String(Math.floor(Date.now() / 1000) + 3600);
  stubApi(t, { profile: rateLimited(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }) });
  await assert.rejects(fetchAccount('octocat', 'token'), /回数の上限に達しました \(403\)/);
  assert.equal(waits().length, 0);
});

test('重いクエリが 200 のままタイムアウトのエラーになったら、やり直す', async (t) => {
  const timedOut = { data: null, errors: [{ message: 'Something went wrong while executing your query. This may be the result of a timeout, or it could be a GitHub bug.' }] };
  stubApi(t, { years: [timedOut, defaultYears] });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalContributions, 8);
  assert.equal(waits().length, 1);
});

const timeout = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');

test('本文を受け取っている途中でタイムアウトしても、やり直す', async (t) => {
  const slowBody = { status: 200, ok: true, headers: new Headers(), text: async () => { throw timeout(); } };
  stubApi(t, { failures: [slowBody] });
  const account = await fetchAccount('octocat', 'token');
  assert.equal(account.totalContributions, 8);
  assert.equal(waits().length, 1);
});

test('やり直してもタイムアウトするなら、時間切れだと示して止まる', async (t) => {
  stubApi(t, { failures: [timeout(), timeout(), timeout()] });
  await assert.rejects(fetchAccount('octocat', 'token'), /30 秒以内に応答がありませんでした/);
});

test('最初の問い合わせのあとは、互いに関係しない問い合わせをまとめて送る', async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  stubApi(t, { years: () => gate.then(() => Response.json(defaultYears)) });
  const pending = fetchAccount('octocat', 'token');
  await new Promise((resolve) => setImmediate(resolve));
  const queries = globalThis.fetch.mock.calls.map((call) => JSON.parse(call.arguments[1].body).query);
  assert.ok(queries.some((query) => query.includes('repositories(')));
  assert.ok(queries.some((query) => query.includes('pullRequests')));
  assert.ok(queries.some((query) => query.includes('issues')));
  release();
  assert.equal((await pending).totalContributions, 8);
});
