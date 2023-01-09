import { AsyncLocalStorage } from "node:async_hooks";
const storage = new AsyncLocalStorage();

type Context = {
  reqId?: string;
};
const empty = {};
const contextStore = {
  run(props: Context, cb: () => void) {
    storage.run(props, cb);
  },

  get(): Context {
    const ret = storage.getStore();
    if (ret) {
      return ret as Context;
    }
    return empty;
  },
};

export default contextStore;
