// The ONE rule for talking to GitHub's API, shared by the hold check and the release route:
// which host, which token shape, which headers, which repository names.
//
// The host is FIXED: https://api.github.com. GITHUB_API_URL is not read, so a token is never
// sent to a host an environment variable named (the second reader of the route's first pull
// request had a planted GITHUB_API_URL receive the token and decide the plan). GitHub
// Enterprise Server is therefore not supported; the family lives on github.com.

export const GITHUB_API = 'https://api.github.com';
const TOKEN = /^[\x21-\x7e]{1,8192}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

// A token is printable ASCII without spaces, at most 8192 characters.
export const isToken = (token) => typeof token === 'string' && TOKEN.test(token);

// "owner/name", each part from GitHub's alphabet, never "." or "..".
export const isRepository = (repo) => typeof repo === 'string' && REPOSITORY.test(repo) && !repo.split('/').some((part) => /^\.+$/.test(part));

// The headers of every request; the token, when given, in one header and nowhere else.
export function githubHeaders(token) {
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return headers;
}
