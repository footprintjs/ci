// A fetch double: answers from a table of URL -> Response factories, and records every call
// (URL, method, redirect mode, headers) so tests can see exactly what would leave the machine.
export function fakeFetch(routes) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, method: init.method, redirect: init.redirect, headers: { ...init.headers } });
    const route = routes[url];
    if (!route) throw new TypeError('fetch failed');
    return route();
  };
  return { fetcher, calls };
}
export const json = (value, status = 200) => () => new Response(typeof value === 'string' ? value : JSON.stringify(value), { status });
export const bytes = (buffer, status = 200) => () => new Response(buffer, { status });
