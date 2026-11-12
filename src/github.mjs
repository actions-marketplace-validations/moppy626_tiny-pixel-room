// GitHub GraphQL API からアカウント全体のデータを取る。
import { setTimeout as delay } from 'node:timers/promises';
import { bilingual } from './messages.mjs';

const ENDPOINT = 'https://api.github.com/graphql';
const YEARS_PER_REQUEST = 5;
// GitHub は重いクエリにときどき 502 やタイムアウトを返すので、一時的な失敗は間をあけてやり直す。
export const RETRY_DELAYS_MS = [3000, 10000];
const TIMEOUT_MS = 30000;
// 回数の上限に当たったとき、待つ時間が示されていなければ 1 分待つ (GitHub の案内どおり)。
// これより長く待つ必要があるときはやり直さず、その日の更新はあきらめる。
export const RATE_LIMIT_WAIT_MS = 60000;

// テストで待ち時間を飛ばせるよう、待つ処理をオブジェクトに入れておく。
export const retryTimer = { wait: (ms) => delay(ms) };

// 既定のトークンでは起きない。自分で作ったトークン (サポート外) を渡したときに、期限切れなどで起きる。
const UNAUTHORIZED_MESSAGE = bilingual(
  'github-token のトークンが使えません (401)。有効期限が切れているか、取り消されています。' +
    '自分で作ったトークンを渡しているときは、ワークフローの github-token の行を消して、既定のトークンに戻してください',
  "The github-token can't be used (401). It has expired or been revoked. " +
    "If you're passing your own token, remove the github-token line from the workflow to go back to the default token",
);
const rateLimitMessage = (reason) =>
  bilingual(
    `GitHub API の回数の上限に達しました (${reason})。上限が戻れば、次の実行で更新されます`,
    `Reached the GitHub API rate limit (${reason}). The cards will be updated on a later run after the limit resets`,
  );

const headers = (token) => ({
  authorization: `bearer ${token}`,
  'user-agent': 'tiny-pixel-room',
});

// やり直してよい失敗には、最低限待つ時間 (retryAfterMs) を付ける。
const failure = (message, fields = {}) => Object.assign(new Error(message), fields);

// GitHub が理由を返していれば、状態コードと一緒に出す。
// 組織の SSO でトークンの承認が要るときなど、403 だけでは何を直せばよいか分からない。
function httpError(status, body, fields = {}) {
  const reason = body?.message ? `: ${body.message}` : '';
  return failure(bilingual(`GitHub API が ${status} を返しました${reason}`, `GitHub API returned ${status}${reason}`), { status, ...fields });
}

// 見つからないユーザーは、user が null の応答に NOT_FOUND のエラーが付いて返る。
// username の既定はリポジトリの持ち主なので、組織のリポジトリで動かしたときも、組織の名前でこうなる。
const userNotFound = (login) =>
  bilingual(
    `GitHub のユーザー ${login} が見つかりません。username には GitHub のユーザー名を書いてください (組織の名前は使えません)`,
    `GitHub user ${login} was not found. Set username to a GitHub username (organization names can't be used)`,
  );

async function withRetry(attempt) {
  for (let i = 0; ; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (error.retryAfterMs === undefined || i === RETRY_DELAYS_MS.length) throw error;
      await retryTimer.wait(Math.max(error.retryAfterMs, RETRY_DELAYS_MS[i]));
    }
  }
}

// 1 回分の通信。本文を読み終えるまでをタイムアウトに含める。
async function send(url, init) {
  let response;
  let text;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    text = await response.text();
  } catch (error) {
    const seconds = TIMEOUT_MS / 1000;
    const reason = error.cause?.message ?? error.message;
    const message = error.name === 'TimeoutError'
      ? bilingual(`GitHub API から ${seconds} 秒以内に応答がありませんでした`, `The GitHub API didn't respond within ${seconds} seconds`)
      : bilingual(`GitHub API に接続できませんでした: ${reason}`, `Couldn't connect to the GitHub API: ${reason}`);
    throw failure(message, { retryAfterMs: 0 });
  }
  const { status, ok } = response;
  if (status === 401) throw failure(UNAUTHORIZED_MESSAGE, { status });
  if (status >= 500) throw httpError(status, null, { retryAfterMs: 0 });
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    if (ok) throw failure(bilingual('GitHub API の応答を読めませんでした', "Couldn't read the GitHub API response"), { retryAfterMs: 0 });
  }
  return { status, ok, headers: response.headers, body };
}

// 回数の上限は、429 か、待つ時間などが付いた 403 で返る。
function isRateLimited({ status, headers, body }) {
  if (status === 429) return true;
  return status === 403 &&
    (headers.has('retry-after') || headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(body?.message ?? ''));
}

// GitHub が示す時間だけ待つ。長く待つ必要があれば、やり直さない (undefined を返す)。
function rateLimitWait(headers) {
  let ms = RATE_LIMIT_WAIT_MS;
  if (headers.has('retry-after')) ms = Number(headers.get('retry-after')) * 1000;
  else if (headers.get('x-ratelimit-remaining') === '0') ms = Number(headers.get('x-ratelimit-reset')) * 1000 - Date.now();
  return ms <= RATE_LIMIT_WAIT_MS ? Math.max(ms, 0) : undefined;
}

async function graphql(token, query, variables) {
  return withRetry(async () => {
    const response = await send(ENDPOINT, {
      method: 'POST',
      headers: { ...headers(token), 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const { status, ok, body } = response;
    if (isRateLimited(response)) {
      throw failure(rateLimitMessage(status), { status, retryAfterMs: rateLimitWait(response.headers) });
    }
    if (!ok) throw httpError(status, body);
    if (body.errors?.length) {
      const message = body.errors.map((e) => e.message).join('; ');
      if (body.errors.some((e) => e.type === 'RATE_LIMITED')) {
        throw failure(rateLimitMessage(message), { retryAfterMs: rateLimitWait(response.headers) });
      }
      // 重いクエリは、200 のまま「Something went wrong ... timeout」というエラーになることがある。
      const timedOut = body.errors.some((e) => /something went wrong|timeout|timed out/i.test(e.message));
      throw failure(bilingual(`GitHub API がエラーを返しました: ${message}`, `GitHub API returned an error: ${message}`), {
        forbidden: body.errors.every((e) => e.type === 'FORBIDDEN' || /not accessible/i.test(e.message)),
        notFound: body.errors.every((e) => e.type === 'NOT_FOUND'),
        retryAfterMs: timedOut ? 0 : undefined,
      });
    }
    return body.data;
  });
}

// 範囲を指定しない contributionsCollection の草は、草と同じ地域の今日で終わる。
// 草の日付の区切りはトークンで変わる (既定のトークンなら UTC、本人のトークンなら本人の地域) ので、今日もここから決める。
// コミットの数も、github-readme-stats と同じく、この範囲 (草の期間。およそ過去 1 年) で数える。
const PROFILE_QUERY = `query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionYears
      totalCommitContributions
      contributionCalendar { weeks { contributionDays { date } } }
    }
  }
}`;

function lastDate(calendar) {
  const lastWeek = calendar.weeks.at(-1)?.contributionDays ?? [];
  return lastWeek.at(-1)?.date;
}

// 1 つのクエリにまとめると、片方の権限エラーで user ごと null になるので分けて取る。
const countQuery = (field) => `query ($login: String!) { user(login: $login) { ${field} { totalCount } } }`;

// スターと言語は、github-readme-stats と同じ範囲のリポジトリで数える。
// スター、リポジトリの数、言語のどれも privacy は指定しない。トークンで読める非公開リポジトリも数える。

// スターとリポジトリの数は、フォークも含めた自分のリポジトリで数える。スターの多い順に取る。
// プロフィールの Repositories は見る人で数が変わる (本人には非公開リポジトリも数える) ので、それとは合わせない。
// 既定のトークンでも、ワークフローを動かしている非公開リポジトリは読めるので、そのリポジトリは数に入る。
const OWNED_QUERY = `query ($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, orderBy: { field: STARGAZERS, direction: DESC }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { stargazerCount }
    }
  }
}`;

// 言語は、フォークを除いた自分のリポジトリで数える。
// github-readme-stats は先頭 100 件までしか見ないが、ここでは次のページも取ってすべて数える。
const LANGUAGES_QUERY = `query ($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

const CALENDAR_FIELDS = `contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }`;

// contributionsCollection は 1 回で 1 年分までなので、年ごとに分けて取る。
// 範囲の日付は from と to の日付部分で決まり、その日の分がまるごと入るので、年どうしで日は重ならない。
function yearsQuery(years, fields) {
  const collections = years
    .map((year) => `y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") {
        ${fields}
      }`)
    .join('\n');
  return `query ($login: String!) { user(login: $login) { ${collections} } }`;
}

async function fetchByYear(login, token, years, fields) {
  const batches = [];
  for (let i = 0; i < years.length; i += YEARS_PER_REQUEST) batches.push(years.slice(i, i + YEARS_PER_REQUEST));
  const results = await Promise.all(batches.map((batch) => graphql(token, yearsQuery(batch, fields), { login })));
  return results.flatMap((data, i) => batches[i].map((year) => data.user[`y${year}`]));
}

// トークンの権限が足りない項目は不明 (null) にして、カードの作成は続ける。
async function fetchCount(field, login, token) {
  try {
    const data = await graphql(token, countQuery(field), { login });
    return data.user[field].totalCount;
  } catch (error) {
    if (error.forbidden) return null;
    throw error;
  }
}

async function fetchContributions(login, token, years) {
  const collections = await fetchByYear(login, token, years, CALENDAR_FIELDS);
  const days = collections.flatMap((collection) =>
    collection.contributionCalendar.weeks.flatMap((week) =>
      week.contributionDays.map((day) => ({ date: day.date, count: day.contributionCount })),
    ),
  );
  const totalContributions = collections.reduce((sum, c) => sum + c.contributionCalendar.totalContributions, 0);
  return { days, totalContributions };
}

// 自分のリポジトリのスターの合計と、リポジトリの数。リポジトリの数は 1 ページ目で分かる。
async function fetchOwned(login, token) {
  let stars = 0;
  let totalRepositories;
  let after = null;
  do {
    const data = await graphql(token, OWNED_QUERY, { login, after });
    const page = data.user.repositories;
    totalRepositories ??= page.totalCount;
    const counts = page.nodes.map((node) => node.stargazerCount);
    stars += counts.reduce((sum, count) => sum + count, 0);
    // スターの多い順なので、0 のリポジトリが出たら残りもすべて 0。次のページは取らない。
    after = page.pageInfo.hasNextPage && !counts.includes(0) ? page.pageInfo.endCursor : null;
  } while (after);
  return { stars, totalRepositories };
}

// リポジトリごとの言語とバイト数。
async function fetchLanguages(login, token) {
  const repositories = [];
  let after = null;
  do {
    const data = await graphql(token, LANGUAGES_QUERY, { login, after });
    const page = data.user.repositories;
    for (const node of page.nodes) {
      repositories.push({ languages: node.languages.edges.map((edge) => ({ name: edge.node.name, size: edge.size })) });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return repositories;
}

export async function fetchAccount(login, token) {
  const profile = await graphql(token, PROFILE_QUERY, { login }).catch((error) => {
    if (error.notFound) return { user: null };
    throw error;
  });
  if (!profile.user) throw new Error(userNotFound(login));
  const collection = profile.user.contributionsCollection;
  const today = lastDate(collection.contributionCalendar);
  if (!today) {
    throw new Error(bilingual('GitHub API の応答から今日の日付を読めませんでした', "Couldn't read today's date from the GitHub API response"));
  }

  // 残りの問い合わせは互いに関係しないので、まとめて送る。
  const [contributions, owned, repositories, totalPullRequests, totalIssues] = await Promise.all([
    fetchContributions(login, token, collection.contributionYears),
    fetchOwned(login, token),
    fetchLanguages(login, token),
    fetchCount('pullRequests', login, token),
    fetchCount('issues', login, token),
  ]);
  return {
    login,
    // 草の日付での今日。連続記録とキャラクターの開始日は、この日付で数える。
    today,
    ...contributions,
    // 草の期間 (およそ過去 1 年) のコミットの数。非公開リポジトリのコミットは、Private contributions がオンでも
    // 種類の分からない非公開の活動の合計にしか入らないので、ここには入らない。
    totalCommits: collection.totalCommitContributions,
    // 言語を数えるリポジトリ (フォークを除いたすべて)。
    repositories,
    totalPullRequests,
    totalIssues,
    // スターの合計 (stars) と、自分のリポジトリの数 (totalRepositories)。
    ...owned,
  };
}
