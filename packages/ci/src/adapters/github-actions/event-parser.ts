import { readFileSync } from 'node:fs';
import type { Trigger, TriggerEvent } from '../types';

const EVENT_MAP: Record<string, TriggerEvent> = {
  push: 'push',
  pull_request: 'pull_request',
  schedule: 'schedule',
  workflow_dispatch: 'manual',
};

export interface ParseEventOptions {
  eventName: string;
  eventPath?: string | undefined;
  sha?: string | undefined;
  actor?: string | undefined;
  ref?: string | undefined;
}

export function parseEvent(opts: ParseEventOptions): Trigger {
  const payload: Record<string, unknown> = opts.eventPath
    ? safeRead(opts.eventPath)
    : {};

  const mapped = mapEvent(opts.eventName, payload);

  let ref = opts.ref;
  if (mapped === 'release.published') {
    const release = payload['release'] as
      | { tag_name?: string; body?: string }
      | undefined;
    ref = release?.tag_name ?? ref;
  } else if (ref && ref.startsWith('refs/tags/')) {
    ref = ref.slice('refs/tags/'.length);
  } else if (ref && ref.startsWith('refs/heads/')) {
    ref = ref.slice('refs/heads/'.length);
  }

  const trigger: Trigger = {
    event: mapped,
    payload,
  };
  if (ref !== undefined) trigger.ref = ref;
  if (opts.sha !== undefined) trigger.sha = opts.sha;
  if (opts.actor !== undefined) trigger.actor = opts.actor;
  return trigger;
}

function mapEvent(name: string, payload: Record<string, unknown>): TriggerEvent {
  if (name === 'release') {
    const action = payload['action'];
    if (action === 'published') return 'release.published';
    // treat other release actions as manual so they flow through but won't
    // match a typical 'release.published' trigger filter
    return 'manual';
  }
  return EVENT_MAP[name] ?? 'manual';
}

function safeRead(path: string): Record<string, unknown> {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
