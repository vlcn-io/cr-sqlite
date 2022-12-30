declare global {
  function sqlite3InitModule(locators: {
    locateWasm: (f: string) => string;
    locateProxy: (f: string) => string;
  }): Promise<any>;
}
