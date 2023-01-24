SELECT crsql_orderings(after_primary_key, collection_column, collection_id, table, ordering_column);

WITH "cte" AS (
  SELECT "id", ${order_column}, row_number() OVER (ORDER BY ${order_column}) as "rn" FROM ${table} WHERE ${collection_id} = ${collection}
), "current" AS (
  SELECT "rn" FROM "cte"
  WHERE "id" = ${after_id}
)
SELECT "cte"."id", "cte".${order_column} FROM "cte", "current"
  WHERE ABS("cte"."rn" - "current"."rn") <= 1
ORDER BY "cte"."rn"


-- that'll get us the rows we need
-- then we need to go down on before until we hit a distinct before

-- if we collide on before too, run this to find before before.
SELECT "${order_column}" FROM ${table} WHERE ${collection_id} = ${collection} AND "${order_column}" < ${before} ORDER BY "${order_column}" DESC LIMIT 1


-- https://gist.github.com/Azarattum/0071f6dea0d2813c0b164b8d34ac2a1f


-- below would return the new assignments
-- where order is applied based on the selected row in the where statement
-- we know pks from schema.
-- we know order column if user defines it.
SELECT id, order FROM foo_order WHERE collection_id = 1 AND item_id = 1 ORDER BY order ASC;
/**


UPDATE foo_order SET 
*/

UPDATE todo
   SET order = orderings.order
  FROM (SELECT crsql_orderings(...)) AS orderings
 WHERE todo.id = orderings.id;

CREATE VIRTUAL TABLE foo_fract USING crsql_fractional_index (order_column_name);

^-- from here we create the vtab based on the existing table schema.
^-- - make all columns available
^-- - 