/** Document formats admitted to source-reference analysis and Git text loading. */
export function referenceTextPath(path) {
  return /\.(?:md|mdx|markdown|rst|txt|adoc)$/i.test(path);
}
