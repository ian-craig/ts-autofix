import * as ts from "typescript";
import { createTsProject, getDiagnosticsByFile } from "./utils";

export type TsListFixesOptions = {
  tsconfigPath: string;
  compilerOptionsOverrides?: ts.CompilerOptions;
};

export const listFixes = (options: TsListFixesOptions) => {
  const { program, host, formatContext } = createTsProject(
    options.tsconfigPath,
    options.compilerOptionsOverrides
  );

  const diagnosticsByFile = getDiagnosticsByFile(program);

  for (const [fileName, diagnostics] of diagnosticsByFile) {
    const sourceFile = program.getSourceFile(fileName) as ts.SourceFile;

    const fixCounts = new Map<string, number>();

    for (const diag of diagnostics) {
      // Directly call into ts.codefix which is what the language service uses.
      // Calling this directly is much faster as the language service reloads the whole
      // project first, but we know it hasn't changed.
      console.log("Getting fixes");
      const fixActions = (ts as any).codefix.getFixes({
        errorCode: diag.code,
        sourceFile: sourceFile,
        span: ts.createTextSpanFromBounds(
          diag.start!,
          diag.start! + diag.length!
        ),
        program,
        host,
        formatContext,
        preferences: {},
      }) as ts.CodeFixAction[];

      for (const action of fixActions) {
        const key = `${action.fixId} fixes TS${diag.code}`;
        fixCounts.set(key, (fixCounts.get(key) ?? 0) + 1);
      }
    }

    for (const [key, count] of fixCounts) {
      console.log(`${key}: ${count} instances`);
    }
  }
};
