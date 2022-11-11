# Node

To script this:

```bash
npm run build-release
npm publish --access=public --otp=...

cd pkg
# update references to @vlcn.io/crsqlite :(
pnpm changeset
pnpm changeset version
pnpm publish -r --access=public --otp=
```
