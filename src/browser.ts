import { Zoomix, ZoomixScope } from './index';
import { watchDOM } from './events';
Object.assign(window, { Zoomix, ZoomixScope });
const selector = '[data-zoomix]';
const mounted = new Map<HTMLElement, Zoomix>();
function visit(node: Node) {
  if (!(node instanceof Element)) return;
  const roots = [...(node instanceof HTMLElement && node.matches(selector) ? [node] : []),
    ...node.querySelectorAll<HTMLElement>(selector)];
  for (const root of roots) if (root.isConnected) mounted.set(root, new Zoomix(root));
}
visit(document.documentElement);
watchDOM(records => {
  for (const [root, zoom] of mounted) if (!root.isConnected) { zoom.destroy(); mounted.delete(root); }
  for (const record of records) record.addedNodes.forEach(visit);
});
