// db for the service itself.
// retains
// - schema name, current version
// - maybe list of databases under that schema?

export default class ServiceDB {
  constructor() {}

  /**
   *
   * @param namespace
   * @param schemaName
   */
  getCurrentSchemaVersion(namespace: string, schemaName: string) {}

  getCurrentSchema(
    namespace: string,
    schemaName: string
  ): {
    content: string;
    version: string;
  } {
    throw new Error();
  }

  getSchema(namespace: string, schemaName: string, version: string) {}

  listSchemas(namespace: string) {
    // get all schemas in the given namespace.
    // namespace should be authed to
  }

  addSchema(namespace: string, schemaName: string, version: string) {
    // don't allow overwriting an existing version
  }
}
