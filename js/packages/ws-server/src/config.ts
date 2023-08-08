export const defaultConfig: Config = Object.freeze({
  dbFolder: "./dbs",
  schemaFolder: "./schemas",
});

export type Config = Readonly<{
  dbFolder: string | null;
  schemaFolder: string;
}>;
