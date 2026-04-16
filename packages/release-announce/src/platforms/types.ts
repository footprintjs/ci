export interface FormattedContent {
  text: string;
  url?: string;
  imageUrl?: string;
}

export interface PostResult {
  platform: string;
  postId: string;
  url: string;
  postedAt: string;
  dryRun?: boolean;
}

export interface PlatformLimits {
  maxLength?: number;
  supportsMarkdown: boolean;
  supportsImages: boolean;
}

export interface PlatformAdapter {
  readonly name: string;
  post(
    content: FormattedContent,
    secrets: Record<string, string | undefined>
  ): Promise<PostResult>;
  requiredSecrets(): string[];
  limits: PlatformLimits;
}

export type PlatformName = 'twitter' | 'linkedin' | 'devto';

export function isDryRun(env: Record<string, string | undefined> = process.env): boolean {
  const v = env['DRY_RUN'];
  if (!v) return false;
  return v === '1' || v.toLowerCase() === 'true';
}
