import type * as ts from "typescript";
import columnify from "columnify";
import { createTsProject, getCodeFixes, getDiagnosticsByFile } from "./tsUtils";
import chalk from "chalk";

export type TsListFixesOptions = {
  tsconfigPath: string;
  compilerOptionsOverrides?: ts.CompilerOptions;
};

type ListData = {
  count: number;
  message: string;
  fixName: string;
  errorCode: string;
};

const columnTitles = {
  fixName: "Fix Name",
  count: "Fix Count",
  errorCode: "TS Error",
  message: "Example Error Message",
};

/**
 * Typecheck the project, find all available fixes, and log a summary to console.
 * @param {TsListFixesOptions} options
 */
export function listFixes(options: TsListFixesOptions) {
  const { program, host, formatContext } = createTsProject(
    options.tsconfigPath,
    options.compilerOptionsOverrides
  );

  const diagnosticsByFile = getDiagnosticsByFile(program);
  if (diagnosticsByFile.size === 0) {
    console.log(`No errors found, nothing to fix.`);
    return;
  }

  const fixInfo = new Map<string, ListData>();
  let totalDiagCount = 0;
  let totalFixCount = 0;

  for (const [fileName, diagnostics] of diagnosticsByFile) {
    const sourceFile = program.getSourceFile(fileName) as ts.SourceFile;

    totalDiagCount += diagnostics.length;

    for (const diag of diagnostics) {
      const fixActions = getCodeFixes(
        diag,
        sourceFile,
        program,
        host,
        formatContext
      );

      totalFixCount += fixActions.length;

      for (const action of fixActions) {
        const key = `${action.fixName}:${diag.code}`;
        if (fixInfo.has(key)) {
          fixInfo.get(key)!.count += 1;
        } else {
          fixInfo.set(key, {
            count: 1,
            message: diag.messageText.toString(),
            fixName: action.fixName,
            errorCode: `TS${diag.code}`,
          });
        }
      }
    }
  }

  console.log(
    `Found ${totalDiagCount} diagnostics and ${totalFixCount} possible fixes.`
  );

  if (totalFixCount > 0) {
    console.log(
      `\n` +
        columnify(Array.from(fixInfo.values()), {
          columns: ["fixName", "count", "errorCode", "message"],
          columnSplitter: "   ",
          headingTransform: (heading: string) => {
            return chalk.green(columnTitles[heading as keyof ListData]);
          },
        })
    );
  }
}
