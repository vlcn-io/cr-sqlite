import * as React from "react";
import { Ctx, useQuery } from "./hooks";
import { useState, useCallback, memo } from "react";

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

type Filter = "all" | "active" | "completed";
type TodoList = {
  filter: Filter;
  editing: string | null;
  todos: Todo[];
};

function Header({ todoList }: { todoList: TodoList }) {
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
            // insert the todo with some nanoid
            setNewText("");
          }
        }}
      />
    </header>
  );
}

const TodoView = memo(
  ({
    todo,
    editing,
    startEditing,
    saveTodo,
  }: {
    key?: any;
    todo: Todo;
    editing: boolean;
    startEditing: (t: Todo) => void;
    saveTodo: (todo: Todo, text: string) => void;
  }) => {
    let body;

    const [text, setText] = useState(todo.text);
    // useBind(todo, ["text", "completed"]);
    const deleteTodo = () => {
      /*todo.delete().save();*/
    };
    const toggleTodo = () => {
      /*todo.update({ completed: !todo.completed }).save();*/
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
  }
);

function Footer({
  remaining,
  todos,
  clearCompleted,
  todoList,
}: {
  remaining: number;
  todos: Todo[];
  clearCompleted: () => void;
  todoList: TodoList;
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
    /*todoList.update({ filter }).save();*/
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
  const list: TodoList = {
    editing: null,
    filter: "all",
    todos: [],
  };
  const clearCompleted = () => {
    // commit(
    //   list.ctx,
    //   completeTodos.map((t) => t.delete())
    // );
  };
  const startEditing = useCallback(
    (todo: Todo) => {
      /*list.update({ editing: todo.id }).save(), */
    },
    [list]
  );
  const saveTodo = useCallback(
    (todo: Todo, text: string) => {
      // commit(
      //   list.ctx,
      //   todo.update({ text: text }),
      //   list.update({ editing: null })
      // );
    },
    [list]
  );
  const toggleAll = () => {
    if (remaining === 0) {
      // uncomplete all
      // commit(
      //   list.ctx,
      //   completeTodos.map((t) => t.update({ completed: false }))
      // );
    } else {
      // complete all
      // commit(
      //   list.ctx,
      //   activeTodos.map((t) => t.update({ completed: true }))
      // );
    }
  };
  let toggleAllCheck;

  // useBind(list, ["filter", "editing"]);
  const activeTodos: Todo[] = /*useQuery(() =>
    list.queryTodos().whereCompleted(P.equals(false))
  ).data;*/ [];
  const completeTodos: Todo[] = /*useQuery(() =>
    list.queryTodos().whereCompleted(P.equals(true))
  ).data;*/ [];
  const allTodos: Todo[] = /*useQuery(() => list.queryTodos(), [], {
    on: UpdateType.CREATE_OR_DELETE,
  }).data;*/ [];

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
      <Header todoList={list} />
      <section
        className="main"
        style={allTodos.length > 0 ? {} : { display: "none" }}
      >
        {toggleAllCheck}
        <ul className="todo-list">
          {todos.map((t) => (
            <TodoView
              key={t.id}
              todo={t}
              editing={list.editing === t.id}
              startEditing={startEditing}
              saveTodo={saveTodo}
            />
          ))}
        </ul>
        <Footer
          remaining={remaining}
          todos={allTodos}
          todoList={list}
          clearCompleted={clearCompleted}
        />
      </section>
    </div>
  );
}

// export default function App({ ctx }: { ctx: Ctx }) {
//   const data = useQuery<Todo>(ctx, ["todo"], "SELECT * FROM todo");
//   console.log(data);
//   return <div></div>;
// }
