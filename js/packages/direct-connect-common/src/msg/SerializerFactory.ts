import JsonSerializer from "./JsonSerializer.js";
import BinarySerializer from "./BinarySerializer.js";

export default {
  getSerializer(
    contentType: "application/json" | "application/octet-stream",
    args: any[]
  ) {
    switch (contentType) {
      case "application/json":
        return new JsonSerializer(...args);
      case "application/octet-stream":
        return new BinarySerializer();
    }
  },
};
