/**
 * Caches connections to active databases so we do not need to re-create the connection
 * on each request.
 *
 * Connection re-creation can be expensive due to the work required to setup sqlite + load extensions.
 */
export default class DBCache {}
