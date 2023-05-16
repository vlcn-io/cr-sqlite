export default {
  namespace: "default",
  name: "testSchema",
  active: true,
  content: `
    CREATE TABLE IF NOT EXISTS test (id PRIMARY KEY, name TEXT);
    SELECT crsql_as_crr('test');
  `,
};
