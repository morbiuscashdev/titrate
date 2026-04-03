// packages/sdk/src/validation/helpers.ts
import type { ValidationIssue, ValidationSeverity } from './types.js';

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

export function hasWarnings(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'warning');
}

export function filterBySeverity(issues: readonly ValidationIssue[], severity: ValidationSeverity): ValidationIssue[] {
  return issues.filter((i) => i.severity === severity);
}
