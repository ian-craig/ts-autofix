import chalk from "chalk";
import type * as ts from "typescript";

/**
 * Try to use the caller's version of TypeScript if possible, otherwise fall back to
 * the version ts-autofix depends on.
 */
let tsInstance: typeof ts;
export function getTypeScript(): typeof ts {
  if (tsInstance) {
    return tsInstance;
  }
  try {
    const tsPath = require.resolve("typescript", {
      paths: [process.cwd()],
    });
    tsInstance = require(tsPath);
  } catch (e) {
    tsInstance = require("typescript");
    console.log(
      `No local version of TypeScript found. Falling back to bundled version (${tsInstance.version}).`
    );
  }
  return tsInstance;
}

/**
 * Set up necessary TS dependencies for generating diagnostics and finding fixes.
 */
export function createTsProject(
  tsconfigPath: string,
  compilerOptionsOverrides: ts.CompilerOptions = {}
) {
  const typescript = getTypeScript();

  const configHost: ts.ParseConfigFileHost = {
    fileExists: typescript.sys.fileExists,
    getCurrentDirectory: typescript.sys.getCurrentDirectory,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      console.error(`Unrecoverable error: ${diagnostic.messageText}`);
    },
    readDirectory: typescript.sys.readDirectory,
    readFile: typescript.sys.readFile,
    useCaseSensitiveFileNames: typescript.sys.useCaseSensitiveFileNames,
  };
  const parsedCli = typescript.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    configHost
  )!;
  if (!parsedCli) {
    process.exit(1);
  }
  if (parsedCli.errors.length > 0) {
    throw new Error(
      `Encountered TypeScript config errors: ${parsedCli.errors}`
    );
  }

  const compilerOptions = {
    ...parsedCli.options,
    ...compilerOptionsOverrides,
  };
  const host = typescript.createCompilerHost(compilerOptions);

  const programOptions: ts.CreateProgramOptions = {
    rootNames: parsedCli.fileNames,
    options: compilerOptions,
    configFileParsingDiagnostics: parsedCli.errors,
    host: host,
  };
  const program = typescript.createProgram(programOptions);

  const formatContext = (typescript as any).formatting.getFormatContext(
    {},
    host
  );

  return { program, host, formatContext };
}

/**
 * Run the TypeScript compiler on a given program to find any diagnostics (errors)
 * and then group them by source file.
 */
export function getDiagnosticsByFile(
  program: ts.Program
): Map<string, ts.Diagnostic[]> {
  const typescript = getTypeScript();
  console.log("Running TypeScript compiler to get diagnostics");
  let diagnostics = typescript.getPreEmitDiagnostics(program);

  const diagnosticsByFile = new Map<string, ts.Diagnostic[]>();
  for (const diag of diagnostics) {
    if (!diagnosticsByFile.has(diag.file!.fileName)) {
      diagnosticsByFile.set(diag.file!.fileName, []);
    }
    diagnosticsByFile.get(diag.file!.fileName)!.push(diag);
  }

  return diagnosticsByFile;
}

/**
 * Find any available automatic codefixes for a given TS error
 */
export function getCodeFixes(
  diag: ts.Diagnostic,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  host: ts.CompilerHost,
  formatContext: any
) {
  const typescript = getTypeScript();
  const cancellationToken: ts.CancellationToken = {
    isCancellationRequested: () => false,
    throwIfCancellationRequested: () => {},
  };

  // Directly call into ts.codefix which is what the language service uses.
  // Calling this directly is much faster as the language service reloads the whole
  // project first, but we know it hasn't changed.
  const fixActions = (typescript as any).codefix.getFixes({
    errorCode: diag.code,
    sourceFile: sourceFile,
    span: typescript.createTextSpanFromBounds(
      diag.start!,
      diag.start! + diag.length!
    ),
    program,
    host,
    formatContext,
    preferences: {},
    cancellationToken,
  }) as ts.CodeFixAction[];
  return fixActions;
}

/**
 * A helper util to log about actions taken to resolve a TS error
 */
export function logDiagAction(
  action: string,
  diag: ts.Diagnostic,
  reason: string,
  host: ts.CompilerHost,
  indent: string = "  "
) {
  const typescript = getTypeScript();
  console.log(
    `${indent}${action} ${chalk.gray(
      typescript.formatDiagnostic(diag, host).trim()
    )}\n${indent}  ${reason}\n`
  );
}
