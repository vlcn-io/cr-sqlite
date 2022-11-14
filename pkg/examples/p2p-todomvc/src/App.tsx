(window as any).__vlcn_whole_db_dbg = true;

import * as React from "react";
import { Ctx, useQuery } from "./hooks";
import { useState, useCallback, memo } from "react";
import { nanoid } from "nanoid";
import Peers from "./Peers";

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

type Filter = "all" | "active" | "completed";
type TodoList = {
  filter: Filter;
  editing: string | null;
};

function Header({ ctx }: { ctx: Ctx }) {
  const [newText, setNewText] = React.useState<string>("");
  return (
    <header className="header">
      <h1>todos</h1>
      <input
        type="text"
        className="new-todo"
        placeholder="What needs to be done?"
        autoFocus
        value={newText}
        onChange={(e) => setNewText(e.target.value)}
        onKeyUp={(e) => {
          const target = e.target as HTMLInputElement;
          if (e.key === "Enter" && target.value.trim() !== "") {
            ctx.db.exec("INSERT INTO todo VALUES (?, ?, ?)", [
              nanoid(),
              target.value,
              false,
            ]);
            setNewText("");
          }
        }}
      />
    </header>
  );
}

const TodoView = ({
  todo,
  editing,
  startEditing,
  saveTodo,
  ctx,
}: {
  key?: any;
  todo: Todo;
  editing: boolean;
  startEditing: (t: Todo) => void;
  saveTodo: (todo: Todo, text: string) => void;
  ctx: Ctx;
}) => {
  let body;

  const [text, setText] = useState(todo.text);
  const deleteTodo = () => {
    ctx.db.exec(`DELETE FROM todo WHERE id = ?`, [todo.id]);
  };
  const toggleTodo = () => {
    ctx.db.exec(`UPDATE todo SET completed = ? WHERE id = ?`, [
      !todo.completed,
      todo.id,
    ]);
  };

  if (editing) {
    body = (
      <input
        type="text"
        className="edit"
        autoFocus
        value={text}
        onBlur={() => saveTodo(todo, text)}
        onKeyUp={(e) => e.key === "Enter" && saveTodo(todo, text)}
        onChange={(e) => setText(e.target.value)}
      />
    );
  } else {
    body = (
      <div className="view">
        <input
          type="checkbox"
          className="toggle"
          checked={todo.completed}
          onChange={toggleTodo}
        />
        <label onDoubleClick={() => startEditing(todo)}>{todo.text}</label>
        <button className="destroy" onClick={deleteTodo} />
      </div>
    );
  }
  return (
    <li
      className={
        (todo.completed ? "completed " : "") + (editing ? "editing" : "")
      }
    >
      {body}
    </li>
  );
};

function Footer({
  remaining,
  todos,
  clearCompleted,
  todoList,
  ctx,
  setFilter,
}: {
  remaining: number;
  todos: Todo[];
  clearCompleted: () => void;
  todoList: TodoList;
  ctx: Ctx;
  setFilter: (f: Filter) => void;
}) {
  let clearCompletedButton;
  if (remaining !== todos.length) {
    clearCompletedButton = (
      <button className="clear-completed" onClick={clearCompleted}>
        Clear completed
      </button>
    );
  }

  const updateFilter = (filter: Filter) => {
    setFilter(filter);
  };

  return (
    <footer className="footer">
      <span className="todo-count">
        <strong> {remaining} </strong>
        {remaining === 1 ? "item" : "items"} left
      </span>
      <ul className="filters">
        <li>
          <a
            className={todoList.filter === "all" ? "selected" : ""}
            onClick={() => updateFilter("all")}
          >
            {" "}
            All{" "}
          </a>
        </li>
        <li>
          <a
            className={todoList.filter === "active" ? "selected" : ""}
            onClick={() => updateFilter("active")}
          >
            Active
          </a>
        </li>
        <li>
          <a
            className={todoList.filter === "completed" ? "selected" : ""}
            onClick={() => updateFilter("completed")}
          >
            Completed
          </a>
        </li>
      </ul>
      {clearCompletedButton}
    </footer>
  );
}

export default function App({ ctx }: { ctx: Ctx }) {
  const [list, setList] = useState<TodoList>({
    editing: null,
    filter: "all",
  });
  const clearCompleted = () => {
    ctx.db.exec(`DELETE FROM todo WHERE completed = true`);
  };
  const startEditing = useCallback(
    (todo: Todo) => {
      setList((old) => ({
        ...old,
        editing: todo.id,
      }));
    },
    [list]
  );
  const saveTodo = useCallback(
    (todo: Todo, text: string) => {
      ctx.db.exec(`UPDATE todo SET text = ? WHERE id = ?`, [text, todo.id]);
    },
    [list]
  );
  const toggleAll = () => {
    if (remaining === 0) {
      // uncomplete all
      ctx.db.exec(`UPDATE todo SET completed = false WHERE completed = true`);
    } else {
      // complete all
      ctx.db.exec(`UPDATE todo SET completed = true WHERE completed = false`);
    }
  };
  let toggleAllCheck;

  const allTodos: Todo[] = useQuery<Todo>(
    ctx,
    ["todo"],
    "SELECT * FROM todo ORDER BY id DESC"
  ).data;
  const completeTodos = allTodos.filter((t) => t.completed);
  const activeTodos = allTodos.filter((t) => !t.completed);

  const remaining = activeTodos.length;
  let todos =
    list.filter === "active"
      ? activeTodos
      : list.filter === "completed"
      ? completeTodos
      : allTodos;

  if (allTodos.length) {
    toggleAllCheck = (
      <>
        <input
          id="toggle-all"
          type="checkbox"
          className="toggle-all"
          checked={remaining === 0}
          onChange={toggleAll}
        />
        <label htmlFor="toggle-all">Mark all as complete</label>
      </>
    );
  }

  return (
    <div className="todoapp">
      <Peers ctx={ctx} />
      <div
        className="siteid"
        onClick={() => {
          navigator.clipboard.writeText(ctx.siteid);
        }}
      >
        PeerID: {ctx.siteid}
      </div>
      <Header ctx={ctx} />
      <section
        className="main"
        style={allTodos.length > 0 ? {} : { display: "none" }}
      >
        {toggleAllCheck}
        <ul className="todo-list">
          {todos.map((t) => (
            <TodoView
              ctx={ctx}
              key={t.id}
              todo={t}
              editing={list.editing === t.id}
              startEditing={startEditing}
              saveTodo={saveTodo}
            />
          ))}
        </ul>
        <Footer
          ctx={ctx}
          remaining={remaining}
          todos={allTodos}
          todoList={list}
          clearCompleted={clearCompleted}
          setFilter={(f: Filter) => {
            setList((l) => ({
              ...l,
              filter: f,
            }));
          }}
        />
      </section>
    </div>
  );
}
