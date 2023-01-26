use sqlite_nostd;

// You could make this rowid based to simplify your life.
// from rowid to rowid.
// user would need to ensure they fetch these though...
pub fn move_row(tbl: &str, from_id: *mut sqlite_nostd::value, to_id: *mut sqlite_nostd::value) {}

/*
Move is problematic to specify when the table has many columns participating in
the primary key.

The pk specification is position dependent :/

UPDATE todo
   SET order = orderings.order
  FROM (SELECT crsql_orderings(...)) AS orderings
 WHERE todo.id = orderings.id;

 move_row("todo", 1, 3)

 // insert would have all the collection info
 // we can, on insert, detect a collision and repair it in a trigger?
 // we can also do that on update.
 INSERT INTO todo (id, order) VALUES (1, crsql_fract_key_between())

 UPDATE todo SET order = x

 // inserting at an existing order of something else will insert after
 // that something else.

 // a null order will prepend
 */

pub fn create_insert_oredered_trigger() {
    // call into an internal function to repair orderings with the
    // given rowid on the given table?
}

pub fn create_update_order_trigger() {}
