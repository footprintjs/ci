import { LABEL } from './decide.mjs';

// One fixed GET per page. /issues returns issues AND pull requests (a pull request is
// an issue with a `pull_request` key), which is what we want: either may hold.
// 5 pages x 100 = 500 holds is the bound; past it we refuse rather than guess, and say so.
const PAGE = 100;
const MAX_PAGES = 5;

export async function listHolds(get, repo) {
  const found = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const path = `/repos/${repo}/issues?state=open&labels=${LABEL}&per_page=${PAGE}${page > 1 ? `&page=${page}` : ''}`;
    const items = await get(path);
    if (!Array.isArray(items) || items.length > PAGE) throw new Error('GitHub answered with something that is not a list of at most 100 items');
    for (const item of items) {
      if (item === null || typeof item !== 'object' || !Number.isSafeInteger(item.number) || item.number < 1 || typeof item.title !== 'string')
        throw new Error('an item in the list has no number or title');
      found.push({ number: item.number, title: item.title, pullRequest: item.pull_request != null });
    }
    if (items.length < PAGE) return found;
  }
  throw new Error(`more than ${MAX_PAGES * PAGE} open items carry the label; refusing to guess past that`);
}
