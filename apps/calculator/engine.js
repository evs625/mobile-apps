const OPERATORS = new Set(["+", "-", "*", "/"]);

export class CalculatorError extends Error {}

function assertFiniteNumber(value) {
  if (!Number.isFinite(value)) {
    throw new CalculatorError("Result is outside the supported range");
  }
  return value;
}

function precedence(operator) {
  return operator === "*" || operator === "/" ? 2 : 1;
}

function applyOperator(left, operator, right) {
  switch (operator) {
    case "+": return assertFiniteNumber(left + right);
    case "-": return assertFiniteNumber(left - right);
    case "*": return assertFiniteNumber(left * right);
    case "/":
      if (right === 0) throw new CalculatorError("Cannot divide by zero");
      return assertFiniteNumber(left / right);
    default: throw new CalculatorError("Unknown operator");
  }
}

/**
 * Evaluate alternating numeric and operator tokens using normal arithmetic precedence.
 * Example: ["2", "+", "3", "*", "4"] => 14.
 */
export function evaluateTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length % 2 === 0) {
    throw new CalculatorError("Incomplete expression");
  }

  const values = [];
  const operators = [];

  const reduceTop = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    values.push(applyOperator(left, operator, right));
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (index % 2 === 0) {
      const value = Number(token);
      if (!Number.isFinite(value)) throw new CalculatorError("Invalid number");
      values.push(value);
      continue;
    }

    if (!OPERATORS.has(token)) throw new CalculatorError("Invalid operator");
    while (operators.length && precedence(operators.at(-1)) >= precedence(token)) {
      reduceTop();
    }
    operators.push(token);
  }

  while (operators.length) reduceTop();
  return assertFiniteNumber(values[0]);
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return "Error";
  if (Object.is(value, -0)) value = 0;

  const absolute = Math.abs(value);
  if ((absolute !== 0 && absolute < 1e-9) || absolute >= 1e12) {
    return value.toExponential(8).replace(/\.?(0+)e/, "e");
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 10,
    useGrouping: true,
  }).format(value);
}

export function canonicalNumber(value) {
  const rounded = Number.parseFloat(Number(value).toPrecision(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
