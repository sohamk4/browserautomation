// Helper functions used by both the recorder and the extraction popup.

export function throttle(key: string, ms: number): boolean {
  const w = window as any;
  const now = Date.now();
  const last = (w.__throttleLast__ = w.__throttleLast__ || {});
  if (last[key] && now - last[key] < ms) return false;
  last[key] = now;
  return true;
}

export function cssSelector(el: Element): string {
  if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && parts.length < 8) {
    let sel = node.nodeName.toLowerCase();
    if ((node as HTMLElement).id) {
      sel = `#${(node as HTMLElement).id}`;
      parts.unshift(sel);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c): c is Element => c.nodeName === node!.nodeName,
      );
      if (siblings.length > 1) {
        sel += `:nth-of-type(${siblings.indexOf(node as Element) + 1})`;
      }
    }
    parts.unshift(sel);
    node = parent;
  }
  return parts.join(' > ');
}

export function xpathFor(el: Element): string {
  if ((el as HTMLElement).id) return `//*[@id="${(el as HTMLElement).id}"]`;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1) {
    const parent: Element | null = node.parentElement;
    let idx = 1;
    if (parent) {
      const sibs = Array.from(parent.children).filter(
        (c): c is Element => c.nodeName === node!.nodeName,
      );
      idx = sibs.indexOf(node as Element) + 1;
    }
    parts.unshift(`${node.nodeName.toLowerCase()}${parent ? `[${idx}]` : ''}`);
    if (node === document.body) {
      parts.unshift('body');
      break;
    }
    node = parent;
  }
  return '/' + parts.join('/');
}

export function computeSelectors(el: Element): Record<string, string> {
  const s: Record<string, string> = {};
  s.css = cssSelector(el);
  s.xpath = xpathFor(el);
  s.domPath = cssSelector(el);
  const id = (el as HTMLElement).id;
  if (id) s.id = id;
  const cls = typeof el.className === 'string' ? el.className.trim() : '';
  if (cls) s.className = cls;
  const role = el.getAttribute('role');
  if (role) s.role = role;
  const name = (el as HTMLInputElement).name;
  if (name) s.name = name;
  const ph = el.getAttribute('placeholder');
  if (ph) s.placeholder = ph;
  const tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
  if (tid) s.dataTestId = tid;
  const text = (el.textContent || '').trim().slice(0, 100);
  if (text) s.text = text;
  if ((el as HTMLInputElement).id) {
    const label = document.querySelector(
      `label[for="${(el as HTMLInputElement).id}"]`,
    );
    if (label && label.textContent) s.label = label.textContent.trim();
  }
  return s;
}

export function bbox(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export function push(ev: Record<string, unknown>): void {
  const w = window as any;
  ev.url = location.href;
  ev.title = document.title;
  w.__recorderEvents__.push(ev);
}

export function targetInfo(e: Event) {
  const el = e.target as Element;
  return { selectors: computeSelectors(el), boundingBox: bbox(el) };
}