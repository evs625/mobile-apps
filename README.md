# Mobile Apps Repository

A build-free repository for small, modern HTML applications that work on phones and can be published directly with GitHub Pages.

## Repository model

- `index.html` — catalog of available applications and usage instructions.
- `apps/<app-name>/` — one self-contained application per folder.
- `tests/` — dependency-free unit tests for reusable application logic.
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment workflow.
- `docs/PROJECT_CONVENTIONS.md` — rules for creating future applications.
- `CHATGPT_PROJECT_INSTRUCTIONS.md` — reusable instructions for this ChatGPT project.

## Included applications

- [Calculator](./apps/calculator/) — responsive, keyboard-accessible, installable PWA with offline support.
- [Particle System Lab](./apps/particle-system/) — configurable WebGL2 particle simulation with deterministic presets, persistent settings, and offline support.

## Ways to use an app

The repository publishes live web applications. The following are launch methods for the same code, not separate application versions:

1. **Regular browser page** — no installation; browser controls remain visible.
2. **Installed PWA** — launcher icon, standalone window, automatic web updates, and offline use after the first successful load.
3. **Lightweight web wrapper** — load the same GitHub Pages URL in Native Alpha or a similar wrapper to remove the normal browser interface without maintaining a separate APK.

## Android wrapper experiment

The earlier native Android WebView prototype remains under `android/calculator-wrapper/` for possible future investigation. It is currently archived and unsupported after an on-device startup crash was reported. No APK is built or published by this repository.

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
