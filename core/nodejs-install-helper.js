/**
 * 1. Checks the current OS and CPU architecture
 * 2. Copies pre-built binaries from the `binaries` directory to the `dist` directory if one exists
 * 3. Otherwise, lets the standard install process via `make` take over
 */
import { join } from "path";
import fs from "fs";
import http from "http";
import { version } from "./package.json";

let arch = process.arch;
let os = process.platform;
let ext = "unknown";
// todo: check msys?
if (["win32", "cygwin"].includes(process.platform)) {
  os = "windows";
}

switch (os) {
  case "darwin":
    ext = "dylib";
    break;
  case "linux":
    ext = "so";
    break;
  case "windows":
    ext = "dll";
    break;
}

switch (process.arch) {
  case "x64":
    arch = "x86_64";
    break;
  case "arm64":
    arch = "aarch64";
    break;
}

const binaryUrl = `https://github.com/vlcn-io/cr-sqlite/releases/download/v${version}/crsqlite-${os}-${arch}.${ext}`;
const distPath = join("dist", `crsqlite.${ext}`);

// download the file at the url, if it exists
http.get(binaryUrl, (res) => {
  if (res.statusCode === 200) {
    const file = fs.createWriteStream(distPath);
    res.pipe(file);
    file.on("finish", () => {
      file.close();
      console.log("Prebuilt binary downloaded");
    });
  } else {
    console.log("No prebuilt binary available. Building from source.");
  }
});
