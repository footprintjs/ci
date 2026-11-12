// How the route's entry points print a line (bin/release-route.mjs, scripts/release-route.mjs,
// scripts/release-route-chart.mjs): to stdout, with the token masked if one ever reached a line.
//
// A stdout the reader closed (`why <record> | head -8`) ends the step quietly with exit 1. Node
// reports the failed write twice:
// - at once, as `stream.errored`: `print` then throws, so the step refuses BEFORE its end and
//   writes no output after the failure (report.mjs: nothing is written after a failed write);
// - a moment later, as the stream's 'error' event: with no listener Node prints a stack with the
//   runner's paths to stderr and exits; here the listener ends the process with exit 1 and says
//   nothing (there is no one left to read it).
// Built-in Node only: the plain script runs from a checkout with no install.
export function stdoutPrinter({ env = {}, stream = process.stdout, exit = (code) => process.exit(code) } = {}) {
  const secret = typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length >= 8 ? env.GITHUB_TOKEN : null;
  stream.on('error', () => exit(1));
  return (line) => {
    stream.write(`${secret ? line.split(secret).join('***') : line}\n`);
    if (stream.errored) throw new Error('stdout is closed');
  };
}
