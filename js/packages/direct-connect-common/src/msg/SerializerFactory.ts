import JsonSerializer from "./JsonSerializer";

export default {
  getSerializer(
    contentType: "application/json" | "application/octet-stream",
    args: any[]
  ) {
    switch (contentType) {
      case "application/json":
        return new JsonSerializer(...args);
      case "application/octet-stream":
      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }
  },
};
