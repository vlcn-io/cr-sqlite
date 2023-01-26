pub fn repair_orderings(table: &str, rowid: int64) {
    // Select the items surrounding the rowid for the given collection
    // if no collision, return
    // if collision, make space

    // the thing is already inserted
    // we just need to find all things with the same order in the same collection
    // well how do we wknow what we're inserting between?
    // we need to push around there so we need are source
    // rowid
    //
    // we could process inserts into the vtab with an "after" param
    //
    // INSERT INTO todos_ordering (id, order, after) VALUES (1, 0.5)
    //
    // We could create a view and that view has an extra column strictly
    // meant for parameter passing.
    //
    // and do instead of triggers on the view.

    // INSERT INTO todo_fractindex (id, content, list_id, after_id) VALUES (1, after_id)
    // UPDATE todo_fractindex SET after_id = 1 WHERE id = 2
}
