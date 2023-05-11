import { WorkerInterface } from "@vlcn.io/direct-connect-browser";
import workerUrl from "@vlcn.io/direct-connect-browser/shared-worker?url";

console.log(workerUrl);

const syncWorker = new WorkerInterface(workerUrl);

// syncWorker.startSync()
