import { CalculatorError, canonicalNumber, evaluateTokens, formatNumber } from "./engine.js";

const display = document.querySelector("[data-display]");
const expressionDisplay = document.querySelector("[data-expression]");
const keypad = document.querySelector("[data-keypad]");
const liveRegion = document.querySelector("[data-live]");

if (new URLSearchParams(window.location.search).get("wrapper") === "android") {
  document.documentElement.dataset.wrapper = "android";
}

const SYMBOLS = { "*": "×", "/": "÷", "-": "−", "+": "+" };

let tokens = [];
let currentInput = "0";
let justEvaluated = false;
let hasError = false;

function announce(message) {
  liveRegion.textContent = "";
  window.setTimeout(() => { liveRegion.textContent = message; }, 10);
}

function expressionText() {
  const parts = tokens.map((token, index) => index % 2 ? SYMBOLS[token] : formatNumber(Number(token)));
  if (!justEvaluated && currentInput !== "0") parts.push(formatNumber(Number(currentInput)));
  return parts.join(" ");
}

function render() {
  display.textContent = hasError ? "Error" : formatNumber(Number(currentInput));
  expressionDisplay.textContent = expressionText() || "Ready";
  document.querySelector("[data-action='clear']").textContent = (tokens.length || currentInput !== "0" || hasError) ? "AC" : "C";
}

function reset() {
  tokens = [];
  currentInput = "0";
  justEvaluated = false;
  hasError = false;
  render();
}

function recoverFromError() {
  if (hasError) reset();
}

function inputDigit(digit) {
  recoverFromError();
  if (justEvaluated) reset();
  justEvaluated = false;

  if (currentInput === "0") currentInput = digit;
  else if (currentInput === "-0") currentInput = `-${digit}`;
  else if (currentInput.replace("-", "").replace(".", "").length < 12) currentInput += digit;
  render();
}

function inputDecimal() {
  recoverFromError();
  if (justEvaluated) reset();
  justEvaluated = false;
  if (!currentInput.includes(".")) currentInput += ".";
  render();
}

function inputOperator(operator) {
  recoverFromError();

  if (justEvaluated) {
    tokens = [currentInput, operator];
    currentInput = "0";
    justEvaluated = false;
    render();
    return;
  }

  if (tokens.length && currentInput === "0" && tokens.length % 2 === 0) {
    tokens[tokens.length - 1] = operator;
  } else {
    tokens.push(currentInput, operator);
    currentInput = "0";
  }
  render();
}

function toggleSign() {
  recoverFromError();
  if (currentInput === "0") return;
  currentInput = currentInput.startsWith("-") ? currentInput.slice(1) : `-${currentInput}`;
  render();
}

function applyPercent() {
  recoverFromError();
  currentInput = canonicalNumber(Number(currentInput) / 100);
  justEvaluated = false;
  render();
}

function backspace() {
  recoverFromError();
  if (justEvaluated) return reset();

  if (currentInput.length <= 1 || (currentInput.startsWith("-") && currentInput.length === 2)) currentInput = "0";
  else currentInput = currentInput.slice(0, -1);
  render();
}

function calculate() {
  recoverFromError();
  const finalTokens = [...tokens, currentInput];

  try {
    const result = evaluateTokens(finalTokens);
    expressionDisplay.textContent = `${expressionText()} =`;
    currentInput = canonicalNumber(result);
    tokens = [];
    justEvaluated = true;
    hasError = false;
    display.textContent = formatNumber(result);
    announce(`Result ${formatNumber(result)}`);
  } catch (error) {
    hasError = true;
    tokens = [];
    currentInput = "0";
    display.textContent = "Error";
    expressionDisplay.textContent = error instanceof CalculatorError ? error.message : "Unable to calculate";
    announce(expressionDisplay.textContent);
  }
}

function handleAction(action, value) {
  if (action === "digit") inputDigit(value);
  else if (action === "decimal") inputDecimal();
  else if (action === "operator") inputOperator(value);
  else if (action === "equals") calculate();
  else if (action === "clear") reset();
  else if (action === "sign") toggleSign();
  else if (action === "percent") applyPercent();
  else if (action === "backspace") backspace();
}

keypad.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  handleAction(button.dataset.action, button.dataset.value);
});

window.addEventListener("keydown", (event) => {
  if (/^[0-9]$/.test(event.key)) handleAction("digit", event.key);
  else if (event.key === "." || event.key === ",") handleAction("decimal");
  else if (["+", "-", "*", "/"].includes(event.key)) handleAction("operator", event.key);
  else if (event.key === "Enter" || event.key === "=") handleAction("equals");
  else if (event.key === "Escape") handleAction("clear");
  else if (event.key === "Backspace" || event.key === "Delete") handleAction("backspace");
  else if (event.key === "%") handleAction("percent");
  else return;
  event.preventDefault();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}

render();
