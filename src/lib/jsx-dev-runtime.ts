namespace React {
  export type JsxElementType = keyof HTMLElementTagNameMap | Function;
  export type JsxElementProps = {
    children: Element[] | string;
    [key: string]: any;
  };

  export interface Element {
    type: "TEXT_ELEMENT" | keyof HTMLElementTagNameMap | Function;
    props: { children: Element[]; [key: string]: any };
  }

  export interface FiberNode extends Element {
    dom?: HTMLElement | Text;
    parent?: Fiber;
    sibling?: Fiber;
    child?: Fiber;
    alternate?: Fiber;
    effectTag?: "UPDATE" | "PLACEMENT" | "DELETION";
    hooks?: any[];
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
  const { children = [], ...delegated } = props;
  const element: React.Element = { type, props: { delegated, children: [] } };

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

function createDom(fiber: React.FiberNode) {
  if (fiber.type instanceof Function) {
    throw new Error("Can't call createDom with function component");
  }

  let dom: HTMLElement | Text;

  if (fiber.type === "TEXT_ELEMENT") {
    dom = document.createTextNode(fiber.props.nodeValue);
  } else {
    dom = document.createElement(fiber.type);

    updateDom(dom, {}, fiber.props);
  }

  return dom;
}

function isEvent(key: string) {
  return key.startsWith("on");
}

function isProperty(key: string) {
  return key !== "children" && !isEvent(key);
}

function isNew(prev: any, next: any) {
  return (key: string) => prev[key] !== next[key];
}

function isGone(next: any) {
  return (key: string) => !(key in next);
}

function updateDom(
  dom: React.Fiber["dom"],
  prevProps: Partial<React.Fiber["props"]>,
  nextProps: Partial<React.Fiber["props"]>
) {
  // Remove old or changed event listeners
  const invalidListeners = Object.keys(prevProps).filter(
    (prop) =>
      isEvent(prop) &&
      (!(prop in nextProps) || isNew(prevProps, nextProps)(prop))
  );

  for (const listener of invalidListeners) {
    const eventType = listener.toLowerCase().substring(2);
    dom?.removeEventListener(eventType, prevProps[listener]);
  }

  // Add new event listeners
  const validListeners = Object.keys(nextProps).filter(
    (prop) => isEvent(prop) && isNew(prevProps, nextProps)(prop)
  );

  for (const listener of validListeners) {
    const eventType = listener.toLowerCase().substring(2);
    dom?.addEventListener(eventType, nextProps[listener]);
  }

  // Remove old properties
  const oldProperties = Object.keys(prevProps).filter(
    (prop) => isProperty(prop) && isGone(nextProps)(prop)
  );

  for (const name of oldProperties) {
    // TODO: Technically nodeValue is never removed from Text
    (dom as HTMLElement).removeAttribute(name);
  }

  // Set new or changed properties
  const validProperties = Object.keys(nextProps).filter(
    (prop) => isProperty(prop) && isNew(prevProps, nextProps)(prop)
  );

  for (const name of validProperties) {
    // TODO: Handle the Text vs HTMLElement better
    (dom as any)[name] = nextProps[name];
  }
}

function commitWork(fiber?: React.Fiber) {
  if (!fiber) return;

  // TODO: Handle these if such state is possible
  if (!fiber.parent) throw new Error("Parent of the fiber doesn't exist.");

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

function render(element: React.Element, container: HTMLElement) {
  wipRoot = {
    dom: container,
    props: { children: [element] },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork: React.Fiber | undefined = undefined;
let currentRoot: React.Fiber | undefined = undefined;
let wipRoot: React.Fiber | undefined = undefined;
let deletions: React.Fiber[] = [];

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

let wipFiber: React.Fiber;
let hookIndex: number;

function updateFunctionComponent(fiber: React.Fiber) {
  if (!(fiber.type instanceof Function)) {
    throw new Error(
      `Cant't call updateFunctionComponent with an element/text fiber.`
    );
  }

  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];

  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

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

function updateHostComponent(fiber: React.Fiber) {
  if (!fiber.dom) {
    if (React.isFiberRoot(fiber)) {
      // TODO: Handle this if such state is possible
      throw new Error("Can't create a DOM node from a FiberRoot");
    }
    fiber.dom = createDom(fiber);
  }

  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
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
        dom: undefined,
        parent: wipFiber,
        alternate: undefined,
        effectTag: "PLACEMENT",
      };
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

export { createElement as jsxDEV, render, useState };
