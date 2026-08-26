# React Component Kit

Private React UI primitives and composition helpers shared by Benyiu applications.

## Install

Consumers use a versioned Git dependency:

```json
{
  "dependencies": {
    "@benyiu/react-component-kit": "git+ssh://git@github.com/benyiu/react-component-kit.git#v0.1.0"
  }
}
```

React and React DOM are peer dependencies. Consumers must provide React 19.2 or
newer and configure GitHub SSH access for automated builds.

## Public API

- `@benyiu/react-component-kit` exposes the dependency provider, observable
  store utilities, error boundary, and paged-list hook.
- `@benyiu/react-component-kit/react` exposes the React provider and store
  hooks without importing application services.
- `@benyiu/react-component-kit/lists` exposes `usePagedList`.
- `@benyiu/react-component-kit/styles.css` provides the component stylesheet.

Application-specific APIs, database schemas, Cloudflare Functions, CDD/EDD
workflows, and profile workspace/admin views remain in each consuming project.

## Validation

```sh
npm ci
npm test
npm run typecheck
npm run pack:check
```

Release only from a verified commit and tag releases as `vMAJOR.MINOR.PATCH`.
