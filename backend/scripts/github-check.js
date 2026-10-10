require('dotenv').config();
const jwt = require('jsonwebtoken');

const appId = process.env.GITHUB_APP_ID;
const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const [owner, repo] = (process.argv[2] || '').split('/');

if (!appId || !installationId || !privateKey || !owner || !repo) {
  console.error('Usage: node scripts/github-check.js owner/repo (and set .env)');
  process.exit(1);
}

async function gh(url, token, init = {}) {
  const res = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(2500),
  });
  console.log(url, '->', res.status);
  return res.json();
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const appJwt = jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: appId },
    privateKey,
    { algorithm: 'RS256' },
  );

  const tokenRes = await gh(
    `/app/installations/${installationId}/access_tokens`,
    appJwt,
    { method: 'POST' },
  );
  const installToken = tokenRes.token;
  if (!installToken) return console.error('No token:', tokenRes.message);

  const prs = await gh(
    `/repos/${owner}/${repo}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=30`,
    installToken,
  );
  const merged = prs
    .filter((p) => p.merged_at)
    .sort((a, b) => new Date(b.merged_at) - new Date(a.merged_at))[0];

  console.log(
    merged
      ? { number: merged.number, title: merged.title, author: merged.user.login, mergedAt: merged.merged_at, url: merged.html_url }
      : 'No merged PR into main found',
  );
})();