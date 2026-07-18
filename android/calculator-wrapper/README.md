# Calculator Android WebView Wrapper

A minimal native Android shell for the live calculator hosted at:

```text
https://evs625.github.io/mobile-apps/apps/calculator/
```

The wrapper provides:

- full-screen immersive display with no browser controls;
- a navigation allowlist restricted to the calculator URL;
- Android WebView caching plus the calculator's service-worker offline fallback;
- no JavaScript bridge, cookies, file access, location, or cleartext HTTP;
- an installable debug APK built by GitHub Actions.

## Build locally

Use JDK 17, Android SDK Platform 36, and Gradle 8.13:

```bash
gradle :app:assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Signing note

The automated build is a debug APK. It is suitable for direct sideloading. Because GitHub-hosted runners create a fresh debug signing key, a later native-wrapper rebuild may require uninstalling the previous APK first. Changes to the hosted HTML calculator do not require an APK rebuild.
