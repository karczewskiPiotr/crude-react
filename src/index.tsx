// @ts-nocheck - don't check due to lack of types for JSX
import * as Didact from "./lib/jsx-dev-runtime";

function App(props) {
  return <h1>Hi {props.name}</h1>;
}

const element = <App name="foo" />;
const container = document.getElementById("root")!;
Didact.render(element, container);
