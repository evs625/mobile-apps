# Mobile Apps Repository

A build-free repository for small, modern HTML applications that work on phones and can be published directly with GitHub Pages.

## Repository model

- `index.html` — catalog of available applications.
- `apps/<app-name>/` — one self-contained application per folder.
- `tests/` — dependency-free unit tests for reusable application logic.
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment workflow.
- `docs/PROJECT_CONVENTIONS.md` — rules for creating future applications.
- `CHATGPT_PROJECT_INSTRUCTIONS.md` — reusable instructions for this ChatGPT project.

## Included test application

- [Calculator](./apps/calculator/) — responsive, keyboard-accessible, installable PWA with offline support.

## Run locally

Because service workers require HTTP rather than `file://`, run a local static server from the repository root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Run tests

Node.js 20 or newer is recommended.

```bash
npm test
```

No package installation is required.

## Publish with GitHub Pages

1. Create a GitHub repository and upload this repository's contents.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, select **GitHub Actions**.
4. Push to the `main` branch. The included workflow deploys the complete static site.

The catalog will be available at the repository's GitHub Pages URL, and every app will have its own shareable sub-URL.
