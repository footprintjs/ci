// Loaded with `node --import <this file>` (or NODE_OPTIONS=--import=...) in front of the REAL
// scripts/hold.mjs, so a test can run the command end to end with no network.
//   HOLD_STUB_STATUS  HTTP status to answer (default 200)
//   HOLD_STUB_BODY    the response body text (default "[]", an empty list of holds)
// Each request is echoed to stderr as `STUB-REQUEST <method> <url>`, never the headers,
// so a test can pin the fixed path and still prove the token is not printed.
globalThis.fetch = async (url, init = {}) => {
  process.stderr.write(`STUB-REQUEST ${init.method ?? 'GET'} ${url}\n`);
  return new Response(process.env.HOLD_STUB_BODY ?? '[]', { status: Number(process.env.HOLD_STUB_STATUS ?? 200) });
};
