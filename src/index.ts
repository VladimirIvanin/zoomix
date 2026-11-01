import { Events, watchDOM, type SubscriptionOptions } from './events.js';
export type { SubscriptionOptions } from './events.js';
import { clamp, contains, geometry, type Box } from './geometry';

export type ZoomMode = 'inner' | 'side' | 'lens';
export type ZoomOn = 'hover' | 'click';
export interface ZoomixOptions {
  mode?: ZoomMode;
  zoomOn?: ZoomOn;
  scale?: number;
  sideTarget?: HTMLElement | null;
  enabled?: boolean;
}
export interface ZoomixState {
  enabled: boolean;
  active: boolean;
  visible: boolean;
  loading: boolean;
  destroyed: boolean;
  mode: ZoomMode;
  zoomOn: ZoomOn;
  scale: number;
  effectiveMode: ZoomMode | null;
  effectiveScale: number | null;
}
export type ZoomixEventType = 'statechange' | 'open' | 'close' | 'loadstart' | 'load' | 'error' | 'destroy';
export interface ZoomixEvent {
  type: ZoomixEventType;
  instance: Zoomix;
  element: HTMLElement;
  state: ZoomixState;
  source?: string;
  requestedSource?: string;
  fallback?: boolean;
}
type Input = 'mouse' | 'touch' | 'keyboard';
const instanceKey = Symbol.for('zoomix.instance.v1');
const anchorKey = Symbol.for('zoomix.anchor.v1');
type Root = HTMLElement & { [instanceKey]?: Zoomix };
type Target = HTMLElement & { [anchorKey]?: { users: number; added: boolean } };
const px = (value: number) => value + 'px';
function place(el: HTMLElement, b: Box) {
  Object.assign(el.style, { left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) });
}
function localBox(box: Box, parent: HTMLElement): Box {
  const r = parent.getBoundingClientRect();
  return { ...box, x: box.x - r.left - parent.clientLeft + parent.scrollLeft,
    y: box.y - r.top - parent.clientTop + parent.scrollTop };
}
function layer(className: string) {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
function original(img: HTMLImageElement) {
  return img.currentSrc || img.src;
}
function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export class Zoomix {
  static get(element: HTMLElement) { return (element as Root)[instanceKey]; }
  static mount(root: HTMLElement, config: ZoomixScopeOptions) {
    return Zoomix.getScope(root) ?? new ZoomixScope(root, config);
  }
  static getScope(root: HTMLElement) { return (root as ScopeRoot)[scopeKey]; }
  get element(): HTMLElement { return this.root; }
  get signal() { return this.abort.signal; }
  private events = new Events<ZoomixEvent>();
  private visible = false;
  private effectiveMode: ZoomMode | null = null;
  private effectiveScale: number | null = null;
  private lastState = '';
  private destroying = false;
  getState(): ZoomixState {
    const scale = this.options.scale ?? Number(this.root.dataset.zoomScale || 2);
    return { enabled: this.options.enabled !== false, active: !!this.input,
      visible: this.visible, loading: this.loading, destroyed: this.signal.aborted,
      mode: this.options.mode ?? (this.root.dataset.zoomix as ZoomMode) ?? 'inner',
      zoomOn: this.zoomOn,
      scale: Number.isFinite(scale) ? scale : 2,
      effectiveMode: this.effectiveMode, effectiveScale: this.effectiveScale };
  }
  on(type: ZoomixEventType, handler: (event: ZoomixEvent) => void, options?: SubscriptionOptions) {
    return this.signal.aborted ? () => {} : this.events.on(type, handler, options);
  }
  private emit(type: ZoomixEventType, data: Partial<ZoomixEvent> = {}) {
    this.events.emit({ ...data, type, instance: this, element: this.root, state: this.getState() });
  }
  private changed() {
    const state = JSON.stringify(this.getState());
    if (state !== this.lastState) { this.lastState = state; this.emit('statechange'); }
  }
  open() {
    if (this.signal.aborted || this.destroying || this.options.enabled === false) return;
    this.centerOnRender = true;
    this.activate('keyboard');
  }
  enable() { this.update({ enabled: true }); }
  disable() { this.update({ enabled: false }); }
  update(patch: ZoomixOptions) {
    if (this.signal.aborted || this.destroying) return;
    const zoomOn = this.zoomOn;
    if ('sideTarget' in patch && patch.sideTarget !== this.options.sideTarget) {
      this.close();
      if (this.options.sideTarget) this.resize.unobserve(this.options.sideTarget);
      if (patch.sideTarget) this.resize.observe(patch.sideTarget);
    }
    this.options = { ...this.options, ...patch };
    if (this.zoomOn !== zoomOn && this.input === 'mouse') this.close();
    if (this.options.enabled === false) this.close();
    this.changed();
    this.schedule();
  }
  private root!: Root;
  private options!: ZoomixOptions;
  private img: HTMLImageElement | null = null;
  private input?: Input;
  private abort = new AbortController();
  private mutations!: MutationObserver;
  private resize!: ResizeObserver;
  private attrs = new Map<string, string | null>();
  private addedClasses: string[] = [];
  private frame = 0;
  private generation = 0;
  private source = '';
  private asset?: HTMLImageElement;
  private loading = false;
  private view = layer('zoomix-view');
  private marker = layer('zoomix-mark');
  private anchoredTarget?: Target;
  private u = 0.5;
  private v = 0.5;
  private centerOnRender = false;
  private clientX = 0;
  private clientY = 0;
  private press?: { id: number; x: number; y: number; lastX: number; lastY: number; time: number; moved: boolean };
  private panX = 0;
  private panY = 0;
  private get zoomOn(): ZoomOn {
    return (this.options.zoomOn ?? this.root.dataset.zoomOn) === 'click' ? 'click' : 'hover';
  }

  constructor(root: HTMLElement, options: ZoomixOptions = {}) {
    const mounted = (root as Root)[instanceKey];
    if (mounted) return mounted;
    this.root = root;
    this.options = { ...options };
    this.root[instanceKey] = this;
    // A carousel may deep-clone a slide while its zoom layer is visible.
    for (const child of root.querySelectorAll(':scope > .zoomix-view, :scope > .zoomix-mark')) child.remove();
    root.classList.remove('zoomix-touch');
    for (const name of ['role', 'tabindex', 'aria-label', 'aria-pressed']) this.attrs.set(name, root.getAttribute(name));
    root.setAttribute('role', 'button');
    if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
    root.setAttribute('aria-pressed', 'false');
    for (const name of ['zoomix-root', ...(getComputedStyle(root).position === 'static' ? ['zoomix-anchor'] : [])]) {
      if (!root.classList.contains(name)) this.addedClasses.push(name);
      root.classList.add(name);
    }
    const opts = { signal: this.abort.signal };
    root.addEventListener('pointerenter', this.hover, opts);
    root.addEventListener('pointermove', this.move, opts);
    root.addEventListener('pointerdown', this.down, opts);
    root.addEventListener('pointerup', this.up, opts);
    root.addEventListener('pointercancel', this.cancel, opts);
    root.addEventListener('lostpointercapture', this.cancel, opts);
    root.addEventListener('pointerleave', e => {
      if (e.pointerType === 'mouse') {
        this.press = undefined;
        if (this.input === 'mouse') this.close();
      }
    }, opts);
    root.addEventListener('keydown', this.key, opts);
    root.addEventListener('blur', () => { if (this.input === 'keyboard') this.close(); }, opts);
    root.addEventListener('load', e => { if (e.target === this.img) this.invalidate(); }, { ...opts, capture: true });
    this.resize = new ResizeObserver(this.schedule);
    this.resize.observe(root);
    if (options.sideTarget) this.resize.observe(options.sideTarget);
    this.mutations = new MutationObserver(records => {
      if (records.some(r => r.type === 'attributes' ? r.target !== this.asset :
        [...r.addedNodes, ...r.removedNodes].some(n => n instanceof Element && (n.matches('img:not(.zoomix-detail), picture, source') || n.querySelector('img:not(.zoomix-detail)'))))) this.refresh();
    });
    this.mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes', 'data-zoom-src', 'media'] });
    this.refresh();
    this.lastState = JSON.stringify(this.getState());
  }

  refresh() {
    if (this.abort.signal.aborted) return;
    if (this.img) this.resize.unobserve(this.img);
    this.img = this.root.querySelector('img:not(.zoomix-detail)');
    if (this.img) this.resize.observe(this.img);
    if (!this.attrs.get('aria-label') && !this.root.hasAttribute('aria-labelledby')) {
      this.root.setAttribute('aria-label', this.img?.alt ? 'Увеличить: ' + this.img.alt : 'Увеличить изображение');
    }
    this.invalidate();
  }

  private invalidate() {
    this.generation++;
    this.loading = false;
    this.asset = undefined;
    this.source = '';
    const wasVisible = this.visible;
    this.view.remove();
    this.marker.remove();
    this.visible = false;
    this.effectiveMode = this.effectiveScale = null;
    this.changed();
    if (wasVisible) this.emit('close');
    this.schedule();
  }

  private schedule = () => {
    if (!this.signal.aborted && this.input && !this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  };

  private activate(input: Input) {
    if (this.signal.aborted || this.destroying || this.options.enabled === false) return;
    if (!this.input) {
      window.addEventListener('scroll', this.schedule, true);
      window.addEventListener('resize', this.schedule);
    }
    this.input = input;
    this.root.classList.toggle('zoomix-touch', input === 'touch');
    this.root.setAttribute('aria-pressed', 'true');
    this.changed();
    this.schedule();
  }

  private hover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons || (this.input && this.input !== 'mouse')) return;
    if (this.zoomOn === 'click' && !this.input) return;
    this.clientX = e.clientX;
    this.clientY = e.clientY;
    this.activate('mouse');
  };
  private down = (e: PointerEvent) => {
    if (this.options.enabled === false || this.signal.aborted) return;
    if (e.pointerType === 'mouse' && (this.zoomOn !== 'click' || e.button !== 0)) return;
    if (!e.isPrimary) { this.press = undefined; return; }
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, time: e.timeStamp, moved: false };
    if (e.pointerType !== 'mouse' && this.input === 'touch') {
      e.stopPropagation();
      this.root.setPointerCapture(e.pointerId);
    }
  };
  private move = (e: PointerEvent) => {
    if (this.options.enabled === false || this.signal.aborted) return;
    const p = this.press;
    if (p && p.id === e.pointerId) p.moved ||= Math.hypot(e.clientX - p.x, e.clientY - p.y) > 7;
    if (e.pointerType === 'mouse') { this.hover(e); return; }
    if (!p || p.id !== e.pointerId) return;
    if (this.input === 'touch' && p.moved) {
      this.panX += p.lastX - e.clientX;
      this.panY += p.lastY - e.clientY;
      this.schedule();
    }
    p.lastX = e.clientX;
    p.lastY = e.clientY;
  };
  private cancel = () => { this.press = undefined; };
  private up = (e: PointerEvent) => {
    if (this.options.enabled === false || this.signal.aborted) return;
    const p = this.press;
    this.press = undefined;
    if (!p || p.id !== e.pointerId || p.moved || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 7) return;
    if (e.pointerType === 'mouse') {
      if (this.zoomOn !== 'click' || e.button !== 0) return;
      const g = this.img && geometry(this.img);
      if (!g || !contains(g.visible, e.clientX, e.clientY)) return;
      if (this.input) this.close();
      else {
        this.clientX = e.clientX;
        this.clientY = e.clientY;
        this.activate('mouse');
      }
      return;
    }
    if (e.timeStamp - p.time > 350) return;
    if (this.input === 'touch') { this.close(); return; }
    const g = this.img && geometry(this.img);
    if (!g || !contains(g.visible, e.clientX, e.clientY)) return;
    this.u = (e.clientX - g.image.x) / g.image.w;
    this.v = (e.clientY - g.image.y) / g.image.h;
    this.activate('touch');
  };
  private key = (e: KeyboardEvent) => {
    if (this.options.enabled === false || this.signal.aborted) return;
    if (e.key === 'Escape' && this.input) { this.close(); e.preventDefault(); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (this.input) this.close();
      else {
        if (!this.img) return;
        // A lazy preview may still be decoding. Centre once its geometry exists.
        this.centerOnRender = true;
        this.activate('keyboard');
      }
    } else if (this.input === 'keyboard' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      this.u = clamp(this.u + (Number(e.key === 'ArrowRight') - Number(e.key === 'ArrowLeft')) * 0.1, 0, 1);
      this.v = clamp(this.v + (Number(e.key === 'ArrowDown') - Number(e.key === 'ArrowUp')) * 0.1, 0, 1);
      this.schedule();
    }
  };

  private prepare(img: HTMLImageElement) {
    const preview = original(img);
    const url = img.dataset.zoomSrc || preview;
    const signature = JSON.stringify([url, preview]);
    if (this.source !== signature) { this.invalidate(); this.source = signature; }
    if (this.asset || this.loading || !url || !this.input || this.signal.aborted) return;
    this.loading = true;
    const version = this.generation;
    this.changed();
    this.emit('loadstart', { source: url, requestedSource: url, fallback: false });
    if (version !== this.generation || this.signal.aborted) return;
    let fallback = false;
    const request = load(url).catch(err => {
      if (version !== this.generation || this.signal.aborted) throw err;
      fallback = url !== preview && !!preview;
      this.emit('error', { source: url, requestedSource: url, fallback });
      if (fallback && version === this.generation) return load(preview);
      throw err;
    });
    request.then(asset => {
      if (version !== this.generation || this.signal.aborted) return;
      this.loading = false;
      this.asset = asset;
      asset.className = 'zoomix-detail';
      asset.alt = '';
      asset.draggable = false;
      this.view.replaceChildren(asset);
      this.changed();
      this.emit('load', { source: fallback ? preview : url, requestedSource: url, fallback });
      this.schedule();
    }, () => {
      if (version !== this.generation || this.signal.aborted) return;
      this.loading = false;
      if (fallback) this.emit('error', { source: preview, requestedSource: url, fallback: true });
      this.close();
    });
  }

  private render() {
    const img = this.img;
    const g = img && geometry(img);
    if (img && !img.complete && !g) return;
    if (!g || !img || g.visible.w <= 0 || g.visible.h <= 0) { this.close(); return; }
    const { image, visible } = g;
    if (this.centerOnRender) {
      this.u = (visible.x + visible.w / 2 - image.x) / image.w;
      this.v = (visible.y + visible.h / 2 - image.y) / image.h;
      this.centerOnRender = false;
    }
    if (this.input === 'mouse') {
      if (!contains(visible, this.clientX, this.clientY)) { this.close(); return; }
      this.u = (this.clientX - image.x) / image.w;
      this.v = (this.clientY - image.y) / image.h;
    }
    this.prepare(img);
    const detail = this.asset;
    if (!detail || !this.input || this.signal.aborted) return;
    const requested = this.options.scale ?? Number(this.root.dataset.zoomScale || 2);
    const scale = Math.min(Number.isFinite(requested) ? requested : 2, detail.naturalWidth / image.w, detail.naturalHeight / image.h);
    if (scale <= 1) { this.close(); return; }

    let mode = this.input === 'touch' ? 'inner' : this.options.mode || this.root.dataset.zoomix || 'inner';
    let box = { ...visible };
    let parent = this.root as HTMLElement;
    let fixed = false;
    if (mode === 'side') {
      const target = this.options.sideTarget;
      if (target) {
        parent = target;
        if (this.anchoredTarget !== target) {
          const shared = target as Target;
          // Targets can be shared by independently mounted instances or bundles.
          if (shared[anchorKey] || getComputedStyle(target).position === 'static') {
            const state = shared[anchorKey] ??= { users: 0, added: !target.classList.contains('zoomix-anchor') };
            state.users++;
            target.classList.add('zoomix-anchor');
            this.anchoredTarget = shared;
          }
        }
        const rect = target.getBoundingClientRect();
        box = { x: rect.left + target.clientLeft, y: rect.top + target.clientTop, w: target.clientWidth, h: target.clientHeight };
      } else {
        const right = visible.x + visible.w + 12;
        const left = visible.x - visible.w - 12;
        if (right + box.w <= document.documentElement.clientWidth || left >= 0) {
          box.x = right + box.w <= document.documentElement.clientWidth ? right : left;
          box.h = Math.min(box.h, window.innerHeight);
          box.y = clamp(box.y, 0, window.innerHeight - box.h);
          parent = document.body;
          fixed = true;
        } else mode = 'inner';
      }
    }
    this.view.className = 'zoomix-view zoomix-' + mode;
    if (this.view.parentElement !== parent) parent.append(this.view);
    const sx = image.w * scale, sy = image.h * scale;
    const pointX = clamp(image.x + this.u * image.w, visible.x, visible.x + visible.w);
    const pointY = clamp(image.y + this.v * image.h, visible.y, visible.y + visible.h);
    if (mode === 'lens') {
      this.view.style.width = this.view.style.height = '';
      box.w = Math.min(this.view.offsetWidth, visible.w);
      box.h = Math.min(this.view.offsetHeight, visible.h);
      box.x = clamp(pointX - box.w / 2, visible.x, visible.x + visible.w - box.w);
      box.y = clamp(pointY - box.h / 2, visible.y, visible.y + visible.h - box.h);
    }
    box.w = Math.min(box.w, sx);
    box.h = Math.min(box.h, sy);
    this.view.style.position = fixed ? 'fixed' : 'absolute';
    place(this.view, fixed ? box : localBox(box, parent));
    const follows = this.input === 'mouse' && mode !== 'side';
    const anchorX = follows ? pointX - box.x : box.w / 2;
    const anchorY = follows ? pointY - box.y : box.h / 2;
    const cropX = clamp(this.u * sx - anchorX + this.panX, 0, sx - box.w);
    const cropY = clamp(this.v * sy - anchorY + this.panY, 0, sy - box.h);
    if (this.input === 'touch') {
      this.u = (cropX + anchorX) / sx;
      this.v = (cropY + anchorY) / sy;
    }
    this.panX = this.panY = 0;
    Object.assign(detail.style, { width: px(sx), height: px(sy), transform: 'translate3d(' + px(-cropX) + ',' + px(-cropY) + ',0)' });
    if (mode === 'side') {
      const x = Math.max(visible.x, image.x + cropX / scale);
      const y = Math.max(visible.y, image.y + cropY / scale);
      const w = Math.min(visible.x + visible.w, image.x + (cropX + box.w) / scale) - x;
      const h = Math.min(visible.y + visible.h, image.y + (cropY + box.h) / scale) - y;
      place(this.marker, localBox({ x, y, w, h }, this.root));
      if (!this.marker.isConnected) this.root.append(this.marker);
    } else this.marker.remove();
    const wasVisible = this.visible;
    this.visible = true;
    this.effectiveMode = mode as ZoomMode;
    this.effectiveScale = scale;
    this.changed();
    if (!wasVisible && this.visible && !this.signal.aborted) this.emit('open');
  }

  close() {
    if (this.abort.signal.aborted) return;
    const wasVisible = this.visible;
    this.visible = false;
    this.effectiveMode = this.effectiveScale = null;
    this.input = undefined;
    this.centerOnRender = false;
    this.press = undefined;
    this.panX = this.panY = 0;
    this.root.classList.remove('zoomix-touch');
    this.root.setAttribute('aria-pressed', 'false');
    this.view.remove();
    this.marker.remove();
    const target = this.anchoredTarget;
    if (target) {
      const state = target[anchorKey];
      if (state && --state.users === 0) {
        if (state.added) target.classList.remove('zoomix-anchor');
        delete target[anchorKey];
      }
    }
    this.anchoredTarget = undefined;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.removeEventListener('scroll', this.schedule, true);
    window.removeEventListener('resize', this.schedule);
    this.changed();
    if (wasVisible) this.emit('close');
  }

  destroy() {
    if (this.abort.signal.aborted || this.destroying) return;
    this.destroying = true;
    this.close();
    this.generation++;
    this.loading = false;
    this.asset = undefined;
    this.view.replaceChildren();
    this.abort.abort();
    this.resize.disconnect();
    this.mutations.disconnect();
    this.root.classList.remove(...this.addedClasses);
    for (const [name, value] of this.attrs) {
      if (value === null) this.root.removeAttribute(name);
      else this.root.setAttribute(name, value);
    }
    delete this.root[instanceKey];
    this.changed();
    this.emit('destroy');
    this.events.clear();
  }
}
export default Zoomix;

export interface ZoomixScopeOptions {
  selector: string;
  options?: ZoomixOptions | ((element: HTMLElement) => ZoomixOptions);
}
export interface ZoomixScopeEvent {
  type: ZoomixEventType | 'mount' | 'unmount';
  scope: ZoomixScope;
  element: HTMLElement;
  instance?: Zoomix;
  state?: ZoomixState;
  source?: string;
  requestedSource?: string;
  fallback?: boolean;
}
const scopeKey = Symbol.for('zoomix.scope.v1');
const ownerKey = Symbol.for('zoomix.owner.v1');
const scopesKey = Symbol.for('zoomix.scopes.v1');
type ScopeRoot = HTMLElement & { [scopeKey]?: ZoomixScope; [ownerKey]?: ZoomixScope };
type ScopeDocument = Document & { [scopesKey]?: { scopes: Set<ZoomixScope>; stop: () => void } };

export class ZoomixScope {
  private abort = new AbortController();
  private events = new Events<ZoomixScopeEvent>();
  private instances = new Map<HTMLElement, { zoom: Zoomix; off: (() => void)[] }>();
  private patch: ZoomixOptions = {};
  private destroying = false;
  get signal() { return this.abort.signal; }
  constructor(readonly element: HTMLElement, private config: ZoomixScopeOptions) {
    const existing = Zoomix.getScope(element);
    if (existing) return existing;
    element.querySelectorAll(config.selector); // Validate before claiming ownership.
    const candidates = this.candidates();
    for (const node of candidates) this.check(node);
    (element as ScopeRoot)[scopeKey] = this;
    const doc = document as ScopeDocument;
    if (!doc[scopesKey]) {
      const scopes = new Set<ZoomixScope>();
      const stop = watchDOM(() => {
        // Release every former owner before any destination mounts moved photos.
        for (const scope of [...scopes]) {
          if (!scope.element.isConnected) scope.destroy();
          else scope.prune();
        }
        for (const scope of [...scopes]) scope.sync();
      });
      doc[scopesKey] = { scopes, stop };
    }
    doc[scopesKey]!.scopes.add(this);
    try { this.sync(); } catch (error) { this.destroy(); throw error; }
  }
  private candidates() {
    return [...(this.element.matches(this.config.selector) ? [this.element] : []),
      ...this.element.querySelectorAll<HTMLElement>(this.config.selector)];
  }
  private check(node: HTMLElement) {
    if ((node as ScopeRoot)[ownerKey] && (node as ScopeRoot)[ownerKey] !== this)
      throw new Error('Zoomix: overlapping scope ownership');
    if (node.hasAttribute('data-zoomix')) throw new Error('Zoomix: managed photos must not use data-zoomix');
  }
  private release(node: HTMLElement) {
    const entry = this.instances.get(node);
    if (!entry) return;
    this.instances.delete(node);
    delete (node as ScopeRoot)[ownerKey];
    entry.zoom.destroy();
    entry.off.forEach(off => off());
    this.events.emit({ type: 'unmount', scope: this, element: node, instance: entry.zoom, state: entry.zoom.getState() });
  }
  private prune() {
    for (const node of this.instances.keys()) {
      if (!this.element.contains(node) || !node.matches(this.config.selector) || !Zoomix.get(node)) this.release(node);
    }
  }
  private sync() {
    if (this.signal.aborted || this.destroying) return;
    for (const node of this.candidates()) {
      if (this.signal.aborted || this.destroying) break;
      if (this.instances.has(node)) continue;
      this.check(node);
      const options = typeof this.config.options === 'function' ? this.config.options(node) : this.config.options;
      const zoom = new Zoomix(node, { ...options, ...this.patch });
      if (Zoomix.get(node) === zoom) zoom.update({ ...options, ...this.patch });
      (node as ScopeRoot)[ownerKey] = this;
      const off = (['statechange', 'open', 'close', 'loadstart', 'load', 'error', 'destroy'] as ZoomixEventType[])
        .map(type => zoom.on(type, event => {
          this.events.emit({ ...event, scope: this });
          if (type === 'destroy' && this.instances.get(node)?.zoom === zoom) this.release(node);
        }));
      this.instances.set(node, { zoom, off });
      this.events.emit({ type: 'mount', scope: this, element: node, instance: zoom, state: zoom.getState() });
    }
  }
  getInstances() { return [...this.instances.values()].map(entry => entry.zoom); }
  on(type: ZoomixScopeEvent['type'], handler: (event: ZoomixScopeEvent) => void, options?: SubscriptionOptions) {
    return this.signal.aborted ? () => {} : this.events.on(type, handler, options);
  }
  refresh() {
    if (this.signal.aborted || this.destroying) return;
    this.prune(); this.sync();
    for (const zoom of this.getInstances()) zoom.refresh();
  }
  update(patch: ZoomixOptions) {
    if (this.signal.aborted || this.destroying) return;
    this.patch = { ...this.patch, ...patch };
    for (const zoom of this.getInstances()) zoom.update(patch);
  }
  close() { for (const zoom of this.getInstances()) zoom.close(); }
  enable() { this.update({ enabled: true }); }
  disable() { this.update({ enabled: false }); }
  destroy() {
    if (this.signal.aborted || this.destroying) return;
    this.destroying = true;
    this.abort.abort();
    for (const node of [...this.instances.keys()]) this.release(node);
    delete (this.element as ScopeRoot)[scopeKey];
    const doc = document as ScopeDocument;
    const shared = doc[scopesKey];
    shared?.scopes.delete(this);
    if (shared && !shared.scopes.size) { shared.stop(); delete doc[scopesKey]; }
    this.events.emit({ type: 'destroy', scope: this, element: this.element });
    this.events.clear();
  }
}

