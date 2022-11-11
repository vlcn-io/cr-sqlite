# Node

To script this:

```bash
npm run build-release
npm publish --access=public --otp=...

cd deps/wa-sqlite
make
npm publish --access=public --otp=...

cd ../pkg
pnpm changeset
pnpm changeset version
pnpm publish -r --access=public --otp=
```
