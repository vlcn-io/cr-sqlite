pub fn create_fract_view() {
    // creates a view against which we can install instead_of triggers
    // to support move and insert between/after operations
    /*
      INSERT INTO todo_fractindex (pk1, pk2, pk3, content, complete, after_pk1, after_pk2, after_pk3) VALUES (1, 2, 3, 'stuff', false, 4, 5, 6);

    UPDATE todo_fractindex SET
      after_pk1 = 1,
      after_pk2 = 2,
      after_pk3 = 3
    WHERE
      pk1 = 4 AND pk2 = 5 AND pk3 = 6;
       */

    // 1. get the primary key list
    // 2. create view from select * against base table + stand in cols for after_
    // stand in cols are created via `SLEECT *, NULL AS after_ FROM base_table`
}
