// Lets the unit tests import modules that `import * as vscode from "vscode"`: the "vscode" module
// exists only inside VS Code, so tests get the small stand-in in vscode-stub.ts.
import { registerHooks } from "node:module";

const stub = new URL("./vscode-stub.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "vscode" ? { url: stub, shortCircuit: true } : nextResolve(specifier, context);
  },
});
