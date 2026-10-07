# Calc

A fast, private, offline-ready responsive calculator built as a dependency-free web app.

## Highlights

- Exact decimal arithmetic for regular operations (`0.1 + 0.2 = 0.3`), with 12-significant-digit display formatting.
- Basic keypad with BODMAS/operator precedence, `%`, `±`, brackets, clear, and backspace.
- Scientific mode: trigonometry, degree/radian mode, log, ln, square root, powers, factorial, π, e, and memory registers.
- Persistent local calculation history (up to 50 entries), result copy, theme choice, responsive portrait/landscape layout, and keyboard support.
- Voice-to-calculate input for supported browsers, with English, Hindi, and common Hinglish math phrases.
- No dependencies, no account, no tracking, no network calls from the calculator. A service worker caches the application shell after the first visit for offline use.

## Run locally (web)

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then visit [http://localhost:4173](http://localhost:4173).

## Android app

The repository now includes a native Android project in [`android/`](android/). It packages the calculator UI and safe calculation engine directly in the APK, provides a native microphone permission flow, and uses Android's `SpeechRecognizer` for voice calculations on Android 8+.

```bash
cd android
./gradlew assembleDebug
```

Open the `android` directory in Android Studio to run it on a device or emulator. See [`android/README.md`](android/README.md) for build prerequisites and asset-sync instructions. Before an Android build, run `./scripts/sync-android-assets.sh` whenever you change the root calculator web files.

Debug builds also ship an opt-in **Security Test Mode** (calculator ⋮ menu → Security Test Mode) for authorized app security testing: runtime camera permission with rationale, manual photo capture, on-screen review, tester-configured Telegram/webhook upload targets, and an on-device audit log. It is compiled out of release builds entirely — details in [`android/README.md`](android/README.md#security-test-mode-debug-builds-only).

## Voice calculations

Tap the microphone in the header, allow microphone access, and say a calculation. Use the compact `EN` / `हिं` button to select English or Hindi recognition. Examples: **“two hundred plus ten percent”**, **“square root of one hundred forty four”**, or **“दो सौ प्लस दस प्रतिशत”**. The recognized calculation is evaluated automatically.

Voice recognition relies on the browser/device speech service and may need a connection even though the calculator itself works offline. It is optional: all keypad and keyboard calculations remain fully offline after the app is cached.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `0`–`9`, `.` | Number input |
| `+`, `-`, `*`, `/`, `%`, `^` | Operators |
| `Enter` or `=` | Evaluate |
| `Esc` | Clear |
| `Backspace` | Delete last input |
| `(` / `)` | Brackets |

## Checks

The calculation engine can be exercised directly with Node:

```bash
node - <<'NODE'
const { evaluateExpression, formatRational } = require('./calculator.js');
console.log(formatRational(evaluateExpression('200 + 10%', 'DEG'))); // 220
NODE
```
