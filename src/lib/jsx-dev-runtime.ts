namespace React {
  export type JsxElementType = keyof HTMLElementTagNameMap | Function;
  export type JsxElementProps = {
    children: Element[] | string | number;
    [key: string]: any;
  };

  export type Element = NodeElement | TextElement | FunctionComponent;
  export interface NodeElement {
    type: keyof HTMLElementTagNameMap | Function;
    props: { children: Element[]; [key: string]: any };
  }
  export interface TextElement {
    type: "TEXT_ELEMENT";
    props: { nodeValue: string; children: Element[]; [key: string]: any };
  }
  export interface FunctionComponent {
    type: (props: FunctionComponent["props"]) => Element;
    props: { children: Element[]; [key: string]: any };
  }

  export type FiberNode = {
    dom?: HTMLElement | Text;
    parent?: Fiber;
    sibling?: Fiber;
    child?: Fiber;
    alternate?: Fiber;
    effectTag?: "UPDATE" | "PLACEMENT" | "DELETION";
    hooks?: any[];
  } & Element;

  export type FiberRoot = Omit<FiberNode, "type" | "dom"> & {
    type?: FiberNode["type"];
    dom: Required<FiberNode>["dom"];
  };

  export type Fiber = FiberRoot | FiberNode;

  export function isFiberRoot(fiber: Fiber): fiber is FiberRoot {
    return !fiber.type;
  }
}

function assert(expression: unknown, msg?: string): asserts expression {
  if (!expression) throw new Error(msg);
}

/** https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType */
function isTextNode(node: Node): node is Text {
  return node.nodeType === 3;
}

/** https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType */
function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === 1;
}

/** Check if prop is an event handler */
function isEvent(key: string) {
  return key.startsWith("on");
}

/** Check if prop is a valid property */
function isProperty(key: string) {
  return key !== "children" && !isEvent(key);
}

/** Check if prop is new or has changed */
function isNewProp(prev: any, next: any) {
  return (key: string) => prev[key] !== next[key];
}

/** Check if prop has been removed */
function isGoneProp(next: any) {
  return (key: string) => !(key in next);
}

// --- JSX transpilation

/**
 * Creates a React element of the given type.
 *
 * This function is what Bun transpiles the JSX to in order to make it valid JavaScript.
 * The difference between the call signatures of this function and [React's](https://react.dev/reference/react/createElement)
 * is due to Bun passing `children` as part of the props durign transpilation.
 *
 * The following JSX
 *
 * ```tsx
 * export default function Hello() {
 *  return <h1>Hello world!</h1>
 * }
 * ```
 *
 * will be transpiled to (_more or less_)
 *
 * ```tsx
 * export default function Hello() {
 *  return createElement("h1", { children: "Hello world!" });
 * }
 * ```
 */
function createElement(
  type: React.JsxElementType,
  props: React.JsxElementProps
) {
  const { children = [], ...rest } = props;
  const element: React.Element = { type, props: { ...rest, children: [] } };

  if (Array.isArray(children)) {
    element.props.children = children.map((child) =>
      typeof child === "object" ? child : createTextElement(child)
    );
  } else {
    element.props.children = [createTextElement(children)];
  }

  return element;
}

/**
 * Creates a React text element.
 *
 * This is done to simplify the implementation since it's a crude version of React.
 */
function createTextElement(text: string | number): React.TextElement {
  return {
    type: "TEXT_ELEMENT",
    props: { nodeValue: text.toString(), children: [] },
  };
}

// --- Render phase

/** Updates existing DOM nodes with props that changed */
function updateDom(
  dom: NonNullable<React.Fiber["dom"]>,
  prevProps: Partial<React.Fiber["props"]>,
  nextProps: Partial<React.Fiber["props"]>
) {
  const isGone = isGoneProp(nextProps);
  const isNew = isNewProp(prevProps, nextProps);

  // Remove old properties and event listeners
  for (const prop of Object.keys(prevProps)) {
    // Text node can only have a nodeValue assigned
    if (isTextNode(dom)) {
      if (isGone(prop)) dom.nodeValue = null;
      break;
    }

    if (isEvent(prop) && (isGone(prop) || isNew(prop))) {
      const eventType = prop.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[prop]);
    } else if (isProperty(prop) && isGone(prop)) {
      dom.removeAttribute(prop);
    }
  }

  // Add new event listeners and set new/changed properties
  for (const prop of Object.keys(nextProps)) {
    // Text node can only have a nodeValue assigned
    if (isTextNode(dom)) {
      if (isNew(prop)) dom.nodeValue = nextProps.nodeValue;
      break;
    }

    if (isEvent(prop) && isNew(prop)) {
      const eventType = prop.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[prop]);
    } else if (isProperty(prop) && isNew(prop)) {
      dom.setAttribute(prop, nextProps[prop]);
    }
  }
}

/** Creates DOM elements from element or text fibers. */
function createDom(fiber: React.FiberNode) {
  assert(
    !(fiber.type instanceof Function),
    "Attempted to create DOM from a function component fiber."
  );

  let dom: HTMLElement | Text;

  if (fiber.type === "TEXT_ELEMENT") {
    dom = document.createTextNode(fiber.props.nodeValue);
  } else {
    dom = document.createElement(fiber.type);
    updateDom(dom, {}, fiber.props);
  }

  return dom;
}

function reconcileChildren(wipFiber: React.Fiber, elements: React.Element[]) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling: React.Fiber["sibling"];

  while (index < elements.length || oldFiber) {
    const element = elements[index];
    let newFiber: React.Fiber | undefined = undefined;

    // Compare oldFiber to element
    const sameType = oldFiber && element && oldFiber.type === element.type;

    // Update the node
    if (sameType) {
      newFiber = {
        type: oldFiber?.type,
        props: element.props,
        dom: oldFiber?.dom!,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }

    // Add the node
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        parent: wipFiber,
        effectTag: "PLACEMENT",
      } as React.FiberNode;
    }

    // Delete the oldFiber's node
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) oldFiber = oldFiber.sibling;

    if (index === 0) wipFiber.child = newFiber;
    else if (element) prevSibling!.sibling = newFiber;

    prevSibling = newFiber;
    index++;
  }
}

let wipFiber: React.Fiber;
let hookIndex: number;

function updateFunctionComponent(fiber: React.Fiber) {
  assert(
    fiber.type instanceof Function,
    "Attempted to call updateFunctionComponent with element/text fiber"
  );

  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];

  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function updateHostComponent(fiber: React.Fiber) {
  if (!fiber.dom) {
    assert(
      !React.isFiberRoot(fiber),
      "Attempted to update host component for root fiber"
    );

    fiber.dom = createDom(fiber);
  }

  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
}

function performUnitOfWork(fiber: React.Fiber) {
  const isFunctionComponent = fiber.type instanceof Function;

  if (isFunctionComponent) updateFunctionComponent(fiber);
  else updateHostComponent(fiber);

  if (fiber.child) return fiber.child;

  let nextFiber: React.Fiber | undefined = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) return nextFiber.sibling;

    nextFiber = nextFiber.parent;
  }
}

// --- Commit phase

function commitWork(fiber?: React.Fiber) {
  if (!fiber) return;

  assert(fiber.parent, "Attempted to commit work for a fiber without a parent");

  let domParentFiber: React.Fiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent!;
  }

  const domParent = domParentFiber.dom;
  if (fiber.effectTag === "PLACEMENT" && fiber.dom) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom) {
    updateDom(fiber.dom, fiber.alternate?.props ?? {}, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber: React.Fiber, domParent: HTMLElement | Text) {
  if (fiber.dom) domParent.removeChild(fiber.dom);
  else commitDeletion(fiber.child!, domParent);
}

function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot?.child);
  currentRoot = wipRoot;
  wipRoot = undefined;
}

// --- Mount and kick-off render

let nextUnitOfWork: React.Fiber | undefined = undefined;
let currentRoot: React.Fiber | undefined = undefined;
let wipRoot: React.Fiber | undefined = undefined;
let deletions: React.Fiber[] = [];

function render(element: React.Element, container: HTMLElement) {
  wipRoot = {
    dom: container,
    props: { children: [element] },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

function workLoop(deadline: IdleDeadline) {
  let shouldYield = false;

  // Perform render to WIP tree (virtual DOM) unless done or interrupted
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  // Commit the tree to the real DOM if all work on it succeeded
  if (!nextUnitOfWork && wipRoot) commitRoot();

  requestIdleCallback(workLoop);
}

// Browser runs the callback when main thread is idle
requestIdleCallback(workLoop);

// --- Hooks

function isFnAction<T = any>(action: T | ((s: T) => T)): action is (s: T) => T {
  return typeof action === "function";
}

function useState<T = any>(initial: T) {
  const oldHook = wipFiber.alternate?.hooks?.[hookIndex] as
    | { state: T; queue: Array<T | ((state: T) => T)> }
    | undefined;
  const hook: { state: T; queue: Array<T | ((state: T) => T)> } = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook?.queue ?? [];
  for (const action of actions) {
    hook.state = isFnAction(action) ? action(hook.state) : action;
  }

  const setState = (action: T | ((state: T) => T)) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot?.dom!,
      props: currentRoot?.props!,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks?.push(hook);
  hookIndex++;

  return [hook.state, setState] as const;
}

export { createElement as jsxDEV, render, useState };
