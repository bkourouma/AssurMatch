import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Next.js refuses, at runtime, a file with a top-level "use server" directive that exports anything
// other than async functions ("A "use server" file can only export async functions, found object").
// The production build does not always catch it: the scoring screen failed only when the form was
// submitted. This static guard walks the three Next apps and fails on any other export.

const root = resolve(__dirname, "../../../..");
const appDirs = ["apps/admin", "apps/broker", "apps/public"];
const skipped = new Set(["node_modules", ".next", "tests", "test-results", "dist", "coverage"]);

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (skipped.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) files.push(path);
  }
  return files;
}

function hasUseServerDirective(file: ts.SourceFile): boolean {
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === "use server") return true;
  }
  return false;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
}

function isAsyncFunctionExpression(node: ts.Expression | undefined): boolean {
  if (!node) return false;
  let expression = node;
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) expression = expression.expression;
  return (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) && hasModifier(expression, ts.SyntaxKind.AsyncKeyword);
}

/** Returns a description of each export of a "use server" file that is not an async function. */
export function nonAsyncServerExports(sourceText: string, fileName = "file.ts"): string[] {
  const file = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (!hasUseServerDirective(file)) return [];
  const violations: string[] = [];
  for (const statement of file.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue; // erased at compile time
    if (ts.isFunctionDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
      if (!hasModifier(statement, ts.SyntaxKind.AsyncKeyword)) violations.push(`${isDefault ? "default" : statement.name?.text ?? "anonymous"}: function is not async`);
      continue;
    }
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!isAsyncFunctionExpression(declaration.initializer)) violations.push(`${declaration.name.getText(file)}: exported value is not an async function`);
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      if (!isAsyncFunctionExpression(statement.expression)) violations.push("default: exported value is not an async function");
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.isTypeOnly) violations.push(`${statement.getText(file).slice(0, 60)}: re-export cannot be checked, export async functions directly`);
      continue;
    }
    if ((ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      violations.push(`${statement.name?.text ?? "anonymous"}: exported ${ts.isClassDeclaration(statement) ? "class" : "enum"}`);
    }
  }
  return violations;
}

describe("use server files export only async functions", () => {
  it("detects an exported constant, a sync function and a re-export", () => {
    const source = [
      '"use server";',
      "export interface State { status: string }",
      "export type Other = string;",
      "export const keys = ['a'];",
      "export function sync() { return 1; }",
      "export async function ok() {}",
      "export const arrow = async () => {};",
      "export { ok as renamed };"
    ].join("\n");
    expect(nonAsyncServerExports(source)).toEqual([
      "keys: exported value is not an async function",
      "sync: function is not async",
      "export { ok as renamed };: re-export cannot be checked, export async functions directly"
    ]);
  });

  it("ignores files without a top-level directive (inline directives and plain modules)", () => {
    expect(nonAsyncServerExports("export const keys = ['a'];")).toEqual([]);
    expect(nonAsyncServerExports('export const keys = [1];\nasync function a() { "use server"; }')).toEqual([]);
  });

  it("finds no violation in the admin, broker and public apps", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const dir of appDirs) {
      for (const path of sourceFiles(join(root, dir))) {
        const text = readFileSync(path, "utf8");
        if (!text.includes("use server")) continue;
        checked += 1;
        for (const violation of nonAsyncServerExports(text, path)) offenders.push(`${relative(root, path).replaceAll("\\", "/")} -> ${violation}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
