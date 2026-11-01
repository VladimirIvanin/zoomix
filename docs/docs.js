import Zoomix from '../dist/zoomix.js';

const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
    if (event.key === 'Home') next = tabs[0];
    if (event.key === 'End') next = tabs.at(-1);
    if (!next) return;
    event.preventDefault();
    selectTab(next);
    next.focus();
  });
});

document.querySelectorAll('.copy').forEach(button => {
  button.addEventListener('click', async () => {
    const code = button.closest('.code-block').querySelector('pre code');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Скопировано';
      document.querySelector('#copy-status').textContent = 'Код скопирован в буфер обмена.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Код выделен';
      document.querySelector('#copy-status').textContent = 'Не удалось скопировать автоматически. Код выделен — используйте команду копирования.';
    }
    setTimeout(() => { button.textContent = 'Копировать'; }, 2400);
  });
});

const descriptions = {
  inner: 'Увеличение внутри фотографии. Подходит для компактных карточек товара.',
  side: 'Детали в отдельном окне рядом. Исходная фотография остаётся перед глазами.',
  lens: 'Круглая лупа следует за курсором. Рассмотрите фактуру и небольшие детали.',
};
const photo = document.querySelector('#demo-photo');
const sideRatio = document.querySelector('#side-ratio');
const sidePanel = document.querySelector('.demo-description');
const demoZoom = new Zoomix(photo, {
  sideTarget: sidePanel,
  sideAspectRatio: Number(sideRatio.value),
});
function syncSideRatio() {
  const ratio = sideRatio.value ? Number(sideRatio.value) : null;
  demoZoom.update({ sideAspectRatio: ratio });
  sidePanel.style.setProperty('--demo-side-ratio', ratio ?? 'auto');
  const mode = photo.dataset.zoomix;
  document.querySelector('.demo-stage').dataset.demoMode = mode;
  document.querySelector('#mode-code').textContent = `data-zoomix="${mode}"` +
    (mode === 'side' && ratio ? ` data-zoom-side-aspect-ratio="${ratio}"` : '');
}
sideRatio.addEventListener('change', syncSideRatio);
syncSideRatio();
document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    demoZoom.close();
    photo.dataset.zoomix = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelector('#mode-description').textContent = descriptions[button.dataset.mode];
    document.querySelector('.side-ratio-control').hidden = button.dataset.mode !== 'side';
    syncSideRatio();
  });
});

const contents = document.querySelector('.contents');
const mobile = matchMedia('(max-width: 720px)');
function syncContents() { contents.open = !mobile.matches; }
syncContents();
mobile.addEventListener('change', syncContents);
const links = [...document.querySelectorAll('.contents nav a')];
links.forEach(link => link.addEventListener('click', () => {
  if (mobile.matches) contents.open = false;
}));
const sections = links.map(link => document.querySelector(link.hash));
let scheduled = false;
function updateCurrentSection() {
  let active = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= 140) active = section;
  }
  for (const link of links) {
    if (link.hash === `#${active.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  scheduled = false;
}
window.addEventListener('scroll', () => {
  if (!scheduled) { scheduled = true; requestAnimationFrame(updateCurrentSection); }
}, { passive: true });
updateCurrentSection();
