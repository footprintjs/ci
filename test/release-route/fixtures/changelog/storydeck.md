# Changelog

## 0.13.1 — works beside footprintjs 12

- **The PowerPoint export works beside footprintjs 12.** footprintjs is an optional peer: StoryDeck needs it only to export a
  deck as a PowerPoint file. Its range is now `^11.0.0 || ^12.0.0`. Before this, npm refused `npm i footprintjs` beside
  StoryDeck as soon as footprintjs 12 was the newest version. The export's tests pass on footprintjs 11 and on the 12
  candidate. Nothing else changes.

## 0.13.0 — narrate: one command for a deck's voice

- **`storydeck narrate`: one command for a deck's voice.** It says what each click says and whether it is voiced, for nothing.
  With `--kit <folder>` it voices what is missing, and `--takes <folder>` uses your own recordings. `--only 1-3,7` picks a few
  clicks. The clips stay in the deck's `voice/cache`. `storydeck build --voice` then carries them in the page. A deck that
  doesn't ask builds byte for byte as before.
- **`narrate` as an MCP tool.** It only reads, unless the server was started with a voice and the call says what to voice with
  `say`. A call can't name a kit, and `build` over MCP never carries a voice.
- **A deck voiced by your own script:** run `storydeck narrate --kit <folder>` once. It finds the clips you have and voices only
  what is missing, and from then on `narrate` and `build --voice` find them with no voice named.
- **A clip cache from someone's folder is not trusted.** A link at a clip's name is never read into a page or written through,
  a link out of the deck at `voice/cache` is refused, and ffmpeg reads a clip's sound only as a WAV.

## 0.12.0 — a base look, callouts, and one page to read, scroll or click through

- **The deck as MCP tools, documented.** The README now shows an assistant's whole path over `outline`, `feedback`, `review`,
  `check` and `build`, and what to expect from them.
- **One page to read, scroll or click through.** `"lenses": true` in deck.json adds Read (an article) and Scroll (the picture
  stays while the words go by) to the built page, beside the slides, from the deck's own slides, headlines and notes.
  No site or React is needed. A link ending `#read` or `#scroll` opens that one. A deck in another language gives its own
  words. A deck that doesn't ask builds byte for byte as before.
- **A film or a PowerPoint no longer shows the theme toggle** (or the new switch) in its pictures.
- **Words pinned to a piece.** `<div data-k="why" data-callout="server above">Most of the wait is here</div>` puts a bubble
  beside the piece with a tail pointing at it, sized by its words and kept on the slide. It is a piece like any other,
  it follows its piece when the piece is moved, and `server+` in a click takes it in. Its look is yours to change in
  theme.css: `--callout-bg`, `--callout-fg`, `--callout-size`, `--callout-radius`, `--callout-lag`, or any rule for `.callout`
  and `.callout-tail`. `check` and `check --layout` warn about one shown without its piece, one that meets another or the
  headline, and a tail that no longer reaches its piece. The starter shows one. A deck with none builds byte for byte
  as before.
- **A ready-made look, so a deck starts finished.** `"look": "base"` in deck.json brings the tokens, light and dark, and
  the pieces a picture is made of: `box`, `chip`, `area`, `group`, `card` (with `.cards` for a row of them on a plain
