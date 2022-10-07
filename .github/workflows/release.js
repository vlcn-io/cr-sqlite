const fs = require("fs").promises;

module.exports = async ({ github, context }) => {
  const {
    repo: { owner, repo },
    sha,
  } = context;
  console.log(process.env.GITHUB_REF);
  const release = await github.rest.repos.getReleaseByTag({
    owner,
    repo,
    tag: process.env.GITHUB_REF.replace("refs/tags/", ""),
  });

  const release_id = release.data.id;
  async function uploadReleaseAsset(name, path) {
    console.log("Uploading", name, "at", path);

    return github.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id,
      name,
      data: await fs.readFile(path),
    });
  }
  await Promise.all([
    uploadReleaseAsset("path0.so", "path0-linux-amd64/path0.so"),
    uploadReleaseAsset("path0.dylib", "path0-darwin-amd64/path0.dylib"),
    uploadReleaseAsset("path0.dll", "path0-windows-amd64/path0.dll"),
    uploadReleaseAsset("path0-sqljs.wasm", "path0-sqljs/sqljs.wasm"),
    uploadReleaseAsset("path0-sqljs.js", "path0-sqljs/sqljs.js"),
  ]);

  return;
};
