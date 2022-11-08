import * as React from "react";
import { Ctx, useQuery } from "./hooks";

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

export default function App({ ctx }: { ctx: Ctx }) {
  const data = useQuery<Todo>(ctx, ["todo"], "SELECT * FROM todo");
  console.log(data);
  return <div></div>;
}
