type Config = {
  dbDir: string;
};

let _config = {
  dbDir: "./dbs",
  maxOutstandingAcks: 10,
};

export function configure(config: Config) {
  _config = {
    ..._config,
    ...config,
  };
}

export default _config;
