(() => {
  const root = document.documentElement;
  const THEME_KEY = 'school-vault-theme';

  // ---------- theme
  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(theme === 'dark')));
  };
  try {
    applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  } catch (e) { applyTheme('light'); }
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      document.querySelectorAll('pre.mermaid[data-processed]').forEach(() => {}); // mermaid re-render needs reload
    });
  });

  // ---------- mobile menu
  const setMenu = (open) => {
    document.body.classList.toggle('menu-open', open);
    document.querySelectorAll('[data-menu-toggle]').forEach((t) => t.setAttribute('aria-expanded', String(open)));
  };
  document.querySelectorAll('[data-menu-toggle]').forEach((button) => {
    button.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  });

  // ---------- keep the active nav item in view
  const activeNav = document.querySelector('.vault-nav .nav-note.active');
  if (activeNav) {
    let group = activeNav.closest('details');
    while (group) { group.open = true; group = group.parentElement.closest('details'); }
    requestAnimationFrame(() => activeNav.scrollIntoView({ block: 'center' }));
  }

  // ---------- search
  const dialog = document.getElementById('search-dialog');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  let index = null;
  let selected = -1;

  const loadIndex = async () => {
    if (!index) {
      const response = await fetch(`${window.SITE_ROOT}search-index.json`);
      index = await response.json();
    }
    return index;
  };
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const highlight = (text, words) => {
    let out = escapeHtml(text);
    words.forEach((w) => {
      if (!w) return;
      out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
    });
    return out;
  };

  const runSearch = async () => {
    const query = input.value.trim().toLowerCase();
    selected = -1;
    if (!query) {
      results.innerHTML = '<p class="search-help">Type a title, topic, class, or keyword. Use ↑ ↓ and Enter.</p>';
      return;
    }
    const words = query.split(/\s+/).filter(Boolean);
    const notes = await loadIndex();
    const ranked = notes.map((note) => {
      const title = note.title.toLowerCase();
      const path = note.path.toLowerCase();
      const excerpt = note.excerpt.toLowerCase();
      const tags = (note.tags || []).join(' ').toLowerCase();
      const headings = (note.headings || []).join(' ').toLowerCase();
      let score = 0;
      let all = true;
      words.forEach((word) => {
        let hit = 0;
        if (title === word) hit += 20;
        if (title.startsWith(word)) hit += 6;
        if (title.includes(word)) hit += 8;
        if (path.includes(word)) hit += 3;
        if (tags.includes(word)) hit += 4;
        if (headings.includes(word)) hit += 3;
        if (excerpt.includes(word)) hit += 1;
        if (!hit) all = false;
        score += hit;
      });
      return { note, score: all ? score * 2 : score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title)).slice(0, 40);

    if (!ranked.length) {
      results.innerHTML = '<p class="search-help">No notes matched that search.</p>';
      return;
    }
    results.innerHTML = ranked.map(({ note }) => `
      <a class="search-result" href="${window.SITE_ROOT}${note.url}">
        <strong>${highlight(note.title, words)}</strong>
        <small>${escapeHtml(note.class || note.path.split('/')[0] || 'Vault')} · ${escapeHtml(note.path)}</small>
        <span>${highlight(note.excerpt, words)}</span>
      </a>`).join('');
  };

  const openSearch = async () => {
    if (!dialog.open) dialog.showModal();
    input.focus();
    input.select();
    try { await loadIndex(); } catch (error) {
      results.innerHTML = '<p class="search-help">Search is temporarily unavailable.</p>';
    }
  };

  document.querySelectorAll('[data-open-search]').forEach((button) => button.addEventListener('click', openSearch));
  input.addEventListener('input', runSearch);
  input.addEventListener('keydown', (event) => {
    const items = [...results.querySelectorAll('.search-result')];
    if (!items.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('selected', i === selected));
      items[selected].scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      (items[selected] || items[0]).click();
    }
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName) && !dialog.open) { event.preventDefault(); openSearch(); }
  });

  // ---------- table of contents highlighting
  const tocLinks = [...document.querySelectorAll('.toc-list a')];
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(tocLinks.map((a) => [decodeURIComponent(a.getAttribute('href').slice(1)), a]));
    const headings = [...map.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    let current = null;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          current = entry.target.id;
          tocLinks.forEach((a) => a.classList.toggle('active', map.get(current) === a));
        }
      });
    }, { rootMargin: '0px 0px -70% 0px', threshold: [0, 1] });
    headings.forEach((h) => observer.observe(h));
  }

  // ---------- copy buttons on code blocks
  document.querySelectorAll('.note-body pre:not(.mermaid)').forEach((pre) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText);
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = 'Copy'; }, 1400);
      } catch (e) { button.textContent = 'Failed'; }
    });
    pre.appendChild(button);
  });

  // ---------- image lightbox
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = '<img alt=""><button type="button" aria-label="Close">×</button>';
  document.body.appendChild(lightbox);
  const close = () => lightbox.classList.remove('open');
  lightbox.addEventListener('click', close);
  document.querySelectorAll('.note-media a').forEach((a) => {
    a.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      lightbox.querySelector('img').src = a.getAttribute('href');
      lightbox.classList.add('open');
    });
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  // ---------- timelines
  document.querySelectorAll('.auto-timeline').forEach((timeline) => {
    const search = timeline.querySelector('[data-timeline-search-input]');
    const unit = timeline.querySelector('[data-timeline-unit-filter]');
    const events = [...timeline.querySelectorAll('.timeline-event')];
    const filter = () => {
      const query = search.value.trim().toLowerCase();
      const selectedUnit = unit.value;
      events.forEach((item) => {
        const matchesText = !query || item.dataset.timelineSearch.includes(query);
        const matchesUnit = selectedUnit === '0' || item.dataset.timelineUnit === selectedUnit;
        item.hidden = !(matchesText && matchesUnit);
      });
    };
    search.addEventListener('input', filter);
    unit.addEventListener('change', filter);
  });
})();
