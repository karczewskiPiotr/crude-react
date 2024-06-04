namespace React {
  export type JsxElementType = keyof HTMLElementTagNameMap | Function;
  export type JsxElementProps = {
    children: Element[] | Element | string | number;
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
    type: (
      props: FunctionComponent["props"]
    ) => Element | string | number | boolean | null;
    props: { children: Element[]; [key: string]: any };
  }

  export type FiberNode = {
    /** DOM node associated with the fiber */
    dom?: HTMLElement | Text;
    /** Pointer to the parent fiber. */
    parent?: Fiber;
    /** Pointer to the next sibling fiber. */
    sibling?: Fiber;
    /** Pointer to the first child fiber. */
    child?: Fiber;
    /** Alternate fiber (the previous fiber representing this node) */
    alternate?: Fiber;
    /**
     * A tag, which marks the type of update that needs to be performed on the DOM.\
     * For purposes of the crude implementation it can indicate:
     * - update of the properties of existing DOM nodes
     * - creation of new DOM nodes
     * - deletion of existing DOM nodes
     */
    effectTag?: "UPDATE" | "PLACEMENT" | "DELETION";
    /** Keeps track of hooks to allow for multiple of them in one component. */
    hooks?: any[];
  } & Element;

  export type FiberRoot = Omit<FiberNode, "type" | "dom"> & {
    type?: FiberNode["type"];
    dom: Required<FiberNode>["dom"];
  };

  export type Fiber = FiberRoot | FiberNode;
}

function isFiberRoot(fiber: React.Fiber): fiber is React.FiberRoot {
  return !fiber.type;
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

function isFunctionComponent(
  fiber: React.Fiber
): fiber is React.FunctionComponent {
  return fiber.type instanceof Function;
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

  if (typeof children !== "object") {
    element.props.children.push(createTextElement(children));
  } else if (!Array.isArray(children)) {
    element.props.children.push(children);
  } else {
    element.props.children = children.map((child) =>
      typeof child === "object" ? child : createTextElement(child)
    );
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

// --- DOM manipulation helpers

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

// --- Render phase

/**
 * @param wipFiber the fiber to reconcile.
 * @param elements elements that are children of the parent element, which the fiber represents
 * @description
 * Compare WIP fiber's children with the current VDOM state
 * to determine which commit strategy to use for the fiber.
 */
function reconcileChildren(wipFiber: React.Fiber, elements: React.Element[]) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  // Tracks sibling so we can backwards set the newly tagged fiber
  let prevSibling: React.Fiber | undefined;

  // Iterates over the children of the oldFiber (tree)
  //            and the elements (array) to reconcile.
  while (index < elements.length || oldFiber) {
    const element = elements[index];
    let newFiber: React.Fiber | undefined;

    // Compare oldFiber to element
    const sameType = oldFiber && element && oldFiber.type === element.type;

    // Tag the fiber for UPDATE if the element is the same
    if (sameType) {
      assert(oldFiber);
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      } as React.Fiber;
    }

    // Tag the fiber for PLACEMENT if the elements is new
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        parent: wipFiber,
        effectTag: "PLACEMENT",
      } as React.Fiber;
    }

    // Tag the fiber for DELETION if the element was removed
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    // Traverse to the next child of the fiber in next iteration
    if (oldFiber) oldFiber = oldFiber.sibling;

    // Update the fiber in the work in progrees tree with newly tagged changes
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      assert(prevSibling);
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

let wipFiber: React.Fiber;
let hookIndex: number;

/**
 * Function components can return primitive values
 * so we need to turn them into valid elements.
 */
function evaluateFunctionComponent(fiber: React.FunctionComponent) {
  const fcReturn = fiber.type(fiber.props);
  const children: React.Element[] = [];

  if (typeof fcReturn === "string" || typeof fcReturn === "number") {
    children.push(createTextElement(fcReturn));
  } else if (fcReturn && typeof fcReturn === "object") {
    children.push(fcReturn);
  }

  return children;
}

/** Runs function component from fiber and updates the tree based on the result */
function updateFunctionComponent(fiber: React.Fiber) {
  assert(
    isFunctionComponent(fiber),
    "Attempted to call updateFunctionComponent with element/text fiber"
  );

  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];

  const children = evaluateFunctionComponent(fiber);
  reconcileChildren(fiber, children);
}

/** Updates the tree based on the fiber and its children  */
function updateHostComponent(fiber: React.Fiber) {
  if (!fiber.dom) {
    assert(
      !isFiberRoot(fiber),
      "Attempted to update host component for root fiber"
    );

    fiber.dom = createDom(fiber);
  }

  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
}

/**
 * Performs unit of work on the fiber and finds the next unit of work to return.
 *
 * Next unit of work is found by traversing the fiber tree:
 *  - if fiber has a child it becomes the next unit of work
 *  - if fiber has no child the sibling becomes the next unit of work
 *  - if fiber has no sibling we traverse the tree
 *    up to the parent and try to use its sibling
 *  - if the parent doesn't have a sibling we keep traversing
 *    the tree up the parents till we find one with a sibling
 *    or run out of fibers
 *
 * Running out of fibers means we finished the work.
 */
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
    assert(isElementNode(domParent), "Can't append a node to Text node");
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom) {
    updateDom(fiber.dom, fiber.alternate?.props ?? {}, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    assert(isElementNode(domParent), "Can't remove a node from Text node");
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

/**
 * Removes elements and their children from the DOM
 *
 * Function components do not have a DOM node so we need
 * traverse the cildren till we find their DOM nodes to remove.
 *
 * One more case to handle is a component that return `null` as
 * it will not have a DOM node on any of its children.
 */
function commitDeletion(fiber: React.Fiber, domParent: HTMLElement) {
  if (fiber.dom) domParent.removeChild(fiber.dom);
  else if (fiber.child) commitDeletion(fiber.child, domParent);
}

/** Modifies the DOM based on the latest {@link wipRoot} and reset the VDOM state. */
function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot?.child);
  currentRoot = wipRoot;
  wipRoot = undefined;
}

// --- Mount and kick-off render

let nextUnitOfWork: React.Fiber | undefined;
/** The current state of the virtual DOM (last committed fiber tree) */
let currentRoot: React.Fiber | undefined;
/** Work in progress fiber tree that will be commited when render is done */
let wipRoot: React.Fiber | undefined;
/**
 * Fibers that need to be removed.
 *
 * There is a need track them since they are no longer part of the {@link wipRoot}.
 */
let deletions: React.Fiber[] = [];

/**
 * Responsible for _"rendering"_ the element inside of the container.
 *
 * The rendering actually happens inside of the {@link workLoop}.
 * The render function itsef just kicks of the work by telling
 * the `workLoop` what tree it should work on.
 */
function render(element: React.Element, container: HTMLElement) {
  wipRoot = {
    dom: container,
    props: { children: [element] },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

/**
 * Responsible for running the render and commit phases.
 *
 * Chunk of the render phase (see {@link performUnitOfWork}) is guaranteed to run in each call but
 * not guaranteed to finish rendering the entire tree.
 * Commit phase only takes place if the entire tree has been rendered. (see {@link commitRoot})
 *
 * Work is performed in small chunks in order to allow the browser
 * to handle high priority things like user input by interrupting
 * the rendering, which would otherwise block the main thread.
 */
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
