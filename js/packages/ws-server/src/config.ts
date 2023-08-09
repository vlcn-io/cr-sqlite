export const defaultConfig: Config = Object.freeze({
  dbFolder: "./dbs",
  schemaFolder: "./schemas",
  pathPattern: /\/vlcn-ws/,
});

export type Config = Readonly<{
  dbFolder: string | null;
  schemaFolder: string;
  pathPattern: RegExp;
}>;
