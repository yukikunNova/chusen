type Attrs = {
  class?: string;
  testid?: string;
  text?: string;
  title?: string;
  type?: string;
  placeholder?: string;
  hidden?: boolean;
};

/** 要素を作る小さなヘルパー。文字は必ず textContent で入れる。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.testid) node.dataset.testid = attrs.testid;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  if (attrs.title) node.title = attrs.title;
  if (attrs.type) node.setAttribute('type', attrs.type);
  if (attrs.placeholder) node.setAttribute('placeholder', attrs.placeholder);
  if (attrs.hidden) node.hidden = true;
  node.append(...children);
  return node;
}

/** 日本語変換の確定 Enter かどうか。 */
export function isComposingEnter(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}
