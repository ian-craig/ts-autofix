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

  for (const [fileName, diagnostics] of diagnosticsByFile) {
    const sourceFile = program.getSourceFile(fileName) as ts.SourceFile;

    const fixCounts = new Map<string, ListData>();

    for (const diag of diagnostics) {
      const fixActions = getCodeFixes(
        diag,
        sourceFile,
        program,
        host,
        formatContext
      );

      for (const action of fixActions) {
        const key = `${action.fixId}:${diag.code}`;
        if (fixCounts.has(key)) {
          fixCounts.get(key)!.count += 1;
        } else {
          fixCounts.set(key, {
            count: 1,
            message: diag.messageText.toString(),
            fixName: action.fixName,
            errorCode: `TS${diag.code}`,
          });
        }
      }
    }

    console.log(
      `\n` +
        columnify(Array.from(fixCounts.values()), {
          columns: ["fixName", "count", "errorCode", "message"],
          columnSplitter: "   ",
          headingTransform: (heading) => {
            return chalk.green(columnTitles[heading as keyof ListData]);
          },
        })
    );
  }
}
