// The tests read workflow and action files as TEXT (no YAML parser in this repository):
// these two helpers are the only places that know how a `run:` script is laid out.

// Text of every `run:` step script of a file: a block scalar (`run: |`) or a one-line value.
export function runBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)run:\s*(.*)$/);
    if (!match) continue;
    if (!/^[|>][+-]?$/.test(match[2])) { blocks.push(match[2]); continue; }
    const body = [];
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > match[1].length); j++) body.push(lines[j]);
    blocks.push(body.join('\n'));
  }
  return blocks;
}

// The same script with its indentation removed, ready to hand to bash.
export function dedent(block) {
  const indents = block.split('\n').filter((line) => line.trim() !== '').map((line) => line.search(/\S/));
  const cut = indents.length ? Math.min(...indents) : 0;
  return block.split('\n').map((line) => line.slice(cut)).join('\n');
}
