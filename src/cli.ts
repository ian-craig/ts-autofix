#!/usr/bin/env node
import { program, InvalidArgumentError } from "commander";
import { tsAutoFix } from ".";
import { listFixes } from "./list";
import type * as ts from "typescript";

program
  .version(require("../package.json").version)
  .option(
    "--project <tsconfigPath>",
    "TypeScript config file path",
    "tsconfig.json"
  )
  .option(
    "--tsCliArgs <argsString>",
    "A string of additional CLI args to pass to tsc. e.g. to override a compiler option.",
    (value: string) => {
      const result = require("typescript").parseCommandLine(value.split(/\s+/));
      if (result.errors && result.errors.length > 0) {
        let errorMessage = "TypeScript failed to parse CLI args.\n";
        for (const err of result.errors) {
          errorMessage += err.messageText + "\n";
        }
        throw new InvalidArgumentError(errorMessage);
      }
      return result.options;
    }
  );

program.command("list").action((args) => {
  const { project: tsconfigPath, tsCliArgs: compilerOptionsOverrides } =
    program.opts();
  listFixes({ tsconfigPath, compilerOptionsOverrides });
});

program
  .command("fix", { isDefault: true })
  .option(
    "-f, --fixes <fixNames...>",
    "The names of fixes to apply. Run `ts-autofix list` to see available fixes."
  )
  .option(
    "-e, --errors <tsErrorCodes...>",
    "The TypeScript error codes to apply fixes to.",
    (value: string, prev: number[]) => {
      if (value.toUpperCase().startsWith("TS")) {
        value = value.substring(2);
      }
      const parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue)) {
        throw new InvalidArgumentError(
          "TS error code must be a number or a string starting with 'TS' followed by a number."
        );
      }
      prev.push(parsedValue);
      return prev;
    },
    []
  )
  .action((args) => {
    const { project: tsconfigPath, tsCliArgs: compilerOptionsOverrides } =
      program.opts();
    tsAutoFix({
      tsconfigPath,
      compilerOptionsOverrides,
      diagnosticsFilter:
        args.errors.length > 0
          ? (diag: ts.Diagnostic) => args.errors.includes(diag.code)
          : undefined,
      codeFixFilter:
        args.fixes !== undefined && args.fixes.length > 0
          ? (fix: ts.CodeFixAction) => args.fixes.includes(fix.fixName)
          : undefined,
    });
  });

program.parse(process.argv);
