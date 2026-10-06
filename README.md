# Calc

A fast, private, offline-ready responsive calculator built as a dependency-free web app.

## Highlights

- Exact decimal arithmetic for regular operations (`0.1 + 0.2 = 0.3`), with 12-significant-digit display formatting.
- Basic keypad with BODMAS/operator precedence, `%`, `±`, brackets, clear, and backspace.
- Scientific mode: trigonometry, degree/radian mode, log, ln, square root, powers, factorial, π, e, and memory registers.
- Persistent local calculation history (up to 50 entries), result copy, theme choice, responsive portrait/landscape layout, and keyboard support.
- Voice-to-calculate input for supported browsers, with English, Hindi, and common Hinglish math phrases.
- No dependencies, no account, no tracking, no network calls from the calculator. A service worker caches the application shell after the first visit for offline use.

## Run locally

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then visit [http://localhost:4173](http://localhost:4173).

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
