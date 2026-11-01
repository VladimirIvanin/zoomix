import Splide from '@splidejs/splide';
import Swiper from 'swiper';
import Tvist from 'tvist';
import '@splidejs/splide/css';
import 'swiper/css';
import 'tvist/dist/tvist.css';
import './demo.css';
import '../dist/zoomix.css';
import Zoomix from '../dist/zoomix.js';

const adapters = {
  Splide: {
    classes: ['splide', 'splide__track', 'splide__list', 'splide__slide'],
    init(root, close) {
      const slider = new Splide(root, { type: 'loop', arrows: false, pagination: false, noDrag: '.zoomix-touch, .zoomix-touch *' });
      slider.on('move drag', close).mount();
      return { next: () => slider.go('>'), add: slide => slider.add(slide), index: () => slider.index };
    },
  },
  Swiper: {
    classes: ['swiper', '', 'swiper-wrapper', 'swiper-slide'],
    init(root, close) {
      const slider = new Swiper(root, { loop: true, noSwipingSelector: '.zoomix-touch', on: { slideChange: close, sliderFirstMove: close } });
      return { next: () => slider.slideNext(), add(slide) {
        slider.loopDestroy();
        slider.slidesEl.append(slide);
        slider.update();
        slider.loopCreate();
      }, index: () => slider.realIndex };
    },
  },
  tvist: {
    classes: ['tvist-v1', 'tvist-v1__track', 'tvist-v1__container', 'tvist-v1__slide'],
    init(root, close) {
      const slider = new Tvist(root, { loop: true, drag: true, focusableElements: 'input, textarea, select, [tabindex], .zoomix-touch *' });
      slider.on('beforeSlideChange', close).on('dragStart', close);
      return { next: () => slider.next(), add(slide) {
        root.querySelector('.tvist-v1__container').append(slide);
        slider.update();
      }, index: () => slider.activeIndex };
    },
  },
};

for (const [name, adapter] of Object.entries(adapters)) {
  const [base, track, list, item] = adapter.classes;
  const section = document.createElement('section');
  section.className = 'example';
  section.id = name.toLowerCase();
  section.innerHTML = `<h2>${name}</h2><div class="gallery ${base}">${track ? '<div class="' + track + '">' : ''}<div class="${list}"></div>${track ? '</div>' : ''}</div><nav><button data-next>Дальше →</button><button data-add>Добавить кадр</button></nav>`;
  document.querySelector('#galleries').append(section);
  let count = 0;
  function slide() {
    const el = document.createElement('div');
    el.className = item;
    const id = ++count;
    el.innerHTML = `<div class="sample"><div data-zoomix="side"><img draggable="false" src="${import.meta.env.BASE_URL}optic.svg?frame=${id}" alt="Объектив, кадр ${id}"></div><small>Кадр ${id}</small></div>`;
    return el;
  }
  section.querySelector('.' + list).append(slide(), slide(), slide(), slide());
  const gallery = section.querySelector('.gallery');
  const instances = new Map();
  function sync() {
    for (const [el, zoom] of instances) if (!gallery.contains(el)) { zoom.destroy(); instances.delete(el); }
    for (const el of gallery.querySelectorAll('[data-zoomix]')) if (!instances.has(el)) instances.set(el, new Zoomix(el));
  }
  function close() { for (const zoom of instances.values()) zoom.close(); }
  const controller = adapter.init(gallery, close);
  sync();
  new MutationObserver(sync).observe(gallery, { childList: true, subtree: true });
  section.querySelector('[data-next]').onclick = controller.next;
  section.querySelector('[data-add]').onclick = () => { close(); controller.add(slide()); sync(); };
  // Also expose the ordinary programmatic navigation entry point in this demo.
  section.galleryController = controller;
}
