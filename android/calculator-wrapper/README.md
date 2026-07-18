# Calculator Android WebView Wrapper — Archived Experiment

This directory contains the earlier native Android WebView prototype for the live calculator hosted at:

```text
https://evs625.github.io/mobile-apps/apps/calculator/
```

The prototype attempted to provide an immersive full-screen shell with no browser controls. An installed build crashed at startup during on-device testing, so the wrapper is currently **unsupported and not distributed**.

The source is retained only for possible future diagnosis. The repository no longer:

- builds this project in GitHub Actions;
- publishes an APK artifact;
- exposes an APK download through GitHub Pages; or
- presents the wrapper as a supported installation method.

For current use, open the calculator as a normal web page, install its PWA, or load the live URL in Native Alpha or another lightweight wrapper.

## Local investigation

A future investigation should reproduce the crash with Android logcat before changing or republishing the wrapper. The previous project expected JDK 17, Android SDK Platform 36, and Gradle 8.13:

```bash
gradle :app:assembleDebug
```

No compatibility or runtime guarantees are currently made for this project.
