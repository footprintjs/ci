// Loaded with `node --import` by the tests that run a step in a child process (the committed bundle
// or the plain script): the child's fetch answers from the saved npm and GitHub answers of
// storydeck-today.mjs, and any other address fails the way a network error does. Nothing here
// reaches the network.
import { ROUTES } from '../storydeck-today.mjs';

globalThis.fetch = async (url) => {
  const route = Object.hasOwn(ROUTES, String(url)) ? ROUTES[String(url)] : null;
  if (!route) throw new TypeError('fetch failed');
  return route();
};
