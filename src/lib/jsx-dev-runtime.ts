namespace React {
  export interface Element {
    type: "TEXT_ELEMENT" | keyof HTMLElementTagNameMap;
    props: { children: Element[]; [key: string]: any };
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

function render(element: React.Element, container: HTMLElement) {
  let dom: HTMLElement | Text;

  if (element.type === "TEXT_ELEMENT") {
    dom = document.createTextNode(element.props.nodeValue);
  } else {
    dom = document.createElement(element.type);

    for (const name of Object.keys(element.props).filter(isProperty)) {
      dom.setAttribute(name, element.props[name]);
    }

    for (const child of element.props.children) {
      render(child, dom);
    }
  }

  container.appendChild(dom);
}

export { createElement as jsxDEV, render };
