export function parseOptions(args) {
  if (!['report', 'affected'].includes(args[0])) throw new TypeError('Usage: structure report|affected --repo PATH [--head REF] [--base REF] [--format json|text]');
  const options = { command: args[0], repo: '.', head: 'HEAD', format: 'json' };
  const seen = new Set();
  for (let index = 1; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '');
    if (!args[index]?.startsWith('--') || !['repo', 'head', 'base', 'format'].includes(name)
      || seen.has(name) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new TypeError('Unknown, repeated or missing report option.');
    }
    options[name] = args[index + 1];
    seen.add(name);
  }
  if (!['json', 'text'].includes(options.format)) throw new TypeError('Report format must be json or text.');
  if (options.command === 'affected' && !options.base) throw new TypeError('Affected selection requires --base REF.');
  return options;
}
