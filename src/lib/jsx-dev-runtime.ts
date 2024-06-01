namespace React {
  export interface Element {
    type: "TEXT_ELEMENT" | keyof HTMLElementTagNameMap;
    props: { children: Element[]; [key: string]: any };
  }

  export interface FiberNode extends React.Element {
    dom?: HTMLElement | Text;
    parent?: Fiber;
    sibling?: Fiber;
    child?: Fiber;
  }

  export type FiberRoot = Omit<FiberNode, "type" | "dom"> & {
    type?: FiberNode["type"];
    dom: Required<FiberNode>["dom"];
  };

  export type Fiber = FiberRoot | FiberNode;

  export function isFiberRoot(fiber: Fiber): fiber is FiberRoot {
    return !fiber.type;
  }
}

function createElement(
  type: React.Element["type"],
  props: { children: React.Element[] | string; [key: string]: any }
): React.Element {
  const { children = [], ...delegated } = props;
  const element = {
    type,
    props: { ...delegated, children: [] as React.Element[] },
  };

  if (Array.isArray(children)) {
    element.props.children = children.map((child) =>
      typeof child === "object" ? child : createTextElement(child)
    );
  } else {
    element.props.children = [createTextElement(children)];
  }

  return element;
}

function createTextElement(text: string): React.Element {
  return { type: "TEXT_ELEMENT", props: { nodeValue: text, children: [] } };
}

function isProperty(key: keyof React.Element["props"]): key is string {
  return key !== "children";
}

function createDom(fiber: React.FiberNode) {
  let dom: HTMLElement | Text;

  if (fiber.type === "TEXT_ELEMENT") {
    dom = document.createTextNode(fiber.props.nodeValue);
  } else {
    dom = document.createElement(fiber.type);

    for (const name of Object.keys(fiber.props).filter(isProperty)) {
      dom.setAttribute(name, fiber.props[name]);
    }
  }

  return dom;
}

function commitWork(fiber?: React.Fiber) {
  if (!fiber) return;

  // TODO: Handle these if such state is possible
  if (!fiber.parent?.dom) throw new Error("Parent or its DOM does not exist");
  if (!fiber.dom) throw new Error("Fiber's its DOM does not exist");

  const domParent = fiber.parent.dom;
  domParent.appendChild(fiber.dom);
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitRoot() {
  commitWork(wipRoot?.child);
  wipRoot = undefined;
}

function render(element: React.Element, container: HTMLElement) {
  wipRoot = { dom: container, props: { children: [element] } };
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork: React.Fiber | undefined = undefined;
let wipRoot: React.Fiber | undefined = undefined;

function workLoop(deadline: IdleDeadline) {
  let shouldYield = false;

  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) commitRoot();

  requestIdleCallback(workLoop);
}

// Browser runs the callback when main thread is idle
requestIdleCallback(workLoop);

function performUnitOfWork(fiber: React.Fiber) {
  if (!fiber.dom) {
    if (React.isFiberRoot(fiber)) {
      // TODO: Handle this if such state is possible
      throw new Error("Can't create a DOM node from a FiberRoot");
    }
    fiber.dom = createDom(fiber);
  }

  const elements = fiber.props.children;
  let index = 0;
  let prevSibling: React.Fiber["sibling"];

  while (index < elements.length) {
    const element = elements[index];

    const newFiber = {
      type: element.type,
      props: element.props,
      parent: fiber,
    };

    if (index === 0) fiber.child = newFiber;
    else prevSibling!.sibling = newFiber;

    prevSibling = newFiber;
    index++;
  }

  if (fiber.child) return fiber.child;

  let nextFiber: React.Fiber | undefined = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) return nextFiber.sibling;

    nextFiber = nextFiber.parent;
  }
}

export { createElement as jsxDEV, render };
