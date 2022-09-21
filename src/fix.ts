import * as fs from "fs";
import type * as ts from "typescript";
import chalk from "chalk";
import {
  createTsProject,
  getCodeFixes,
  getDiagnosticsByFile,
  logDiagAction,
} from "./tsUtils";

export type TsAutoFixOptions = {
  /**
   * Path to the tsconfig.json for this project. Defaults to `./tsconfig.json`
   */
  tsconfigPath: string;

  /**
   * Optional overrides for the compilerOptions section of tsconfig.json
   */
  compilerOptionsOverrides?: ts.CompilerOptions;

  /**
   * Optionally filter which diagnostics/errors are considered for fixes.
   */
  diagnosticsFilter?: (diagnostic: ts.Diagnostic) => boolean;

  /**
   * Optionally filter which codefixes are applied.
   */
  codeFixFilter?: (codeFixAction: ts.CodeFixAction) => boolean;

  /**
   * Intercept file changes before they are applied and either modify or skip them.
   * Return the text changes which should be applied. Do not modify sourceFile or diagnostic.
   */
  preprocessCodeChanges?: (
    changes: ts.TextChange[],
    sourceFile: ts.SourceFile,
    diagnostic: ts.Diagnostic
  ) => ts.TextChange[];
};

/**
 * Automatically fix TS compiler errors using the built in TS codefixes.
 * @param {TsAutoFixOptions} options
 */
export function tsAutoFix(options: TsAutoFixOptions) {
  const { program, host, formatContext } = createTsProject(
    options.tsconfigPath,
    options.compilerOptionsOverrides
  );
  const diagnosticsByFile = getDiagnosticsByFile(program);
  if (diagnosticsByFile.size === 0) {
    console.log(`No errors found, nothing to fix.`);
    return;
  }

  // Go through file by file
  for (let [fileName, diagnostics] of diagnosticsByFile) {
    if (options.diagnosticsFilter !== undefined) {
      diagnostics = diagnostics.filter(options.diagnosticsFilter);
      if (diagnostics.length === 0) continue;
    }

    console.log(chalk.green(`Processing code fixes for ${fileName}`));
    const sourceFile = program.getSourceFile(fileName) as ts.SourceFile;

    const fileChanges: ts.TextChange[] = [];
    const posWithFixes = new Set<number>();
    for (const diag of diagnostics) {
      if (diag.start && posWithFixes.has(diag.start)) {
        logDiagAction(
          "Skipping",
          diag,
          "because a fix is already being applied at this location.",
          host
        );
        continue;
      }

      let fixActions = getCodeFixes(
        diag,
        sourceFile,
        program,
        host,
        formatContext
      );

      if (options.codeFixFilter) {
        fixActions = fixActions.filter(options.codeFixFilter);
      }

      if (fixActions.length > 0) {
        if (fixActions.length > 1) {
          console.log(
            chalk.yellow(
              `  Found multiple matching actions for error TS${diag.code} at pos ${diag.start}. Only one will be applied.`
            )
          );
        }

        const action = fixActions[0];
        for (const c of action.changes) {
          let textChanges = [...c.textChanges];
          if (options.preprocessCodeChanges) {
            textChanges = options.preprocessCodeChanges(
              textChanges,
              sourceFile,
              diag
            );
          }
          if (textChanges && textChanges.length) {
            logDiagAction(
              "Fixing",
              diag,
              `using ${action.fixName}: ${action.description}`,
              host
            );
            fileChanges.push(...textChanges);
            if (diag.start) {
              posWithFixes.add(diag.start);
            }
          }
        }
      }
    }

    // Apply fixes in descending order so we don't mess up positions for the next fixes.
    fileChanges.sort((a, b) => b.span.start - a.span.start);
    let content = sourceFile.text;
    let lastChangeStartPos = content.length;
    for (const change of fileChanges) {
      let { start, length } = change.span;
      if (start + length > lastChangeStartPos) {
        console.log(
          chalk.yellow(
            `  Skipping overlapping change at pos ${start}-${
              start + length
            }. Check code correctness manually and re-run if to apply skipped fixes.`
          )
        );
        continue;
      }

      content =
        content.substring(0, start) +
        change.newText +
        content.substring(start + length);
      lastChangeStartPos = start;
    }
    fs.writeFileSync(fileName, content);
  }
}
