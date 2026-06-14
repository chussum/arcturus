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

  // GitHub stars — fill the nav pill, cached in localStorage (1h TTL) to spare
  // the unauthenticated API rate limit. Fails silently to the "GitHub" fallback.
  const starEl = document.querySelector('[data-gh-stars]');
  if (starEl) {
    const REPO = 'chussum/arcturus';
    const CACHE_KEY = 'arcturus-gh-stars';
    const TTL = 60 * 60 * 1000;
    const fmt = (n) =>
      n >= 1000
        ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k'
        : String(n);

    // only replace the "GitHub" label once there's at least one star —
    // "★ 0" reads weaker than the plain label.
    const apply = (n) => {
      if (typeof n === 'number' && n > 0) starEl.textContent = fmt(n);
    };

    const cached = (() => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { v, t } = JSON.parse(raw);
        if (typeof v !== 'number' || Date.now() - t > TTL) return null;
        return v;
      } catch {
        return null;
      }
    })();

    if (cached != null) {
      apply(cached);
    } else {
      fetch(`https://api.github.com/repos/${REPO}`, {
        headers: { Accept: 'application/vnd.github+json' },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => {
          const n = data.stargazers_count;
          if (typeof n !== 'number') return;
          apply(n);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ v: n, t: Date.now() }));
          } catch {
            /* storage unavailable (private mode) — count still shown this visit */
          }
        })
        .catch(() => {
          /* offline / rate-limited — leave the "GitHub" fallback in place */
        });
    }
  }
})();
