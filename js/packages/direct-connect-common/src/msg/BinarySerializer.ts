import { ISerializer, Msg } from "../types.js";
import binEncode from "./binEncode.js";
import binDecode from "./binDecode.js";

export default class BinarySerializer implements ISerializer {
  get contentType(): "application/octet-stream" {
    return "application/octet-stream";
  }

  encode(msg: Msg): Uint8Array {
    return binEncode(msg);
  }

  decode(msg: Uint8Array): Msg {
    return binDecode(msg);
  }
}
