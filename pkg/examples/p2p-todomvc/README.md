# P2P TODO MVC

Usage:

Start the "peer server"
```
cd ../peer-server
pnpm install
pnpm start
```

Start the app:
```
pnpm install
pnpm start
```

Open instances _in different browsers_ (i.e., safari, firefox, chrome) and connect between them.

Cross-tab reactivity is in the works via running `cr-sqlite` in a `SharedWorker` rather than in the main thread. The shared worker will be shared by all tabs.
