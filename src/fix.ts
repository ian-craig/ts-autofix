import * as fs from "fs";
import * as ts from "typescript";
import { createTsProject, getDiagnosticsByFile } from "./utils";

export type TsAutoFixOptions = {
  tsconfigPath: string;
  compilerOptionsOverrides?: ts.CompilerOptions;
  diagnosticsFilter?: (diagnostic: ts.Diagnostic) => boolean;
  codeFixFilter?: (codeFixAction: ts.CodeFixAction) => boolean;
  preprocessCodeChanges?: (
    changes: ts.TextChange[],
    fileName: string,
    fileContent: string,
    diagnostic: ts.Diagnostic
  ) => ts.TextChange[];
};

export const tsAutoFix = (options: TsAutoFixOptions) => {
  const { program, host, formatContext } = createTsProject(
    options.tsconfigPath,
    options.compilerOptionsOverrides
  );

  const diagnosticsByFile = getDiagnosticsByFile(program);

  // Go through file by file
  for (let [fileName, diagnostics] of diagnosticsByFile) {
    if (options.diagnosticsFilter !== undefined) {
      diagnostics = diagnostics.filter(options.diagnosticsFilter);
      if (diagnostics.length === 0) continue;
    }

    console.log(`Processing code fixes for ${fileName}`);
    const sourceFile = program.getSourceFile(fileName) as ts.SourceFile;

    const changes: ts.TextChange[] = [];
    for (const diag of diagnostics) {
      //console.log(`  ${diag.messageText} Pos ${diag.start}`);

      // Directly call into ts.codefix which is what the language service uses.
      // Calling this directly is much faster as the language service reloads the whole
      // project first, but we know it hasn't changed.
      let fixActions = (ts as any).codefix.getFixes({
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

      if (options.codeFixFilter) {
        fixActions = fixActions.filter(options.codeFixFilter);
      }

      if (fixActions.length > 0) {
        if (fixActions.length > 1) {
          console.log(
            `Found multiple matching actions at pos ${diag.start}. Only one will be applied.`
          );
        }

        const action = fixActions[0];
        for (const c of action.changes) {
          let textChanges = [...c.textChanges];
          if (options.preprocessCodeChanges) {
            textChanges = options.preprocessCodeChanges(
              changes,
              fileName,
              sourceFile.text,
              diag
            );
          }
          changes.push(...textChanges);
        }
      }
    }

    // Apply fixes in descending order so we don't mess up positions for the next fixes.
    changes.sort((a, b) => b.span.start - a.span.start);
    let content = sourceFile.text;
    let lastChangeStartPos = content.length;
    for (const change of changes) {
      let { start, length } = change.span;
      if (start + length > lastChangeStartPos) {
        console.log("Skipping overlapping change:", { start, length });
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
};
