import { transferHandlers } from "comlink";

transferHandlers.set("iterable", {
  canHandle: (obj) => {
    const isIterable =
      typeof obj === "object" &&
      !Array.isArray(obj) &&
      (Symbol.iterator in obj || Symbol.asyncIterator in obj);
    return isIterable;
  },
  deserialize: (obj) => {
    return new Proxy(transferHandlers.get("proxy").deserialize(obj), {
      get: (target, prop) => {
        if (prop === Symbol.asyncIterator) {
          const gen = async function* () {
            while (true) {
              const nextObj = await target.next();
              if (nextObj.done) {
                return nextObj.value;
              }
              yield nextObj.value;
            }
          };
          return gen;
        } else return Reflect.get(...arguments);
      },
      has: (target, prop) => {
        if (prop === Symbol.asyncIterator) return true;
        else return prop in target;
      },
    });
  },
  serialize: (obj) => {
    return transferHandlers.get("proxy").serialize(proxy(obj));
  },
});
