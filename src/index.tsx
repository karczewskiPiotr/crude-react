// @ts-nocheck - don't check due to lack of types for JSX
import * as Didact from "./lib/jsx-dev-runtime";

const element = (
  <div id="foo">
    <p>bar</p>
    <br />
  </div>
);

const container = document.getElementById("root")!;
Didact.render(element, container);
