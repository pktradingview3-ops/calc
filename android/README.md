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

## Privacy and offline behavior

- The calculator UI, expression parser, history, and memory are all packaged on-device.
- The app requests `RECORD_AUDIO` only when the microphone is used.
- Speech recognition availability can vary by device; some device-provided recognition services may require connectivity. The keypad and normal calculator functionality do not.
