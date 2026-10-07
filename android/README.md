# Calc for Android

This directory is a standalone Android Studio/Gradle project for the Calc app.

## Architecture

- **Native Android shell:** Kotlin `Activity`, Android runtime microphone permission, and `SpeechRecognizer`.
- **Local calculator UI:** the tested dependency-free calculator is bundled in `app/src/main/assets/www`; it never loads from a remote server.
- **Voice bridge:** the Android shell exposes only `AndroidVoice.start(locale)` and `AndroidVoice.stop()` to the local page. Speech results are sent back as text and parsed by the calculator's safe expression parser.

The bundled web assets keep the Android interface and browser version visually/functionally consistent while allowing the native Android `SpeechRecognizer` to provide reliable microphone input on Android 8+.

## Open and build

1. Open the **`android`** directory in Android Studio.
2. Let Gradle sync and install Android SDK Platform 35 if Android Studio prompts for it.
3. Run the `app` configuration on an Android 8.0 (API 26) or newer device/emulator.

From a terminal with JDK 17 and Android SDK 35 configured:

```bash
cd android
./gradlew assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Syncing calculator assets

After changing the root web calculator files, run this from the repository root before building Android:

```bash
./scripts/sync-android-assets.sh
```

## Security Test Mode (debug builds only)

The debug APK includes an explicit, consent-based testing surface for authorized Android
security assessments (e.g. OWASP MASVS-style reviews). Open it from the calculator's
**⋮ menu → Security Test Mode**.

### What it does

| Capability | How it works |
| --- | --- |
| Runtime camera permission | Requested only from this screen, after an on-screen rationale; denied by default |
| Camera capture | Manual shutter only — preview and a visible "Capture test photo" button |
| Review before sending | Every photo is shown on-screen first; nothing can be uploaded without a Send tap |
| Telegram bot test target | Sends the reviewed photo to `https://api.telegram.org/bot<token>/sendPhoto` for the tester-configured chat |
| HTTPS webhook target | Sends the reviewed photo to any tester-owned HTTPS endpoint (e.g. webhook.site) |
| Audit log | On-device (JSON lines) record of permission decisions, captures, and upload attempts |
| Data hygiene | One button deletes all captured photos + audit log; a chooser shares the log explicitly |

Nothing runs silently: there are no services, no scheduled work, no broadcast receivers,
no hidden windows — the module only executes when the tester presses buttons on the screen.

### Release safety

- All of this code lives in `app/src/debug/` and uses `debugImplementation` dependencies —
  the **release APK contains zero security-test code and no CAMERA permission**.
- The release source set ships a no-op `SecurityTestHooks`, so the web menu item is
  disabled outside debug builds.
- Tester credentials are never committed to source and never baked into release builds
  (release `BuildConfig` fields are empty strings).

### Configuring test targets

Three layers, in priority order:

1. **On-screen form** (stored locally on the device) — use *Clear stored credentials* to wipe.
2. Gradle properties in `android/local.properties` or `~/.gradle/gradle.properties`:
   `SECURITY_TEST_BOT_TOKEN=123:abc...`, `SECURITY_TEST_CHAT_ID=123456`,
   `SECURITY_TEST_WEBHOOK_URL=https://webhook.site/...`
3. Environment variables with the same names.

### Useful test scenarios

- Verify permission flows (grant, deny, "not now") and their audit-log entries.
- Confirm photos exist only in app-private storage (`files/security-test/captures/`) until send.
- Intercept/examine the exact outgoing payload with a webhook.site endpoint.
- Verify the release APK lacks the tooling: inspect the merged manifest — CAMERA is absent.

## Privacy and offline behavior

- The calculator UI, expression parser, history, and memory are all packaged on-device.
- The app requests `RECORD_AUDIO` only when the microphone is used.
- Speech recognition availability can vary by device; some device-provided recognition services may require connectivity. The keypad and normal calculator functionality do not.
