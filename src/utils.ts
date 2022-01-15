import * as ts from "typescript";

export const createTsProject = (
  tsconfigPath: string,
  compilerOptionsOverrides: ts.CompilerOptions = {}
) => {
  const configHost: ts.ParseConfigFileHost = {
    fileExists: ts.sys.fileExists,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      console.error(`Unrecoverable error: ${diagnostic.messageText}`);
    },
    readDirectory: ts.sys.readDirectory,
    readFile: ts.sys.readFile,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  };
  const parsedCli = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    configHost
  )!;
  if (parsedCli.errors.length > 0) {
    throw new Error(
      `Encountered TypeScript config errors: ${parsedCli.errors}`
    );
  }

  const compilerOptions = {
    ...parsedCli.options,
    ...compilerOptionsOverrides,
  };
  const host = ts.createCompilerHost(compilerOptions);

  const programOptions: ts.CreateProgramOptions = {
    rootNames: parsedCli.fileNames,
    options: parsedCli.options,
    configFileParsingDiagnostics: parsedCli.errors,
    host: host,
  };
  const program = ts.createProgram(programOptions);

  const formatContext = (ts as any).formatting.getFormatContext({}, host);

  return { program, host, formatContext };
};

/**
 * Run the TypeScript compiler on a given program to find any diagnostics (errors)
 * and then group them by source file.
 */
export const getDiagnosticsByFile = (
  program: ts.Program
): Map<string, ts.Diagnostic[]> => {
  console.log("Running TypeScript compiler to get diagnostics");
  let diagnostics = ts.getPreEmitDiagnostics(program);

  const diagnosticsByFile = new Map<string, ts.Diagnostic[]>();
  for (const diag of diagnostics) {
    if (!diagnosticsByFile.has(diag.file!.fileName)) {
      diagnosticsByFile.set(diag.file!.fileName, []);
    }
    diagnosticsByFile.get(diag.file!.fileName)!.push(diag);
  }

  return diagnosticsByFile;
};
