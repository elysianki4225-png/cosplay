/* 打码图的解锁逻辑。单独一个文件是因为它改的是 DOM 安全边界，我不想把它埋进 main.js 的滚动监听里。
   解锁状态只存 sessionStorage：关掉标签页自动回到打码态，公共场合借用电脑不会被顺手看到。
   URL 带 #unlocked 时整页直接展开（自己看图用，别把这个链接发出去）。 */
(() => {
  const K = 'cosplay-gate';
  const session = {
    get on() { try { return sessionStorage.getItem(K) === '1'; } catch (e) { return false; } },
    set on(v) { try { v ? sessionStorage.setItem(K, '1') : sessionStorage.removeItem(K); } catch (e) {} },
  };
  const root = document.documentElement;
  root.classList.add('js');

  const nodes = [...document.querySelectorAll('.gate')];
  if (!nodes.length) return;

  function unlock(g) {
    const src = g.dataset.raw;
    if (!src) return;
    let img = g.querySelector('img.raw');
    if (!img) {
      img = new Image();
      img.className = 'raw';
      img.alt = g.dataset.alt || '';
      img.decoding = 'async';
      g.querySelector('.gate-frame').append(img);
    }
    if (img.src !== new URL(src, location.href).href) img.src = src;
    g.dataset.locked = '0';
    const btn = g.querySelector('.gate-btn');
    if (btn) {
      btn.innerHTML = '<svg class="ic"><use href="#i-eye-off"/></svg><span>收起</span>';
      btn.dataset.act = 'hide';
    }
    // 说明文字解锁后才出现，未解锁时列表/搜索引擎读到的只有"已打码"
    const cap = g.querySelector('.gate-cap');
    if (cap) { if (!cap.textContent && g.dataset.caption) cap.textContent = g.dataset.caption; cap.hidden = false; }
  }
  function lock(g) {
    g.dataset.locked = '1';
    const btn = g.querySelector('.gate-btn');
    if (btn) {
      btn.innerHTML = '<svg class="ic"><use href="#i-eye"/></svg><span>点击查阅原图</span>';
      btn.dataset.act = 'show';
    }
    const cap = g.querySelector('.gate-cap'); if (cap) cap.hidden = true;
  }
  nodes.forEach(g => {
    const btn = g.querySelector('.gate-btn');
    btn?.addEventListener('click', () => {
      if (g.dataset.locked === '1') { unlock(g); session.on = true; }
      else { lock(g); session.on = false; nodes.forEach(x => x !== g && x.dataset.locked === '0' && lock(x)); }
    });
    // 锁标志画在图上，纯 CSS 也能看出"这里是被遮住的"
    const tag = document.createElement('div');
    tag.className = 'gate-lock';
    tag.innerHTML = '<svg class="ic"><use href="#i-lock"/></svg><span>mosaic</span>';
    g.querySelector('.gate-frame')?.append(tag);
  });

  if (session.on || location.hash === '#unlocked') nodes.forEach(unlock);
  addEventListener('hashchange', () => {
    if (location.hash === '#unlocked') nodes.forEach(unlock);
    else if (location.hash === '#locked') { nodes.forEach(lock); session.on = false; }
  });
})();
