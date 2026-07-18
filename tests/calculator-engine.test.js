import test from "node:test";
import assert from "node:assert/strict";
import { CalculatorError, canonicalNumber, evaluateTokens, formatNumber } from "../apps/calculator/engine.js";

test("respects multiplication and division precedence", () => {
  assert.equal(evaluateTokens(["2", "+", "3", "*", "4"]), 14);
  assert.equal(evaluateTokens(["20", "/", "5", "+", "2"]), 6);
});

test("evaluates equal-precedence operators from left to right", () => {
  assert.equal(evaluateTokens(["8", "/", "4", "*", "2"]), 4);
  assert.equal(evaluateTokens(["10", "-", "3", "+", "1"]), 8);
});

test("supports negative and decimal values", () => {
  assert.equal(evaluateTokens(["-2.5", "*", "4"]), -10);
});

test("rejects division by zero", () => {
  assert.throws(() => evaluateTokens(["9", "/", "0"]), CalculatorError);
});

test("rejects incomplete expressions", () => {
  assert.throws(() => evaluateTokens(["2", "+"]), CalculatorError);
});

test("formats and canonicalizes floating-point results", () => {
  assert.equal(canonicalNumber(0.1 + 0.2), "0.3");
  assert.equal(formatNumber(12345.5), "12,345.5");
});
