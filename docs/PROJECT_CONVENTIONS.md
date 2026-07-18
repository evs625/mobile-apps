# Project Conventions

## Application boundary

Each directory in `apps/` is independently deployable and must not depend on files outside its own directory, except for an optional link back to the repository catalog.

## Required files

A typical installable application contains:

```text
apps/example/
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── service-worker.js
└── icons/
```

Logic that warrants unit testing should be placed in a separate JavaScript module.

## Compatibility

- Relative asset paths only.
- No server-side runtime required.
- No secrets in client code.
- Touch targets should normally be at least 44 × 44 CSS pixels.
- Interactive controls require accessible labels and visible focus states.
- Layouts must support narrow portrait screens and landscape orientation.

## Versioning and data

- Cache names in service workers should include an app-specific version.
- Local storage keys should be namespaced with the app slug.
- Data migrations must be explicit when stored formats change.

## Completion checks

An app is complete when:

- its primary flow works by touch and keyboard;
- JavaScript syntax checks pass;
- unit tests pass;
- every local asset reference resolves;
- it loads under a nested GitHub Pages path;
- its offline behavior is defined and tested where applicable.
