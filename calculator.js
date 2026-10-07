/* Calc: dependency-free expression parser and calculator UI. No eval is used. */
(function calculatorModule(global) {
  'use strict';

  class CalculationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CalculationError';
    }
  }

  function absolute(value) {
    return value < 0n ? -value : value;
  }

  function gcd(a, b) {
    a = absolute(a);
    b = absolute(b);
    while (b !== 0n) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a || 1n;
  }

  function powerOfTen(exponent) {
    if (exponent < 0 || exponent > 10000) throw new CalculationError('Number is too large');
    return 10n ** BigInt(exponent);
  }

  /** A reduced arbitrary-precision decimal fraction for basic arithmetic. */
  class Rational {
    constructor(numerator, denominator) {
      if (denominator === 0n) throw new CalculationError('Cannot divide by zero');
      if (denominator < 0n) {
        numerator = -numerator;
        denominator = -denominator;
      }
      if (numerator === 0n) {
        this.n = 0n;
        this.d = 1n;
        return;
      }
      const divisor = gcd(numerator, denominator);
      this.n = numerator / divisor;
      this.d = denominator / divisor;
    }

    static zero() { return new Rational(0n, 1n); }
    static one() { return new Rational(1n, 1n); }

    static fromString(value) {
      const text = String(value).trim();
      const match = text.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i);
      if (!match) throw new CalculationError('Invalid number');
      const negative = match[1] === '-';
      const whole = match[2] || '';
      const fractional = match[3] !== undefined ? match[3] : (match[4] || '');
      const digits = (whole || '0') + fractional;
      const exponent = match[5] ? Number(match[5]) : 0;
      if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000) throw new CalculationError('Number is too large');
      let numerator = BigInt(digits || '0');
      const decimalPlaces = fractional.length - exponent;
      let denominator = 1n;
      if (decimalPlaces >= 0) denominator = powerOfTen(decimalPlaces);
      else numerator *= powerOfTen(-decimalPlaces);
      if (negative) numerator = -numerator;
      return new Rational(numerator, denominator);
    }

    static fromNumber(number) {
      if (!Number.isFinite(number)) throw new CalculationError('Result is outside the supported range');
      // A precision cap keeps floating scientific results legible while exact arithmetic remains exact.
      const rounded = Math.abs(number) < 1e-14 ? 0 : Number(number.toPrecision(14));
      return Rational.fromString(String(rounded));
    }

    add(other) { return new Rational(this.n * other.d + other.n * this.d, this.d * other.d); }
    subtract(other) { return new Rational(this.n * other.d - other.n * this.d, this.d * other.d); }
    multiply(other) { return new Rational(this.n * other.n, this.d * other.d); }
    divide(other) {
      if (other.n === 0n) throw new CalculationError('Cannot divide by zero');
      return new Rational(this.n * other.d, this.d * other.n);
    }
    negate() { return new Rational(-this.n, this.d); }
    compareZero() { return this.n === 0n ? 0 : (this.n < 0n ? -1 : 1); }
    isInteger() { return this.d === 1n; }

    integerPower(exponent) {
      if (exponent === 0n) return Rational.one();
      if (exponent < 0n) {
        if (this.n === 0n) throw new CalculationError('Cannot divide by zero');
        return new Rational(this.d, this.n).integerPower(-exponent);
      }
      if (exponent > 10000n) throw new CalculationError('Exponent is too large');
      let base = this;
      let result = Rational.one();
      let remaining = exponent;
      while (remaining > 0n) {
        if (remaining % 2n === 1n) result = result.multiply(base);
        remaining /= 2n;
        if (remaining > 0n) base = base.multiply(base);
      }
      return result;
    }
  }

  function toFiniteNumber(value) {
    const result = Number(value.n) / Number(value.d);
    if (!Number.isFinite(result)) throw new CalculationError('Result is outside the supported range');
    return result;
  }

  function trimNumericText(text) {
    const sections = text.toLowerCase().split('e');
    let mantissa = sections[0];
    if (mantissa.includes('.')) mantissa = mantissa.replace(/0+$/, '').replace(/\.$/, '');
    if (mantissa === '-0') mantissa = '0';
    if (sections.length === 1) return mantissa;
    const exponent = Number(sections[1]);
    return `${mantissa}e${exponent >= 0 ? '+' : ''}${exponent}`;
  }

  function formatRational(value) {
    if (value.n === 0n) return '0';
    if (value.d === 1n) {
      const integer = value.n.toString();
      const unsigned = absolute(value.n).toString();
      if (unsigned.length > 15) {
        const leading = unsigned.slice(0, 12).replace(/0+$/, '');
        return `${value.n < 0n ? '-' : ''}${leading[0]}${leading.length > 1 ? `.${leading.slice(1)}` : ''}e+${unsigned.length - 1}`;
      }
      return integer;
    }

    const number = Number(value.n) / Number(value.d);
    if (Number.isFinite(number)) {
      const magnitude = Math.abs(number);
      if (magnitude === 0) return '0';
      if (magnitude >= 1e12 || magnitude < 1e-9) return trimNumericText(number.toExponential(11));
      return trimNumericText(number.toPrecision(12));
    }

    // Very large fractions are unusual, but remain readable without converting precision away.
    const nDigits = absolute(value.n).toString().length;
    const dDigits = value.d.toString().length;
    const exponent = nDigits - dDigits;
    return `${value.n < 0n ? '-' : ''}~1e${exponent >= 0 ? '+' : ''}${exponent}`;
  }

  function normalizeExpression(expression) {
    return expression
      .replace(/−/g, '-')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, 'pi')
      .replace(/√/g, 'sqrt');
  }

  function tokenize(expression) {
    const source = normalizeExpression(expression);
    const rawTokens = [];
    let index = 0;

    while (index < source.length) {
      const char = source[index];
      if (/\s/.test(char)) { index += 1; continue; }

      if (/\d/.test(char) || (char === '.' && /\d/.test(source[index + 1] || ''))) {
        const start = index;
        let sawDot = false;
        while (/\d/.test(source[index] || '') || (!sawDot && source[index] === '.')) {
          if (source[index] === '.') sawDot = true;
          index += 1;
        }
        if ((source[index] === 'e' || source[index] === 'E') && /[+\-\d]/.test(source[index + 1] || '')) {
          let exponentIndex = index + 1;
          if (source[exponentIndex] === '+' || source[exponentIndex] === '-') exponentIndex += 1;
          const exponentStart = exponentIndex;
          while (/\d/.test(source[exponentIndex] || '')) exponentIndex += 1;
          if (exponentIndex > exponentStart) index = exponentIndex;
        }
        rawTokens.push({ type: 'number', value: source.slice(start, index) });
        continue;
      }

      if ('+-*/^'.includes(char)) {
        rawTokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }
      if (char === '(') { rawTokens.push({ type: 'lparen', value: char }); index += 1; continue; }
      if (char === ')') { rawTokens.push({ type: 'rparen', value: char }); index += 1; continue; }
      if (char === '%' || char === '!') { rawTokens.push({ type: 'postfix', value: char }); index += 1; continue; }

      if (/[a-z]/i.test(char)) {
        const start = index;
        while (/[a-z]/i.test(source[index] || '')) index += 1;
        const word = source.slice(start, index).toLowerCase();
        if (word === 'pi' || word === 'e') rawTokens.push({ type: 'constant', value: word });
        else if (['sin', 'cos', 'tan', 'log', 'ln', 'sqrt'].includes(word)) rawTokens.push({ type: 'function', value: word });
        else throw new CalculationError(`Unknown function: ${word}`);
        continue;
      }
      throw new CalculationError('Invalid character in expression');
    }

    const tokens = [];
    const endsOperand = (token) => ['number', 'constant', 'rparen', 'postfix'].includes(token.type);
    const startsOperand = (token) => ['number', 'constant', 'function', 'lparen'].includes(token.type);
    rawTokens.forEach((token) => {
      const previous = tokens[tokens.length - 1];
      if (previous && endsOperand(previous) && startsOperand(token)) tokens.push({ type: 'operator', value: '*' });
      tokens.push(token);
    });
    tokens.push({ type: 'end', value: '' });
    return tokens;
  }

  class ExpressionParser {
    constructor(expression, angleMode) {
      this.tokens = tokenize(expression);
      this.position = 0;
      this.angleMode = angleMode || 'DEG';
    }

    current() { return this.tokens[this.position]; }
    consume() { const token = this.current(); this.position += 1; return token; }

    evaluate() {
      if (this.current().type === 'end') throw new CalculationError('Enter a calculation');
      const result = this.parseAddition();
      if (this.current().type !== 'end') throw new CalculationError('Check the expression');
      return result.value;
    }

    parseAddition() {
      let left = this.parseMultiplication();
      while (this.current().type === 'operator' && ['+', '-'].includes(this.current().value)) {
        const operation = this.consume().value;
        const right = this.parseMultiplication();
        if (right.percent) {
          const relative = left.value.multiply(right.value);
          left = { value: operation === '+' ? left.value.add(relative) : left.value.subtract(relative), percent: false };
        } else {
          left = { value: operation === '+' ? left.value.add(right.value) : left.value.subtract(right.value), percent: false };
        }
      }
      return left;
    }

    parseMultiplication() {
      let left = this.parseUnary();
      while (this.current().type === 'operator' && ['*', '/'].includes(this.current().value)) {
        const operation = this.consume().value;
        const right = this.parseUnary();
        left = { value: operation === '*' ? left.value.multiply(right.value) : left.value.divide(right.value), percent: false };
      }
      return left;
    }

    parseUnary() {
      if (this.current().type === 'operator' && ['+', '-'].includes(this.current().value)) {
        const operation = this.consume().value;
        const next = this.parseUnary();
        return { value: operation === '-' ? next.value.negate() : next.value, percent: next.percent };
      }
      return this.parsePower();
    }

    parsePower() {
      let base = this.parsePostfix();
      if (this.current().type === 'operator' && this.current().value === '^') {
        this.consume();
        const exponent = this.parseUnary();
        base = { value: power(base.value, exponent.value), percent: false };
      }
      return base;
    }

    parsePostfix() {
      let output = this.parsePrimary();
      while (this.current().type === 'postfix') {
        const operation = this.consume().value;
        if (operation === '%') output = { value: output.value.divide(new Rational(100n, 1n)), percent: true };
        else output = { value: factorial(output.value), percent: false };
      }
      return output;
    }

    parsePrimary() {
      const token = this.current();
      if (token.type === 'number') {
        this.consume();
        return { value: Rational.fromString(token.value), percent: false };
      }
      if (token.type === 'constant') {
        this.consume();
        return { value: Rational.fromNumber(token.value === 'pi' ? Math.PI : Math.E), percent: false };
      }
      if (token.type === 'function') {
        const functionName = this.consume().value;
        let input;
        if (this.current().type === 'lparen') {
          this.consume();
          input = this.parseAddition();
          if (this.current().type !== 'rparen') throw new CalculationError('Missing closing bracket');
          this.consume();
        } else {
          // Natural spoken notation such as "sin 30" and "√144" uses the next value only.
          // Keypad entry still uses the more explicit sin(30) form.
          input = this.parsePostfix();
        }
        return { value: applyFunction(functionName, input.value, this.angleMode), percent: false };
      }
      if (token.type === 'lparen') {
        this.consume();
        const result = this.parseAddition();
        if (this.current().type !== 'rparen') throw new CalculationError('Missing closing bracket');
        this.consume();
        return result;
      }
      throw new CalculationError('Check the expression');
    }
  }

  function power(base, exponent) {
    if (exponent.isInteger()) return base.integerPower(exponent.n);
    const baseNumber = toFiniteNumber(base);
    const exponentNumber = toFiniteNumber(exponent);
    if (baseNumber < 0) throw new CalculationError('Fractional powers need a positive base');
    return Rational.fromNumber(Math.pow(baseNumber, exponentNumber));
  }

  function factorial(value) {
    if (!value.isInteger() || value.n < 0n) throw new CalculationError('Factorial needs a whole positive number');
    if (value.n > 170n) throw new CalculationError('Factorial is limited to 170');
    let output = 1n;
    for (let i = 2n; i <= value.n; i += 1n) output *= i;
    return new Rational(output, 1n);
  }

  function applyFunction(name, value, angleMode) {
    const input = toFiniteNumber(value);
    let output;
    if (name === 'sqrt') {
      if (input < 0) throw new CalculationError('Square root needs a positive number');
      output = Math.sqrt(input);
    } else if (name === 'ln') {
      if (input <= 0) throw new CalculationError('ln needs a positive number');
      output = Math.log(input);
    } else if (name === 'log') {
      if (input <= 0) throw new CalculationError('log needs a positive number');
      output = Math.log10(input);
    } else {
      const radians = angleMode === 'DEG' ? input * Math.PI / 180 : input;
      if (name === 'sin') output = Math.sin(radians);
      if (name === 'cos') output = Math.cos(radians);
      if (name === 'tan') {
        if (Math.abs(Math.cos(radians)) < 1e-12) throw new CalculationError('tan is undefined at this angle');
        output = Math.tan(radians);
      }
    }
    if (Math.abs(output) < 1e-13) output = 0;
    return Rational.fromNumber(output);
  }

  function evaluateExpression(expression, angleMode) {
    return new ExpressionParser(expression, angleMode).evaluate();
  }

  const NUMBER_WORDS = {
    zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90,
    'शून्य': 0, 'जीरो': 0, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6,
    'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15,
    'पन्द्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20, 'तीस': 30, 'चालीस': 40,
    'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90,
    ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, cheh: 6, chhe: 6, saat: 7, aath: 8, nau: 9,
    das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17,
    atharah: 18, unnis: 19, bees: 20, tees: 30, chalis: 40, pachaas: 50, saath: 60, sattar: 70,
    assi: 80, nabbe: 90
  };

  const NUMBER_SCALES = {
    hundred: 100, thousand: 1000, million: 1000000,
    'सौ': 100, 'हजार': 1000, 'लाख': 100000, 'करोड़': 10000000,
    sau: 100, hazaar: 1000, lakh: 100000, crore: 10000000
  };

  function isNumberWord(word) {
    return Object.prototype.hasOwnProperty.call(NUMBER_WORDS, word)
      || Object.prototype.hasOwnProperty.call(NUMBER_SCALES, word)
      || word === 'point';
  }

  function numberPhraseToDigits(words) {
    let total = 0;
    let current = 0;
    let fractional = '';
    let decimalMode = false;
    words.forEach((word) => {
      if (word === 'point') {
        decimalMode = true;
        return;
      }
      const value = NUMBER_WORDS[word];
      if (decimalMode) {
        // Spoken decimals are normally digit by digit: "one point zero five".
        fractional += String(value);
        return;
      }
      if (value !== undefined) {
        current += value;
        return;
      }
      const scale = NUMBER_SCALES[word];
      if (scale === 100) current = (current || 1) * scale;
      else {
        total += (current || 1) * scale;
        current = 0;
      }
    });
    const integer = total + current;
    return `${integer}${decimalMode ? `.${fractional || '0'}` : ''}`;
  }

  /**
   * Turns a small, purposeful spoken-math vocabulary into the same safe expression
   * string used by the keypad. Supports English, Hindi and common Hinglish number words.
   */
  function spokenToExpression(transcript) {
    if (!transcript || !String(transcript).trim()) throw new CalculationError('I did not hear a calculation');
    let spoken = String(transcript).toLowerCase().trim()
      .replace(/,/g, ' ')
      .replace(/[?!]/g, ' ')
      .replace(/[–—]/g, '-')
      .replace(/([()+\-*/^%])/g, ' $1 ');

    const phrases = [
      [/raised to (?:the )?power of|to the power of|power of/g, ' ^ '],
      [/divided by|divide by|over/g, ' ÷ '],
      [/multiplied by|multiply by|times|into/g, ' × '],
      [/square root of|square root|root of/g, ' sqrt '],
      [/natural logarithm of|natural log of|ln of/g, ' ln '],
      [/logarithm of|log of/g, ' log '],
      [/cosine of|cos of|cosine/g, ' cos '],
      [/sine of|sin of|sine/g, ' sin '],
      [/tangent of|tan of|tangent/g, ' tan '],
      [/squared/g, ' ^ 2 '],
      [/cubed/g, ' ^ 3 '],
      [/factorial/g, ' ! '],
      [/open (?:parenthesis|bracket)/g, ' ( '],
      [/close (?:parenthesis|bracket)/g, ' ) '],
      [/percentage|percent/g, ' % '],
      [/negative/g, ' − '],
      [/plus|add/g, ' + '],
      [/minus|subtract/g, ' − '],
      [/equals?|calculate|what is|what's|please/g, ' '],
      [/से\s*भाग|भाग\s*दे|भाग/g, ' ÷ '],
      [/गुणा|गुना|इंटू|बार/g, ' × '],
      [/वर्ग\s*मूल|वर्गमूल|रूट/g, ' sqrt '],
      [/प्राकृतिक\s*लघुगणक|एल\s*एन/g, ' ln '],
      [/लघुगणक|लॉग/g, ' log '],
      [/कोसाइन/g, ' cos '],
      [/साइन/g, ' sin '],
      [/टैन्जेंट|टैन/g, ' tan '],
      [/खुला\s*(?:ब्रैकेट|कोष्ठक)/g, ' ( '],
      [/बंद\s*(?:ब्रैकेट|कोष्ठक)/g, ' ) '],
      [/प्रतिशत|परसेंट/g, ' % '],
      [/दशमलव|पॉइंट/g, ' point '],
      [/ऋण/g, ' − '],
      [/जोड़|जोड|प्लस/g, ' + '],
      [/माइनस|घटाना/g, ' − '],
      [/पाई/g, ' π ']
    ];
    phrases.forEach(([pattern, replacement]) => { spoken = spoken.replace(pattern, replacement); });

    const ignored = new Set(['and', 'the', 'a', 'an', 'of', 'by', 'का', 'की', 'के']);
    const allowed = new Set(['+', '−', '×', '÷', '^', '%', '!', '(', ')', 'pi', 'π', 'e', 'sin', 'cos', 'tan', 'sqrt', 'ln', 'log']);
    const tokens = spoken.trim().split(/\s+/).filter(Boolean).filter((word) => !ignored.has(word));
    const output = [];

    for (let index = 0; index < tokens.length;) {
      const token = tokens[index];
      if (isNumberWord(token)) {
        const numberWords = [];
        while (index < tokens.length && isNumberWord(tokens[index])) {
          numberWords.push(tokens[index]);
          index += 1;
        }
        output.push(numberPhraseToDigits(numberWords));
        continue;
      }
      if (/^\d+(?:\.\d+)?$/.test(token) || allowed.has(token)) {
        output.push(token === 'pi' ? 'π' : token);
        index += 1;
        continue;
      }
      throw new CalculationError(`I couldn't use “${token}”`);
    }

    const expression = output.join('');
    if (!expression || !/[\dπe]/.test(expression)) throw new CalculationError('Say a calculation, for example two plus two');
    return expression;
  }

  const Core = { Rational, CalculationError, evaluateExpression, formatRational, spokenToExpression };
  global.CalculatorCore = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;

  if (typeof document === 'undefined') return;

  const $ = (selector) => document.querySelector(selector);
  const expressionOutput = $('#expression');
  const resultOutput = $('#result');
  const panel = $('#scientificPanel');
  const basicButton = $('#basicMode');
  const scientificButton = $('#scientificMode');
  const angleButton = $('#angleMode');
  const memoryIndicator = $('#memoryIndicator');
  const historyPanel = $('#historyPanel');
  const historyList = $('#historyList');
  const historyCount = $('#historyCount');
  const scrim = $('#scrim');
  const toast = $('#toast');
  const voiceButton = $('#voiceButton');
  const voiceLanguageButton = $('#voiceLanguage');
  const voiceStatus = $('#voiceStatus');
  const voiceStatusText = $('#voiceStatusText');

  const store = {
    get(key, fallback) {
      try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (_) { /* Private browsing can disable storage. */ }
    }
  };

  class CalculatorApp {
    constructor() {
      this.expression = '';
      this.lastResult = '0';
      this.justEvaluated = false;
      this.mode = store.get('calc-mode', 'basic') === 'scientific' ? 'scientific' : 'basic';
      this.angleMode = store.get('calc-angle-mode', 'DEG') === 'RAD' ? 'RAD' : 'DEG';
      this.voiceLocale = store.get('calc-voice-locale', 'en-IN') === 'hi-IN' ? 'hi-IN' : 'en-IN';
      this.isListening = false;
      this.speechRecognition = null;
      this.voiceStatusTimeout = null;
      this.memory = this.loadMemory();
      this.history = this.loadHistory();
      this.toastTimeout = null;
      this.setMode(this.mode, false);
      this.setAngleMode(this.angleMode, false);
      this.setVoiceLocale(this.voiceLocale, false);
      this.applyTheme(store.get('calc-theme', this.systemPrefersLight() ? 'light' : 'dark'), false);
      this.renderHistory();
      this.updateMemoryIndicator();
      this.render();
      this.bindEvents();
    }

    systemPrefersLight() {
      return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
    }

    loadMemory() {
      try { return Rational.fromString(store.get('calc-memory', '0')); } catch (_) { return Rational.zero(); }
    }

    loadHistory() {
      try {
        const data = JSON.parse(store.get('calc-history', '[]'));
        return Array.isArray(data) ? data.filter((item) => item && typeof item.expression === 'string' && typeof item.result === 'string').slice(0, 50) : [];
      } catch (_) { return []; }
    }

    bindEvents() {
      document.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', () => this.handleAction(button.dataset.action, button.dataset.value));
      });
      $('#backspace').addEventListener('click', () => this.backspace());
      $('#copyButton').addEventListener('click', () => this.copyResult());
      basicButton.addEventListener('click', () => this.setMode('basic'));
      scientificButton.addEventListener('click', () => this.setMode('scientific'));
      angleButton.addEventListener('click', () => this.setAngleMode(this.angleMode === 'DEG' ? 'RAD' : 'DEG'));
      $('#themeButton').addEventListener('click', () => this.applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
      voiceButton.addEventListener('click', () => this.toggleVoiceRecognition());
      voiceLanguageButton.addEventListener('click', () => this.setVoiceLocale(this.voiceLocale === 'en-IN' ? 'hi-IN' : 'en-IN'));
      $('#historyButton').addEventListener('click', () => this.openHistory());
      $('#closeHistory').addEventListener('click', () => this.closeHistory());
      $('#clearHistory').addEventListener('click', () => this.clearHistory());
      scrim.addEventListener('click', () => this.closeHistory());
      document.addEventListener('keydown', (event) => this.handleKeyboard(event));
      // Android's native SpeechRecognizer delivers results through this intentionally small bridge.
      window.onNativeVoiceEvent = (event, value) => this.handleNativeVoiceEvent(event, value);
      this.setupAppMenu();
    }

    hasNativeVoiceBridge() {
      return Boolean(window.AndroidVoice && typeof window.AndroidVoice.start === 'function');
    }

    hasSecurityTestBridge() {
      return Boolean(window.AndroidSecurityTest && typeof window.AndroidSecurityTest.open === 'function');
    }

    setupAppMenu() {
      const menuButton = $('#menuButton');
      const menu = $('#appMenu');
      const item = $('#securityTestMenuItem');
      const subtitle = $('#securityTestMenuSub');
      if (!menuButton || !menu || !item || !subtitle) return;

      const available = this.hasSecurityTestBridge();
      item.disabled = !available;
      subtitle.textContent = available
        ? 'Debug build · opens the consent-based testing screen'
        : 'Android debug builds only';

      menuButton.addEventListener('click', () => this.toggleAppMenu());
      item.addEventListener('click', () => {
        this.closeAppMenu();
        if (item.disabled) return;
        try {
          window.AndroidSecurityTest.open();
        } catch (_) {
          this.showToast('Security test tools are unavailable');
        }
      });
      document.addEventListener('click', (event) => {
        if (!menu.hidden && !event.target.closest('#menuWrap')) this.closeAppMenu();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) {
          this.closeAppMenu();
          menuButton.focus();
        }
      });
    }

    toggleAppMenu() {
      const menuButton = $('#menuButton');
      const menu = $('#appMenu');
      if (!menuButton || !menu) return;
      const opening = menu.hidden;
      menu.hidden = !opening;
      menuButton.setAttribute('aria-expanded', String(opening));
      if (opening) {
        const focusable = menu.querySelector('button:not(:disabled)');
        if (focusable) focusable.focus();
      }
    }

    closeAppMenu() {
      const menuButton = $('#menuButton');
      const menu = $('#appMenu');
      if (!menuButton || !menu || menu.hidden) return;
      menu.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
    }

    setMode(mode, persist = true) {
      this.mode = mode;
      const scientific = mode === 'scientific';
      panel.hidden = !scientific;
      basicButton.classList.toggle('is-active', !scientific);
      basicButton.setAttribute('aria-pressed', String(!scientific));
      scientificButton.classList.toggle('is-active', scientific);
      scientificButton.setAttribute('aria-pressed', String(scientific));
      if (persist) store.set('calc-mode', mode);
    }

    setAngleMode(mode, persist = true) {
      this.angleMode = mode;
      angleButton.textContent = mode;
      angleButton.setAttribute('aria-label', `Use ${mode === 'DEG' ? 'radians' : 'degrees'} for trigonometry`);
      if (persist) {
        store.set('calc-angle-mode', mode);
        this.updatePreview();
      }
    }

    setVoiceLocale(locale, persist = true) {
      this.voiceLocale = locale === 'hi-IN' ? 'hi-IN' : 'en-IN';
      const isHindi = this.voiceLocale === 'hi-IN';
      voiceLanguageButton.textContent = isHindi ? 'हिं' : 'EN';
      voiceLanguageButton.setAttribute('aria-label', `Voice recognition language: ${isHindi ? 'Hindi' : 'English'}. Switch language`);
      voiceLanguageButton.title = `Voice language: ${isHindi ? 'Hindi' : 'English'}`;
      if (persist) {
        store.set('calc-voice-locale', this.voiceLocale);
        this.showToast(`Voice language: ${isHindi ? 'Hindi' : 'English'}`);
      }
    }

    setVoiceStatus(message, visible = true) {
      clearTimeout(this.voiceStatusTimeout);
      voiceStatusText.textContent = message;
      voiceStatus.hidden = !visible;
      if (visible && !this.isListening) {
        this.voiceStatusTimeout = setTimeout(() => { voiceStatus.hidden = true; }, 3400);
      }
    }

    setListening(listening) {
      this.isListening = listening;
      voiceButton.classList.toggle('is-listening', listening);
      voiceButton.setAttribute('aria-label', listening ? 'Stop voice calculation' : 'Start voice calculation');
      voiceButton.title = listening ? 'Stop listening' : 'Speak a calculation';
    }

    finishVoiceSession() {
      this.setListening(false);
      this.speechRecognition = null;
      if (!voiceStatus.hidden) {
        clearTimeout(this.voiceStatusTimeout);
        this.voiceStatusTimeout = setTimeout(() => { voiceStatus.hidden = true; }, 3400);
      }
    }

    handleNativeVoiceEvent(event, value) {
      if (event === 'ready') {
        this.setListening(true);
        this.setVoiceStatus(`Listening in ${this.voiceLocale === 'hi-IN' ? 'Hindi' : 'English'}… say “two hundred plus ten percent”`, true);
      } else if (event === 'result') {
        this.useVoiceTranscript(value);
      } else if (event === 'error') {
        this.setVoiceStatus(value || 'Voice input could not be completed.', true);
        this.showToast(value || 'Voice input could not be completed.');
      } else if (event === 'end') {
        this.finishVoiceSession();
      }
    }

    toggleVoiceRecognition() {
      if (this.hasNativeVoiceBridge()) {
        if (this.isListening) {
          window.AndroidVoice.stop();
          return;
        }
        this.setListening(true);
        this.setVoiceStatus('Preparing microphone…', true);
        try {
          window.AndroidVoice.start(this.voiceLocale);
        } catch (_) {
          this.finishVoiceSession();
          this.setVoiceStatus('Voice input could not be started.', true);
        }
        return;
      }

      if (this.isListening && this.speechRecognition) {
        this.speechRecognition.stop();
        return;
      }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.setVoiceStatus('Voice input is not supported by this browser. Try Chrome on Android or desktop.', true);
        this.showToast('Voice input is unavailable in this browser');
        return;
      }

      const recognition = new SpeechRecognition();
      this.speechRecognition = recognition;
      recognition.lang = this.voiceLocale;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        this.setListening(true);
        this.setVoiceStatus(`Listening in ${this.voiceLocale === 'hi-IN' ? 'Hindi' : 'English'}… say “two hundred plus ten percent”`, true);
      };
      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index][0].transcript;
          if (event.results[index].isFinal) finalTranscript += transcript;
          else interimTranscript += transcript;
        }
        if (interimTranscript) this.setVoiceStatus(`Listening… “${interimTranscript.trim()}”`, true);
        if (finalTranscript) this.useVoiceTranscript(finalTranscript.trim());
      };
      recognition.onerror = (event) => {
        const messages = {
          'not-allowed': 'Microphone permission was not granted.',
          'service-not-allowed': 'Voice service is not available.',
          'no-speech': 'No speech detected. Please try again.',
          'audio-capture': 'No microphone was found.'
        };
        const message = messages[event.error] || 'Voice input could not be completed.';
        this.setVoiceStatus(message, true);
        this.showToast(message);
      };
      recognition.onend = () => this.finishVoiceSession();
      try {
        recognition.start();
      } catch (_) {
        this.finishVoiceSession();
        this.showToast('Voice input is already starting. Please try again.');
      }
    }

    useVoiceTranscript(transcript) {
      try {
        const expression = spokenToExpression(transcript);
        if ((expression.match(/\d/g) || []).length > 30) throw new CalculationError('Voice input is limited to 30 digits');
        this.expression = expression;
        this.justEvaluated = false;
        this.updatePreview();
        this.equals();
        const isError = resultOutput.classList.contains('is-error');
        if (isError) this.setVoiceStatus(`Heard “${transcript}”. Check the expression shown above.`, true);
        else {
          this.setVoiceStatus(`Heard “${transcript}” · ${expression} = ${this.lastResult}`, true);
          this.showToast('Voice calculation complete');
        }
      } catch (error) {
        const message = error instanceof CalculationError ? error.message : 'Voice calculation could not be read';
        this.setVoiceStatus(message, true);
        this.showToast(message);
      }
    }

    applyTheme(theme, persist = true) {
      const actualTheme = theme === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = actualTheme;
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.content = actualTheme === 'light' ? '#eef1f5' : '#10121a';
      $('#themeButton').setAttribute('aria-label', `Switch to ${actualTheme === 'dark' ? 'light' : 'dark'} theme`);
      $('#themeButton').querySelector('.theme-icon').textContent = actualTheme === 'dark' ? '☼' : '☾';
      if (persist) store.set('calc-theme', actualTheme);
    }

    render() {
      const shownExpression = this.expression || '0';
      expressionOutput.textContent = shownExpression;
      expressionOutput.title = shownExpression;
      resultOutput.textContent = this.lastResult;
      resultOutput.title = this.lastResult;
      resultOutput.classList.toggle('is-error', this.lastResult !== '—' && /^(Cannot|Check|Missing|Invalid|Enter|Unknown|Add|Factorial|Square|Fractional|ln|log|tan|Result)/.test(this.lastResult));
      resultOutput.classList.toggle('is-long', this.lastResult.length > 14);
      requestAnimationFrame(() => {
        expressionOutput.scrollLeft = expressionOutput.scrollWidth;
        resultOutput.scrollLeft = resultOutput.scrollWidth;
      });
    }

    updatePreview() {
      if (!this.expression || this.expression === '−') {
        this.lastResult = '0';
        this.render();
        return;
      }
      try {
        this.lastResult = formatRational(evaluateExpression(this.expression, this.angleMode));
      } catch (error) {
        const message = error instanceof CalculationError ? error.message : 'Check the expression';
        this.lastResult = /divide by zero|undefined/.test(message.toLowerCase()) ? message : '—';
      }
      this.render();
    }

    handleAction(action, value) {
      if (action === 'number') this.appendNumber(value);
      else if (action === 'decimal') this.appendDecimal();
      else if (action === 'operator') this.appendOperator(value);
      else if (action === 'clear') this.clear();
      else if (action === 'equals') this.equals();
      else if (action === 'brackets') this.appendBrackets();
      else if (action === 'percent') this.appendPostfix('%');
      else if (action === 'factorial') this.appendPostfix('!');
      else if (action === 'sign') this.toggleSign();
      else if (action === 'function') this.appendFunction(value);
      else if (action === 'constant') this.appendConstant(value);
      else if (action === 'square') this.appendSquare();
      else if (action === 'power') this.appendPower();
      else if (action.startsWith('memory-')) this.handleMemory(action);
    }

    prepareForInput(continuation = false) {
      if (!this.justEvaluated) return;
      this.expression = continuation ? this.lastResult : '';
      this.justEvaluated = false;
    }

    canAddDigits(amount = 1) {
      const count = (this.expression.match(/\d/g) || []).length;
      if (count + amount > 30) {
        this.showToast('Maximum input is 30 digits');
        return false;
      }
      return true;
    }

    endsWithOperand() {
      return /[\dπe)%!]$/.test(this.expression);
    }

    appendNumber(number) {
      this.prepareForInput(false);
      if (!this.canAddDigits()) return;
      if (this.endsWithOperand() && !/\d$/.test(this.expression)) this.expression += '×';
      this.expression += number;
      this.updatePreview();
    }

    appendDecimal() {
      this.prepareForInput(false);
      if (!this.canAddDigits()) return;
      if (!this.expression) this.expression = '0.';
      else if (/\d$/.test(this.expression)) {
        const currentNumber = this.expression.match(/(\d*\.?\d*)$/);
        if (currentNumber && currentNumber[0].includes('.')) return;
        this.expression += '.';
      } else if (this.endsWithOperand()) this.expression += '×0.';
      else this.expression += '0.';
      this.updatePreview();
    }

    appendOperator(operator) {
      this.prepareForInput(true);
      if (!this.expression) {
        if (operator === '−') this.expression = '−';
        this.updatePreview();
        return;
      }
      if (this.expression.endsWith('.')) this.expression += '0';
      const last = this.expression.slice(-1);
      if ('+×÷^'.includes(last)) {
        if (operator === '−') this.expression += '−';
        else this.expression = this.expression.slice(0, -1) + operator;
      } else if (last === '−') {
        if (this.expression.length === 1 || '+×÷^('.includes(this.expression.slice(-2, -1))) {
          if (operator !== '−') this.expression = this.expression.slice(0, -1) + operator;
        } else this.expression = this.expression.slice(0, -1) + operator;
      } else if (last === '(') {
        if (operator === '−') this.expression += operator;
      } else this.expression += operator;
      this.updatePreview();
    }

    appendBrackets() {
      this.prepareForInput(false);
      if (!this.expression || /[+−×÷^(]$/.test(this.expression)) this.expression += '(';
      else {
        const opens = (this.expression.match(/\(/g) || []).length;
        const closes = (this.expression.match(/\)/g) || []).length;
        if (opens > closes) this.expression += ')';
        else this.expression += '×(';
      }
      this.updatePreview();
    }

    appendPostfix(symbol) {
      this.prepareForInput(true);
      if (!this.endsWithOperand() || /[%!]$/.test(this.expression)) {
        this.showToast(symbol === '%' ? 'Add a number before percent' : 'Add a number before factorial');
        return;
      }
      this.expression += symbol;
      this.updatePreview();
    }

    appendFunction(name) {
      this.prepareForInput(false);
      if (this.endsWithOperand()) this.expression += '×';
      this.expression += `${name}(`;
      this.updatePreview();
    }

    appendConstant(constant) {
      this.prepareForInput(false);
      if (this.endsWithOperand()) this.expression += '×';
      this.expression += constant;
      this.updatePreview();
    }

    appendSquare() {
      this.prepareForInput(true);
      if (!this.endsWithOperand()) { this.showToast('Add a number before squaring'); return; }
      this.expression += '^2';
      this.updatePreview();
    }

    appendPower() {
      this.prepareForInput(true);
      if (!this.endsWithOperand()) { this.showToast('Add a base before xʸ'); return; }
      this.expression += '^';
      this.updatePreview();
    }

    toggleSign() {
      this.prepareForInput(true);
      if (!this.expression) {
        this.expression = '−';
      } else if (/^−?\d*\.?\d+$/.test(this.expression)) {
        this.expression = this.expression.startsWith('−') ? this.expression.slice(1) : `−${this.expression}`;
      } else {
        this.expression = `−(${this.expression})`;
      }
      this.updatePreview();
    }

    clear() {
      this.expression = '';
      this.lastResult = '0';
      this.justEvaluated = false;
      this.render();
    }

    backspace() {
      if (!this.expression) return;
      this.justEvaluated = false;
      this.expression = this.expression.slice(0, -1);
      this.updatePreview();
    }

    equals() {
      if (!this.expression) return;
      try {
        const value = evaluateExpression(this.expression, this.angleMode);
        const result = formatRational(value);
        this.lastResult = result;
        this.justEvaluated = true;
        this.saveHistory(this.expression, result);
        this.render();
      } catch (error) {
        this.lastResult = error instanceof CalculationError ? error.message : 'Check the expression';
        this.justEvaluated = false;
        this.render();
      }
    }

    getCurrentValue() {
      if (!this.expression) return Rational.zero();
      return evaluateExpression(this.expression, this.angleMode);
    }

    handleMemory(action) {
      try {
        if (action === 'memory-clear') {
          this.memory = Rational.zero();
          this.showToast('Memory cleared');
        } else if (action === 'memory-recall') {
          this.prepareForInput(false);
          if (this.endsWithOperand()) this.expression += '×';
          this.expression += formatRational(this.memory);
          this.updatePreview();
          this.showToast('Memory recalled');
          return;
        } else {
          const current = this.getCurrentValue();
          this.memory = action === 'memory-add' ? this.memory.add(current) : this.memory.subtract(current);
          this.showToast(action === 'memory-add' ? 'Added to memory' : 'Subtracted from memory');
        }
        store.set('calc-memory', formatRational(this.memory));
        this.updateMemoryIndicator();
      } catch (error) {
        this.showToast('Finish a valid calculation first');
      }
    }

    updateMemoryIndicator() {
      memoryIndicator.classList.toggle('is-active', this.memory.n !== 0n);
      memoryIndicator.setAttribute('aria-label', this.memory.n !== 0n ? 'Memory has a saved value' : 'Memory is empty');
    }

    saveHistory(expression, result) {
      const last = this.history[0];
      if (!last || last.expression !== expression || last.result !== result) {
        this.history.unshift({ expression, result });
        this.history = this.history.slice(0, 50);
        store.set('calc-history', JSON.stringify(this.history));
      }
      this.renderHistory();
    }

    renderHistory() {
      historyList.replaceChildren();
      if (!this.history.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-history';
        empty.textContent = 'Your completed calculations will appear here.';
        historyList.append(empty);
      } else {
        this.history.forEach((entry) => {
          const item = document.createElement('button');
          item.className = 'history-entry';
          item.type = 'button';
          item.setAttribute('aria-label', `Reuse ${entry.expression}, result ${entry.result}`);
          const expression = document.createElement('span');
          expression.className = 'history-expression';
          expression.textContent = entry.expression;
          const result = document.createElement('span');
          result.className = 'history-result';
          result.textContent = `= ${entry.result}`;
          item.append(expression, result);
          item.addEventListener('click', () => {
            this.expression = entry.expression;
            this.lastResult = entry.result;
            this.justEvaluated = false;
            this.updatePreview();
            this.closeHistory();
            this.showToast('Calculation loaded');
          });
          historyList.append(item);
        });
      }
      historyCount.textContent = this.history.length ? `${this.history.length} / 50 saved` : '';
    }

    clearHistory() {
      if (!this.history.length) return;
      this.history = [];
      store.set('calc-history', '[]');
      this.renderHistory();
      this.showToast('History cleared');
    }

    openHistory() {
      historyPanel.classList.add('is-open');
      historyPanel.setAttribute('aria-hidden', 'false');
      scrim.hidden = false;
      $('#closeHistory').focus();
    }

    closeHistory() {
      historyPanel.classList.remove('is-open');
      historyPanel.setAttribute('aria-hidden', 'true');
      scrim.hidden = true;
      $('#historyButton').focus();
    }

    async copyResult() {
      if (!this.lastResult || this.lastResult === '—' || resultOutput.classList.contains('is-error')) {
        this.showToast('There is no result to copy');
        return;
      }
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(this.lastResult);
        else {
          const temporary = document.createElement('textarea');
          temporary.value = this.lastResult;
          temporary.style.position = 'fixed';
          temporary.style.opacity = '0';
          document.body.append(temporary);
          temporary.select();
          document.execCommand('copy');
          temporary.remove();
        }
        this.showToast('Result copied');
      } catch (_) { this.showToast('Copy is not available here'); }
    }

    showToast(message) {
      clearTimeout(this.toastTimeout);
      toast.textContent = message;
      toast.classList.add('is-visible');
      this.toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 1900);
    }

    handleKeyboard(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      const actionMap = {
        Enter: () => this.equals(),
        '=': () => this.equals(),
        Escape: () => this.clear(),
        Backspace: () => this.backspace(),
        '+': () => this.appendOperator('+'),
        '-': () => this.appendOperator('−'),
        '*': () => this.appendOperator('×'),
        '/': () => this.appendOperator('÷'),
        '^': () => this.appendPower(),
        '%': () => this.appendPostfix('%'),
        '(': () => this.appendBrackets(),
        ')': () => this.appendClosingBracketFromKeyboard(),
        '.': () => this.appendDecimal()
      };
      if (/^\d$/.test(key)) {
        event.preventDefault();
        this.appendNumber(key);
      } else if (actionMap[key]) {
        event.preventDefault();
        actionMap[key]();
      }
    }

    appendClosingBracketFromKeyboard() {
      this.prepareForInput(false);
      const opens = (this.expression.match(/\(/g) || []).length;
      const closes = (this.expression.match(/\)/g) || []).length;
      if (opens > closes && this.endsWithOperand()) {
        this.expression += ')';
        this.updatePreview();
      }
    }
  }

  global.calculatorApp = new CalculatorApp();

  // The app shell is cached after the first visit, so calculations stay available offline.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
})(typeof window !== 'undefined' ? window : globalThis);
