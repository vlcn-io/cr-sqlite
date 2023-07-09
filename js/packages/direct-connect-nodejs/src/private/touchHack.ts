import { Config } from "../Types.js";
import { throttle } from "throttle-debounce";
import util from "./util.js";

const apply = throttle(25, (config: Config, dbid: Uint8Array) => {
  util.touchFile(config, dbid);
});

export default function touchHack(config: Config, dbid: Uint8Array) {
  if (!util.needsTouchHack()) {
    return;
  }

  apply(config, dbid);
}
