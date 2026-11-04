import { execFileSync } from 'node:child_process';

export function gitBytes(repo, args, input) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_ALLOW_PROTOCOL: '' });
  return execFileSync('git', ['--no-pager', '--no-optional-locks', '-c', 'core.fsmonitor=false',
    '-c', 'core.hooksPath=/dev/null', '-C', repo, ...args], {
    env, input, maxBuffer: 256 * 1024 * 1024, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
}
