// The release job's decision, so the workflow writes no logic of its own: write the tag and the
// GitHub release, or skip what is already there, or stop.
//
//   tag v<version>:  absent on origin -> create; at the planned commit -> skip;
//                    at another commit -> refuse tag-elsewhere (never move or reuse a tag)
//   GitHub release:  absent -> create; present for tag v<version>, not a draft -> skip;
//                    anything else -> refuse release-unexpected
//
// `decideTag` and `decideRelease` are pure; `tagPlan` gathers their facts through the git door
// (repo.mjs · tagCommit, asked of origin) and the GitHub door (github.mjs · readRelease, the
// route's second GitHub question).
import { readRelease } from './github.mjs';
import { tagCommit } from './repo.mjs';
import { refuse } from './refusals.mjs';

export function decideTag({ tagAt, commit }) {
  if (tagAt === null) return 'create';
  if (tagAt === commit) return 'skip';
  refuse('tag-elsewhere', `v-tag at ${String(tagAt).slice(0, 40)}`);
}

export function decideRelease({ release, version }) {
  if (release === null) return 'create';
  if (release.tagName === `v${version}` && release.draft === false) return 'skip';
  refuse('release-unexpected', release.draft ? 'draft' : 'another tag');
}

export async function tagPlan({ git, fetcher, repo, version, commit, token }) {
  const tag = decideTag({ tagAt: tagCommit(git, version), commit });
  const release = decideRelease({ release: await readRelease({ fetcher, repo, version, token }), version });
  return { tag, release };
}
