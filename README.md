# TS AutoFix
[![npm version](https://badge.fury.io/js/ts-autofix.svg)](https://badge.fury.io/js/ts-autofix)

Automatically fix TS Errors when codefixes are available.

## Usage

For most use cases you should be able to use `ts-autofix` directly through `npx`.

- `npx ts-autofix list` from the root of your TS project will list available fixes.
- `npx ts-autofix` will attempt to run all available fixes.

If your tsconfig is not at `./tsconfig.json`, you should add arg `--project <pathToTsConfig>` to both commands.

You can also filter which fixes are applied by using the `--fixes` or `--errors` args.

| Argument | Description |
| ---------|-------------|
| --project | The path to your tsconfig file.<br/> e.g. `npx ts-autofix [list] --project foo/tsconfig.json` |
| -f<br/>--fixes | The name of one or more TS fixes to apply. Use `npx ts-autofix list` to find available fixes.<br/> e.g. `npx ts-autofix --fixes unusedIdentifier inferFromUsage` |
| -e<br/>--errors | The TypeScript error codes to look for fixes for.<br/> e.g. `npx ts-autofix --errors TS6133 7006` |
| --tsCliArgs | Additional CLI args for tsc to override compilerOptions. e.g. if you are trying to increase strictness of your project you might pass the additional compiler flag you are trying to enforce.<br/> e.g. `npx ts-autofix [list] --tsCliArgs "--noImplicitAny"` |

### Advanced Usage

It's also possible to use `ts-autofix` as a library, which gives you more control over how it runs and applies fixes.

e.g.
```ts
import { tsAutoFix } from `ts-autofix`;

tsAutoFix({
  tsConfigPath: "foo/tsconfig.json",
  diagnosticsFilter: (diag) => diag.code === 6133,
});
```

The input to `tsAutoFix` is a configuration object of type `TsAutoFixOptions`.

```ts
type TsAutoFixOptions = {
  tsconfigPath: string;
  compilerOptionsOverrides?: ts.CompilerOptions;
  diagnosticsFilter?: (diagnostic: ts.Diagnostic) => boolean;
  codeFixFilter?: (codeFixAction: ts.CodeFixAction) => boolean;
  preprocessCodeChanges?: (changes: ts.TextChange[], sourceFile: ts.SourceFile, diagnostic: ts.Diagnostic) => ts.TextChange[];
};
```

| Option | Description |
|--------|-------------|
| tsconfigPath | (required) The path to your project's tsconfig.json. |
| compilerOptionsOverrides | Optional overrides to the compilerOptions in your tsconfig. |
| diagnosticsFilter | An optional callback to filter which TypeScript diagnostics/errors to attempt to find fixes for. If not defined, all diagnostics are used. Return `true` to include that diagnostic. |
| codeFixFilter | An optional callback to filter which fixes to apply. If not defined, all fixes are applied. Return `true` to include that fix. |
| preprocessCodeChanges | An optional callback to modify fixes before they are applied. This can return modified `changes`, or skip individual changes, but cannot modify `sourceFile` or `diagnostic` directly.  |

For exaple, you could use `preprocessCodeChanges` to modify the suggested replacements so that line comments are preserved when removing a variable.

```ts
import { tsAutoFix } from "ts-autofix";
import type * as ts from "typescript"

const preprocessCodeChanges = (
  changes: ts.TextChange[],
  sourceFile: ts.SourceFile,
  diagnostic: ts.Diagnostic
): ts.TextChange[] => {
  for (const change of changes) {
    // If the change is purely a deletion
    if (!change.newText) {
      let { start, length } = change.span;
      const removedText = sourceFile.text.substring(start, start + length);

      // Skip leading line comments when removing code.
      const match = removedText.match(/^(\s*\/\/.*\r?\n)+/);
      if (match) {
        change.span.start += match[0].length;
        change.span.length -= match[0].length;
      }
    }
  }
  return changes;
};


tsAutoFix({
  tsConfigPath: "foo/tsconfig.json",
  preprocessCodeChanges
});
```
