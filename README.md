# Calc

A fast, private, offline-ready responsive calculator built as a dependency-free web app.

## Highlights

- Exact decimal arithmetic for regular operations (`0.1 + 0.2 = 0.3`), with 12-significant-digit display formatting.
- Basic keypad with BODMAS/operator precedence, `%`, `±`, brackets, clear, and backspace.
- Scientific mode: trigonometry, degree/radian mode, log, ln, square root, powers, factorial, π, e, and memory registers.
- Persistent local calculation history (up to 50 entries), result copy, theme choice, responsive portrait/landscape layout, and keyboard support.
- No dependencies, no account, no tracking, no network calls. A service worker caches the application shell after the first visit for offline use.

## Run locally

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then visit [http://localhost:4173](http://localhost:4173).

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
