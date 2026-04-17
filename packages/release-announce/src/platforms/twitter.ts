import type {
  FormattedContent,
  PlatformAdapter,
  PostResult,
} from './types.js';
import { isDryRun } from './types.js';
import { truncate } from '../templates.js';

const REQUIRED = [
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_SECRET',
] as const;

const MAX_LEN = 280;

/**
 * Build a Twitter platform adapter. Loads `twitter-api-v2` at call time;
 * throws with an actionable message if the optional peer dep is missing.
 */
export async function twitterAdapter(): Promise<PlatformAdapter> {
  let TwitterApi: typeof import('twitter-api-v2').TwitterApi | undefined;
  try {
    ({ TwitterApi } = await import('twitter-api-v2'));
  } catch (err) {
    throw new Error(
      'Twitter platform requires twitter-api-v2. Install with: ' +
        'npm install --save-dev twitter-api-v2\n' +
        'Original: ' + (err as Error).message
    );
  }

  const limits = { maxLength: MAX_LEN, supportsMarkdown: false, supportsImages: true };

  return {
    name: 'twitter',
    limits,
    requiredSecrets: () => [...REQUIRED],

    async post(
      content: FormattedContent,
      secrets: Record<string, string | undefined>
    ): Promise<PostResult> {
      const text = truncate(content.text, MAX_LEN);

      if (isDryRun()) {
        return {
          platform: 'twitter',
          postId: `dryrun-${Date.now()}`,
          url: 'https://twitter.com/dry-run',
          postedAt: new Date().toISOString(),
          dryRun: true,
        };
      }

      const missing = REQUIRED.filter((k) => !secrets[k]);
      if (missing.length > 0) {
        throw new Error(`Twitter: missing required secrets: ${missing.join(', ')}`);
      }

      const client = new TwitterApi!({
        appKey: secrets['TWITTER_API_KEY']!,
        appSecret: secrets['TWITTER_API_SECRET']!,
        accessToken: secrets['TWITTER_ACCESS_TOKEN']!,
        accessSecret: secrets['TWITTER_ACCESS_SECRET']!,
      });

      const result = await client.v2.tweet(text);
      return {
        platform: 'twitter',
        postId: result.data.id,
        url: `https://twitter.com/i/web/status/${result.data.id}`,
        postedAt: new Date().toISOString(),
      };
    },
  };
}
