// An append that lands whole or not at all.
//
// Why: the release route tells later jobs what to do through $GITHUB_OUTPUT, and GitHub keeps what
// a failed step left there. A plain append that fails part-way (a full disk, a quota) leaves a
// prefix behind; a prefix that stops just before the last newline still holds a whole
// `mode=publish` line, and the step exits 1 after it. So the append is undone when it fails: the
// file is cut back to the size it had before, and a step that exits 1 after a failed output write
// leaves the file exactly as it found it.
//
// How: open for append, read the size from THAT descriptor, write the whole buffer (a write may
// take fewer bytes than asked, so loop; a write that takes nothing is a failure, not a loop), and
// on ANY failure cut the file back to that size through the same descriptor and throw the FIRST
// error. If cutting back fails too, the first error is still the one thrown: what is left then
// needs two independent failures of the same file. The descriptor is closed in every case; a
// failing close is not reported: the bytes were already written or cut back, and a close that
// fails after a whole write can at worst lose them, which tells no later job to act.
//
// Example: appendWhole(env.GITHUB_OUTPUT, 'rule=publish\nmode=publish\n') either adds both lines
// or, when the write fails after 'rule=publish\nmode=publish', throws with the file as it was.
//
// `io` is the file system (node:fs unless a test hands in another), read at call time.
import fs from 'node:fs';

export function appendWhole(path, text, io = fs) {
  const bytes = Buffer.from(String(text), 'utf8');
  const fd = io.openSync(path, 'a');
  let size = null;
  try {
    size = io.fstatSync(fd).size;
    let done = 0;
    while (done < bytes.length) {
      const wrote = io.writeSync(fd, bytes, done, bytes.length - done);
      if (!(wrote > 0)) throw new Error('the write wrote nothing');
      done += wrote;
    }
  } catch (error) {
    if (size !== null) {
      try {
        io.ftruncateSync(fd, size);
      } catch {
        // The first error wins; the cut-back's own failure is not the cause.
      }
    }
    throw error;
  } finally {
    try {
      io.closeSync(fd);
    } catch {
      // Written or cut back already (see above).
    }
  }
}
