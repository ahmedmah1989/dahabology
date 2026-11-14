/* Small interface helpers shared by the new screens.
   data-set="<select id>" data-value="x"  → a round or segmented button that drives a hidden <select>
   data-open="<details id>"               → opens that section and scrolls to it */
(function () {
  'use strict';
  const sync = () => document.querySelectorAll('[data-set]').forEach(b => {
    const s = document.getElementById(b.dataset.set);
    if (s) b.setAttribute('aria-pressed', String(s.value === b.dataset.value));
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-set]');
    if (b) {
      const s = document.getElementById(b.dataset.set);
      if (s && s.value !== b.dataset.value) {
        s.value = b.dataset.value;
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sync();
    }
    const o = e.target.closest('[data-open]');
    if (o) {
      const d = document.getElementById(o.dataset.open);
      if (d) { d.open = true; d.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'center' }); }
    }
  });
  document.addEventListener('input', sync);
  sync();
})();
