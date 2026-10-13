/* 站点头脑。全部渐进增强：删掉这个文件页面也应该能正常读。 */
(() => {
  const BASE = window.BASE || '/';
  const root = document.documentElement;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ---------- 主题 ----------
  // 必须和 <head> 里那段内联脚本读的 key 一模一样，否则切完主题一翻页就变回系统主题
  const THEME_KEY = 'cosplay-blog-theme';
  const mql = matchMedia('(prefers-color-scheme: dark)');
  function apply(t) {
    if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    document.querySelectorAll('[data-theme-btn]').forEach(b => {
      const on = b.dataset.themeBtn === t;
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('span').textContent = on ? themeLabel(t) : themeLabel(t, true);
    });
  }
  function themeLabel(t, idle) {
    const m = { light: '亮色', dark: '暗色', auto: '跟随系统' };
    return idle ? `切换到${m[t]}` : `当前：${m[t]}`;
  }
  // 系统偏好变化只在没手动锁定时跟随
  mql.addEventListener?.('change', () => { if (!store.get(THEME_KEY)) apply('auto'); });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-btn]');
    if (!btn) return;
    const next = btn.dataset.themeBtn;
    if (next === 'auto') store.del(THEME_KEY); else store.set(THEME_KEY, next);
    apply(next);
  });
  apply(store.get(THEME_KEY) || 'auto');

  // ---------- 图标 sprite ----------
  // 构建时会内联一份；这段只在 file:// 直接打开源文件时兜底
  if (!document.getElementById('sprite-host')) {
    fetch(BASE + 'assets/icons.svg').then(r => r.text()).then(txt => {
      const d = document.createElement('div');
      d.id = 'sprite-host'; d.hidden = true;
      d.innerHTML = txt.replace(/<svg([^>]*)>/, '<svg$1 style="display:none">');
      document.body.prepend(d);
    }).catch(() => {});
  }

  // ---------- 移动端抽屉 ----------
  const navToggle = document.querySelector('[data-nav-toggle]');
  navToggle?.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.body.classList.remove('nav-open');
      navToggle?.setAttribute('aria-expanded', 'false');
      closeSearch();
    }
  });

  // ---------- 阅读进度 ----------
  const bar = document.querySelector('.progress > i');
  const tocLinks = [...document.querySelectorAll('.toc a')];
  const heads = tocLinks.map(a => document.getElementById(a.hash.slice(1))).filter(Boolean);
  const toTop = document.getElementById('toTop');
  let raf = 0;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = scrollY, max = document.body.scrollHeight - innerHeight;
      if (bar) bar.style.width = (max > 0 ? Math.min(y / max, 1) * 100 : 0) + '%';
      // 600px 之后再冒出来，一屏内容的话没必要挡右下角
      toTop?.toggleAttribute('data-show', y > 600);
      if (heads.length) {
        let cur = -1;
        for (let i = 0; i < heads.length; i++) if (heads[i].getBoundingClientRect().top < 120) cur = i;
        tocLinks.forEach((a, i) => a.classList.toggle('active', i === cur));
      }
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  toTop?.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  // ---------- 站内搜索 ----------
  let idx = null;
  const panel = document.querySelector('[data-search-panel]');
  const input = panel?.querySelector('input');
  const hits = panel?.querySelector('.search-hits');
  let sel = -1;

  function closeSearch() { if (panel?.hasAttribute('data-open')) { panel.removeAttribute('data-open'); input?.blur(); } }
  async function loadIdx() {
    if (idx) return idx;
    try { idx = await (await fetch(BASE + 'search.json')).json(); } catch (e) { idx = []; }
    return idx;
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-search-btn]')) return;
    e.preventDefault();
    const open = panel.hasAttribute('data-open');
    panel.toggleAttribute('data-open', !open);
    if (!open) { loadIdx(); input?.focus(); }
  });
  document.addEventListener('click', (e) => { if (panel && !e.target.closest('.search-panel') && !e.target.closest('[data-search-btn]')) closeSearch(); });

  function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function hi(text, q) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text.slice(0, 110));
    return esc(text.slice(Math.max(0, i - 28), i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, i + 84));
  }
  // 中文没空格，所以用「子串命中 + 命中次数」的土办法打分，够这个规模用了
  function score(hay, q) {
    hay = hay.toLowerCase(); q = q.toLowerCase();
    let s = 0, from = 0;
    while (true) { const i = hay.indexOf(q, from); if (i < 0) break; s += i < 40 ? 3 : 1; from = i + q.length; if (s > 40) break; }
    return s;
  }
  input?.addEventListener('input', () => {
    const q = input.value.trim();
    if (q.length < 1) { hits.innerHTML = '<div class="search-empty">输入关键词，或按方向键选择。</div>'; sel = -1; return; }
    const rows = (idx || []).map(d => ({ ...d, s: score(d.t, q) * 4 + score(d.x, q) + score(d.tags || '', q) * 2 }))
      .filter(d => d.s > 0).sort((a, b) => b.s - a.s).slice(0, 8);
    sel = rows.length ? 0 : -1;
    hits.innerHTML = rows.length
      ? rows.map((d, i) => `<a href="${BASE}${d.u}" aria-selected="${i === 0}"><b>${hi(d.t, q)}</b><p>${hi(d.x, q)}</p></a>`).join('')
      : `<div class="search-empty">没有命中「${esc(q)}」。试试 <kbd>/</kbd> 换个词。</div>`;
  });
  input?.addEventListener('keydown', (e) => {
    const list = [...hits.querySelectorAll('a')];
    if (!list.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list.forEach((a, i) => { a.setAttribute('aria-selected', String(i === sel)); if (i === sel) a.scrollIntoView({ block: 'nearest' }); });
    } else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); list[sel].click(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); panel?.toggleAttribute('data-open', true); loadIdx(); input?.focus();
    }
  });

  // ---------- 图片 lightbox ----------
  const lb = document.querySelector('.lightbox');
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-zoom]');
    if (!t) return;
    e.preventDefault();
    lb.querySelector('img').src = t.href || t.querySelector('img')?.src;
    lb.querySelector('p').textContent = t.getAttribute('data-caption') || '';
    lb.setAttribute('data-open', '');
  });
  lb?.addEventListener('click', (e) => { if (e.target.closest('[data-lb-close]') || e.target === lb) lb.removeAttribute('data-open'); });

  // ---------- 留置计时器 ----------
  // 只是本地提醒，不做任何"安全"承诺：真正该听的是身体，不是这块表。
  const T = document.querySelector('[data-timer]');
  if (T) {
    const K = 'cosplay-timer-v1', CAP = 23 * 3600, REST_MIN = 3600;
    const read = () => { try { return JSON.parse(store.get(K) || 'null'); } catch (e) { return null; } };
    let s = read() || { mode: 'rest', t0: 0 };
    const clock = T.querySelector('[data-clock]'), state = T.querySelector('[data-state]'), fill = T.querySelector('[data-fill]');

    function fmt(sec) {
      sec = Math.max(0, Math.floor(sec));
      const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    }
    function tick() {
      const el = (Date.now() - s.t0) / 1000;
      if (s.mode === 'wear') {
        clock.textContent = fmt(el);
        fill.style.width = Math.min(el / CAP, 1) * 100 + '%';
        T.classList.toggle('warn', el > CAP * 0.85 && el <= CAP);
        T.classList.toggle('over', el > CAP);
        state.textContent = el > CAP
          ? `超出参考上限 ${fmt(el - CAP)} — 该停了，别跟自己的身体讨价还价`
          : `距参考上限 23:00:00 还有 ${fmt(CAP - el)}`;
      } else {
        clock.textContent = '—';
        fill.style.width = '0%'; T.classList.remove('warn', 'over');
        state.textContent = '空置休息中（建议每天不少于 1 小时）';
      }
    }
    function render() { T.dataset.mode = s.mode; tick(); }
    setInterval(tick, 1000);
    T.addEventListener('click', (e) => {
      const b = e.target.closest('[data-timer-act]'); if (!b) return;
      const a = b.dataset.timerAct;
      if (a === 'start') s = { mode: 'wear', t0: Date.now() };
      else if (a === 'stop') s = { mode: 'rest', t0: Date.now() };
      else s = { mode: 'rest', t0: 0 };
      store.set(K, JSON.stringify(s)); render();
    });
    render();
  }
})();
