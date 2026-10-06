const assert = require('node:assert/strict');
const { evaluateExpression, formatRational, spokenToExpression } = require('../calculator.js');

function result(expression, angleMode = 'DEG') {
  return formatRational(evaluateExpression(expression, angleMode));
}

const cases = [
  ['2 + 3 × 4', '14'],
  ['(2 + 3) × 4', '20'],
  ['0.1 + 0.2', '0.3'],
  ['200 + 10%', '220'],
  ['200 - 10%', '180'],
  ['50 × 10%', '5'],
  ['√144', '12'],
  ['sqrt(81)', '9'],
  ['sin(30)', '0.5'],
  ['cos(60)', '0.5'],
  ['log(1000)', '3'],
  ['5!', '120'],
  ['2^3^2', '512'],
  ['2π', '6.28318530718']
];

for (const [expression, expected] of cases) {
  assert.equal(result(expression), expected, expression);
}
assert.equal(result('sin(1.5707963267948966)', 'RAD'), '1');
assert.throws(() => evaluateExpression('10 ÷ 0', 'DEG'), /Cannot divide by zero/);
assert.throws(() => evaluateExpression('(-1)!', 'DEG'), /Factorial needs/);

assert.equal(spokenToExpression('two hundred plus ten percent'), '200+10%');
assert.equal(spokenToExpression('one point five times four'), '1.5×4');
assert.equal(spokenToExpression('square root of one hundred forty four'), 'sqrt144');
assert.equal(spokenToExpression('दो सौ प्लस दस प्रतिशत'), '200+10%');
assert.equal(spokenToExpression('do sau plus das percent'), '200+10%');

console.log(`✓ ${cases.length + 8} calculator checks passed`);
