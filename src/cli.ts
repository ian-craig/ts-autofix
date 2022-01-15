import { program } from "commander";
import { listFixes } from "./list";

program
  .version(require("../package.json").version)
  .option(
    "--project <tsconfigPath>",
    "TypeScript config file path",
    "tsconfig.json"
  );

program.command("list").action((args) => {
  const { project } = program.opts();
  listFixes({ tsconfigPath: project });
});

program
  .command("fix", { isDefault: true })
  .option("-f, --fixId <fixId>", "TypeScript codefix ID")
  //.option("--list", "List all available fixes instead of fixing")
  .action((args) => {
    console.log("IN FIX", args, program.opts());
  });

program.parse(process.argv);
