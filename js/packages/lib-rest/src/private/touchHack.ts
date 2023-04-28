import { Config } from "../Types.js";
import { throttle } from "throttle-debounce";
import util from "./util.js";

const apply = throttle(25, (config: Config, dbid: string) => {
  util.touchFile(config, dbid);
});

export default function touchHack(config: Config, dbid: string) {
  if (!util.isDarwin()) {
    return;
  }

  apply(config, dbid);
}
