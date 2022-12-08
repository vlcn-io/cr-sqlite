type Config = {
  readonly dbDir: string;
  readonly schemaDir: string;
  readonly maxOutstandingAcks: number;
};

let config: Config = Object.freeze({
  dbDir: "./dbs",
  schemaDir: "./schemas",
  maxOutstandingAcks: 10,
});

export function configure(c: Partial<Config>) {
  config = Object.freeze({
    ...config,
    ...c,
  });
}

export default {
  get get() {
    return config;
  },
};
