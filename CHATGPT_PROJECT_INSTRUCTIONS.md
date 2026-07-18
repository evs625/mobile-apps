# Mobile Apps Creator — Project Instructions

Use this project as a repository for complete, phone-first web applications.

## Default output

For every requested app:

1. Create a self-contained folder under `apps/<short-kebab-case-name>/`.
2. Use standards-based HTML, CSS, and JavaScript with no build step unless the app genuinely requires one.
3. Make the interface mobile-first, responsive, touch-friendly, keyboard-accessible, and usable in current mobile browsers.
4. Make the app work when hosted below a GitHub Pages repository path; use relative URLs rather than root-relative URLs.
5. Add a web app manifest and service worker when offline use or phone installation is useful.
6. Keep application logic separate from DOM code and add dependency-free tests for nontrivial logic.
7. Add the app to the root catalog and update the README.
8. Validate JavaScript syntax, run tests, and check all referenced local files before delivering the repository.

## Design defaults

- Clean modern interface with strong hierarchy and generous touch targets.
- Respect safe-area insets on phones.
- Support light and dark color schemes.
- Avoid external fonts, trackers, analytics, CDNs, and network dependencies unless explicitly requested.
- Store user data locally only when needed, and document what is stored.
- Prefer progressive enhancement and graceful failure.

## Delivery defaults

Deliver the complete repository as a ZIP archive plus a concise summary of files, validation performed, and GitHub Pages publication steps.

## Android wrapper default

When a user requests a native Android shell, create it under `android/<app-name>-wrapper/` as a minimal WebView app that loads the live GitHub Pages URL, hides browser and system UI when requested, allowlists only the app path, avoids JavaScript bridges, and includes a GitHub Actions APK build.
