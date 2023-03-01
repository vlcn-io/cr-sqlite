/**
 * 1. Checks the current OS and CPU architecture
 * 2. Copies pre-built binaries from the `binaries` directory to the `dist` directory if one exists
 * 3. Otherwise, lets the standard install process via `make` take over
 */
import { join } from "path";
import fs from "fs";

const arch = process.arch;
let os = process.platform;
let ext = "unknown";
// todo: check msys?
if (["win32", "cygwin"].includes(process.platform)) {
  os = "windows";
}

if (os === "darwin") {
  ext = "dylib";
} else if (os === "linux") {
  ext = "so";
} else if (os === "windows") {
  ext = "dll";
}

const binaryPath = join("binaries", `crsqlite-${os}-${arch}.${ext}`);

if (fs.existsSync(binaryPath)) {
  const distPath = join("dist", `crsqlite.${ext}`);
  fs.copyFileSync(binaryPath, distPath);
}
