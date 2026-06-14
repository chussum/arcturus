/* Arcturus pages — staggered reveal + copy-to-clipboard. No dependencies. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Staggered scroll reveal
  const items = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => {
      el.classList.add('is-in');
    });
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    // stagger siblings that share a parent
    const groups = new Map();
    items.forEach((el) => {
      const group = groups.get(el.parentElement) ?? [];
      group.push(el);
      groups.set(el.parentElement, group);
    });
    groups.forEach((group) => {
      group.forEach((el, i) => {
        el.style.setProperty('--d', `${Math.min(i, 8) * 65}ms`);
        io.observe(el);
      });
    });
  }

  // Copy buttons on code blocks
  document.querySelectorAll('.codeblock').forEach((block) => {
    const pre = block.querySelector('pre');
    if (!pre || !navigator.clipboard) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'copy';
    btn.setAttribute('aria-label', 'Copy to clipboard');
    btn.addEventListener('click', async () => {
      const text = (pre.dataset.copy ?? pre.textContent).trim();
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'copied ✓';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'copy';
          btn.classList.remove('copied');
        }, 1600);
      } catch {
        /* clipboard unavailable (e.g. http) — leave the button as-is */
      }
    });
    block.appendChild(btn);
  });
})();
