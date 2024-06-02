// @ts-nocheck - don't check due to lack of types for JSX
import * as React from "./lib/jsx-dev-runtime";

function Counter() {
  const [state, setState] = React.useState(1);
  return <h1 onClick={() => setState((count) => count + 1)}>Count: {state}</h1>;
}

const element = <Counter />;
const container = document.getElementById("root")!;
React.render(element, container);
