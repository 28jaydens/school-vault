(() => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('school-vault-theme');
  const preferredDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = savedTheme || (preferredDark ? 'dark' : 'light');

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('school-vault-theme', root.dataset.theme);
    });
  });

  document.querySelectorAll('[data-menu-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      document.querySelectorAll('[data-menu-toggle]').forEach((toggle) => toggle.setAttribute('aria-expanded', String(open)));
    });
  });

  const dialog = document.getElementById('search-dialog');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  let index = null;

  const loadIndex = async () => {
    if (!index) {
      const response = await fetch(`${window.SITE_ROOT}search-index.json`);
      index = await response.json();
    }
    return index;
  };

  const escapeHtml = (value) => value.replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  const runSearch = async () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      results.innerHTML = '<p class="search-help">Type a title, topic, class, or keyword.</p>';
      return;
    }
    const words = query.split(/\s+/).filter(Boolean);
    const notes = await loadIndex();
    const ranked = notes.map((note) => {
      const title = note.title.toLowerCase();
      const path = note.path.toLowerCase();
      const excerpt = note.excerpt.toLowerCase();
      const tags = note.tags.join(' ').toLowerCase();
      let score = 0;
      words.forEach((word) => {
        if (title.includes(word)) score += 8;
        if (path.includes(word)) score += 4;
        if (tags.includes(word)) score += 3;
        if (excerpt.includes(word)) score += 1;
      });
      return {note, score};
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title)).slice(0, 30);

    if (!ranked.length) {
      results.innerHTML = '<p class="search-help">No notes matched that search.</p>';
      return;
    }
    results.innerHTML = ranked.map(({note}) => `
      <a class="search-result" href="${window.SITE_ROOT}${note.url}">
        <strong>${escapeHtml(note.title)}</strong>
        <small>${escapeHtml(note.path)}</small>
        <span>${escapeHtml(note.excerpt)}</span>
      </a>`).join('');
  };

  const openSearch = async () => {
    if (!dialog.open) dialog.showModal();
    input.focus();
    try { await loadIndex(); } catch (error) {
      results.innerHTML = '<p class="search-help">Search is temporarily unavailable.</p>';
    }
  };

  document.querySelectorAll('[data-open-search]').forEach((button) => button.addEventListener('click', openSearch));
  input.addEventListener('input', runSearch);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('menu-open')) {
      document.body.classList.remove('menu-open');
      document.querySelectorAll('[data-menu-toggle]').forEach((toggle) => toggle.setAttribute('aria-expanded', 'false'));
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
    if (event.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) {
      event.preventDefault();
      openSearch();
    }
  });
})();

