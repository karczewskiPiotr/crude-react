// @ts-nocheck - don't check due to lack of types for JSX
import * as React from "./lib/jsx-dev-runtime";

function Counter() {
  const [state, setState] = React.useState(1);

  return (
    <div>
      <h1>Count: {state}</h1>
      <button onClick={() => setState((count) => count + 1)}>Increment</button>
      <button onClick={() => setState((count) => count - 1)}>Decrement</button>
      <ol>
        {Array.from({ length: 10 }).map((_, i) => (
          <li>{i + 1 + state}</li>
        ))}
      </ol>
      {state % 2 === 0 ? (
        <h2 id="even">Count is even</h2>
      ) : (
        <h2 id="odd">Count is odd</h2>
      )}
    </div>
  );
}

const element = <Counter />;
const container = document.getElementById("root")!;
React.render(element, container);
