// InSales snippet.js integration helpers. No dependency on EventBus in Zoomix.
// Mark photo wrappers with .js-product-zoom, without data-zoomix.
// Call these helpers once per element from $widget.each((_, root) => ...).
function subscribe(scope, event, callback) {
  // EventBus can synchronously replay its last event: prepare state first.
  scope.signal.addEventListener('abort', () => EventBus.unsubscribe(event, callback), { once: true });
  EventBus.subscribe(event, callback);
  if (scope.signal.aborted) EventBus.unsubscribe(event, callback);
}

function mountProductGallery(root, slider) {
  root.zoomixCleanup?.();
  const scope = Zoomix.mount(root, {
    selector: '.js-product-zoom',
    options: { mode: 'side', scale: 2, sideTarget: root.querySelector('.zoom-panel') }
  });
  root.zoomixCleanup = () => scope.destroy();
  const close = () => scope.close();
  // Splide: close before transitions / dragging; use equivalent events for tvist.
  slider?.on('move.zoomix drag.zoomix', close);
  scope.signal.addEventListener('abort', () => slider?.off('move.zoomix drag.zoomix'), { once: true });
  subscribe(scope, 'change_variant:insales:product', data => {
    const form = data?.action?.product?.[0];
    if (!form || !root.contains(form)) return;
    scope.close();
    // Your existing variant handler replaces its own slides.
    // The scope automatically detects inserted / removed photo wrappers.
  });
  const itemId = root.getAttribute('data-widget-drop-item-id');
  for (const event of ['widget:input-setting:insales:system:editor', 'widget:change-setting:insales:system:editor']) {
    subscribe(scope, event, data => {
      if (itemId == null || String(data?.widget_item_id) !== itemId) return;
      if (data.setting_name === 'zoom-scale') scope.update({ scale: Number(data.value) });
    });
  }
  return scope;
}

function mountAjaxList(root) {
  root.zoomixCleanup?.();
  const scope = Zoomix.mount(root, { selector: '.js-product-zoom', options: { mode: 'inner' } });
  root.zoomixCleanup = () => scope.destroy();
  // All present and future cards are covered by one subscription.
  scope.on('open', ({ element }) => element.closest('.product-preview')?.classList.add('is-zooming'));
  scope.on('close', ({ element }) => element.closest('.product-preview')?.classList.remove('is-zooming'));
  // AJAX inserts wrappers with .js-product-zoom; no EventBus init subscription needed.
  return scope;
}

function mountQuickView(modalRoot) {
  modalRoot.zoomixCleanup?.();
  const scope = Zoomix.mount(modalRoot, { selector: '.js-product-zoom', options: { mode: 'inner' } });
  modalRoot.zoomixCleanup = () => scope.destroy();
  return {
    scope,
    onClose() { scope.close(); }, // Hide and reopen: preserve the scope.
    removeForm(form) {
      // If the whole scope is being removed, destroy before changing DOM.
      scope.destroy();
      form.remove();
    }
  };
}

