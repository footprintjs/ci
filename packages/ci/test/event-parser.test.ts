import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/adapters/github-actions/event-parser';
import { join } from 'node:path';

const FIX_DIR = join(__dirname, 'fixtures');

describe('event-parser', () => {
  it('maps release:published → release.published and extracts tag_name', () => {
    const t = parseEvent({
      eventName: 'release',
      eventPath: join(FIX_DIR, 'release-event.json'),
      sha: 'abc',
      actor: 'user',
    });
    expect(t.event).toBe('release.published');
    expect(t.ref).toBe('v1.4.0');
    expect((t.payload?.['release'] as any).body).toContain('feature X');
  });

  it('maps push → push and strips refs/heads/ from ref', () => {
    const t = parseEvent({
      eventName: 'push',
      eventPath: join(FIX_DIR, 'push-event.json'),
      ref: 'refs/heads/main',
    });
    expect(t.event).toBe('push');
    expect(t.ref).toBe('main');
  });

  it('maps workflow_dispatch → manual', () => {
    const t = parseEvent({
      eventName: 'workflow_dispatch',
      eventPath: join(FIX_DIR, 'workflow-dispatch-event.json'),
      ref: 'refs/heads/main',
    });
    expect(t.event).toBe('manual');
  });

  it('maps schedule → schedule', () => {
    const t = parseEvent({ eventName: 'schedule' });
    expect(t.event).toBe('schedule');
  });

  it('handles missing event file gracefully', () => {
    const t = parseEvent({ eventName: 'push', eventPath: '/nonexistent' });
    expect(t.payload).toEqual({});
  });
});
