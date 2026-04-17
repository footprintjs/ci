import type { ParsedChangelog } from './changelog-parser.js';

export type TemplateName = 'default' | 'minimal' | 'long-form';

export interface TemplateInput {
  version: string;
  changelog: ParsedChangelog;
  repoUrl?: string;
  emojiPrefix?: string;
}

export interface TemplateOutput {
  /** Primary text (e.g. tweet / toot / post body). */
  text: string;
  /** Optional long-form markdown (used by dev.to, LinkedIn). */
  markdown?: string;
}

/**
 * Render a release announcement from parsed changelog input.
 */
export function renderTemplate(
  name: TemplateName,
  input: TemplateInput
): TemplateOutput {
  switch (name) {
    case 'minimal':
      return renderMinimal(input);
    case 'long-form':
      return renderLongForm(input);
    case 'default':
    default:
      return renderDefault(input);
  }
}

function renderDefault(input: TemplateInput): TemplateOutput {
  const { version, changelog, repoUrl, emojiPrefix } = input;
  const prefix = emojiPrefix ? `${emojiPrefix} ` : '🚀 ';
  const parts: string[] = [`${prefix}${version} is out!`];

  const headline = [
    topHighlight(changelog.features, '✨'),
    topHighlight(changelog.fixes, '🐛'),
    topHighlight(changelog.breaking, '💥'),
  ].filter(Boolean);

  if (headline.length > 0) {
    parts.push('', ...headline);
  }

  if (repoUrl) parts.push('', repoUrl);

  return { text: parts.join('\n') };
}

function renderMinimal(input: TemplateInput): TemplateOutput {
  const { version, repoUrl, emojiPrefix } = input;
  const prefix = emojiPrefix ?? '📦';
  return {
    text: repoUrl ? `${prefix} ${version} — ${repoUrl}` : `${prefix} ${version}`,
  };
}

function renderLongForm(input: TemplateInput): TemplateOutput {
  const { version, changelog, repoUrl } = input;
  const md: string[] = [`# ${version}`, ''];

  if (changelog.breaking.length > 0) {
    md.push('## 💥 Breaking changes', '');
    changelog.breaking.forEach((b) => md.push(`- ${b}`));
    md.push('');
  }
  if (changelog.features.length > 0) {
    md.push('## ✨ Features', '');
    changelog.features.forEach((f) => md.push(`- ${f}`));
    md.push('');
  }
  if (changelog.fixes.length > 0) {
    md.push('## 🐛 Fixes', '');
    changelog.fixes.forEach((f) => md.push(`- ${f}`));
    md.push('');
  }
  if (repoUrl) md.push('', `Full release notes: ${repoUrl}`);

  const markdown = md.join('\n');
  const text = `${version} is out! See the release notes for the full story.${repoUrl ? `\n${repoUrl}` : ''}`;
  return { text, markdown };
}

function topHighlight(items: string[], emoji: string): string {
  if (items.length === 0) return '';
  const first = items[0] ?? '';
  if (items.length === 1) return `${emoji} ${first}`;
  return `${emoji} ${first} (+${items.length - 1} more)`;
}

/**
 * Truncate `text` to `max` characters, preserving trailing URL if it fits.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const ellipsis = '…';
  return text.slice(0, max - ellipsis.length).trimEnd() + ellipsis;
}
