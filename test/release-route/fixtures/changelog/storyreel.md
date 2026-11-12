# Changelog

## 0.29.1 — one engine beside footprintjs 12

- **One engine in your app, on footprintjs 11.2 or 12.** StoryReel's `footprintjs` dependency is now `^11.2.0 || ^12.0.0`.
  With `^11.2.0` alone, an app on footprintjs 12 got a second, older engine installed under StoryReel. StoryReel's tests
  pass on footprintjs 12.0.0. Nothing else changes.

## 0.29.0 — a conversation to a checked storyboard, as a flowchart

- **A conversation to a checked storyboard, as a chart.** `storyFromConversation` from `footprint-storyreel/storyboard/story`
  reads a conversation (a file in the project, or messages), picks what matters window by window, chooses the shape in code,
  writes the board from the points and the messages they cite, checks it with the existing readers, and sends back one piece
  at a time, 3 rounds at the most. Each scene comes back `known`, `not-sure` or `ask`, and the asks are listed for you. The
  model is a port: `inProcess(fn)`, where `fn` answers a brief with JSON text. The run's record says why each choice was made,
  and holds no words of the conversation or of the model, and no message ids: counts, bytes, a hash, window offsets and
  message ordinals only. Refusals are fixed words, their own cause handed to you as `cause`. Not done yet: a disagreement
  between two windows is not found (the merge removes duplicates and marks disagreements within a window only), and a run
  picks from 200 windows at the most (a longer conversation is refused, naming the window that fits). No saving is
  claimed: no bench measures this yet.
- **footprintjs 11.2 and foottrace 1.14.** The range moves from `^9.27 || ^10` to `^11.2.0`, and foottrace to `^1.14.0`.

## 0.28.0 — create says what to fix, piece by piece

- **`storyreel create` says what to fix, piece by piece.** It still names every problem at once, now grouped by piece, each piece
  with what it says now and the messages it cites. With `--from`, change those pieces in the file and run `create` again, without
  rewriting the board. With `--story`, you still give the whole board again, because `create` takes no piece on its own. The
  refusal itself is longer than the old list, and stays short however big the board or the chat is. It needs `footprint-story`
  with `storyboardFixBriefs`. `node bench/storyboard-fix-bytes.mjs` measures what is said back, and says what it doesn't measure.
- **A problem a film finds names the place you wrote it.** `checked[0]`, not `checked-1`, and a brace names the field that holds
  it (`intro`, `closing`, `next[1]`), not the scene.

## 0.27.0 — narrate: one command for a film's voice

- **`storyreel narrate`: one command for a film's voice.** It says what each scene says and whether it is voiced, for nothing.
  With `--kit <folder>` it voices what is missing, and `--takes <folder>` uses your own recordings. `--only 1-2` picks a few
  scenes. Once every scene is voiced, it writes what a render reads, and the film is timed by the voice. A film stays silent
  until then. A folder holding a voice made another way is refused, so it is never overwritten.
- **`narrate` as an MCP tool.** It only reads, unless the server was started with a voice and the call says what to voice with
  `say`. A call can't name a kit, because a kit runs Python on your machine, and the voice reaches no other tool.
