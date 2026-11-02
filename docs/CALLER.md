# Reusable shadow caller contract

No live Foottrace workflow is changed or installed by v1. This is the required format for a future separately reviewed caller.

The caller file remains `.github/workflows/publish.yml`. v1's dependency-free preflight accepts **canonical single-line JSON**, which is valid YAML, rather than parsing arbitrary YAML. It checks the exact `jobs.release.uses` pin and input pin from the caller file fetched at the actual event SHA before checking out any tool code. Duplicate keys, comments, extra jobs, secret forwarding, write permissions, wrong source expression and mismatched pins refuse. This narrow format is deliberate; existing YAML callers need a reviewed migration.

To generate an example outside a live repository:

```js
const sha = '<reviewed-full-40-character-ci-commit>';
const caller = {
  name: 'publish',
  on: { push: { branches: ['main'] }, workflow_dispatch: {} },
  permissions: { contents: 'read' },
  jobs: { release: {
    uses: `footprintjs/ci/.github/workflows/release.yml@${sha}`,
    with: { tool_sha: sha, source_sha: '${{ github.sha }}', mode: 'shadow' }
  } }
};
console.log(JSON.stringify(caller));
```

A syntactically valid 40-character input alone is insufficient. Both pins must match the reviewed immutable commit. The workflow accepts only the actual Foottrace `main` source SHA for push/manual events, uses a read-only GitHub token, and installs/executes no candidate code. It does not dispatch or enable itself. A shadow hold is not permission to run a publisher.
