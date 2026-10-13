#!/usr/bin/env node
/* 静态站构建：src/*.md -> docs/*.html
   没上 markdown 库是有原因的：这站的语法闭集就那么几个，自己吞比装依赖再等 CI 快。
   用法: node build/build.js  (加 --serve 起个本地预览) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'docs');
const cfg = require(path.join(SRC, 'config.js'));

// Pages 项目页都在 /<repo>/ 下面，CI 里直接按仓库名推
const BASE = process.env.BASE_PATH || (process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : cfg.basePath || '/');

let slots = {};
try { slots = require(path.join(SRC, 'slots.json')); } catch (e) {}

/* ---------------- front matter ---------------- */
function splitFront(src) {
  if (!src.startsWith('---\n')) return ['', src];
  const end = src.indexOf('\n---', 4);
  if (end < 0) return ['', src];
  return [src.slice(4, end + 1), src.slice(end + 4).replace(/^\n/, '')];
}
function parseFm(txt) {
  const o = {};
  for (const line of txt.split('\n')) {
    const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      o[m[1]] = v.slice(1, -1).split(',').map(s => stripQuote(s.trim())).filter(Boolean);
    } else o[m[1]] = stripQuote(v);
  }
  return o;
}
const stripQuote = s => s.replace(/^["']|["']$/g, '');

/* ---------------- inline ---------------- */
function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = escHtml(s);
  // 图片单独走 figure/占位逻辑，这里只处理行内
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, cap) => img(alt, url, cap, false));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (m, text, url, title) => {
    if (/^\{\{slot:/.test(text.trim())) { const cap = /\{\{slot:([\w.-]+)\}\}/.exec(text); return slotHtml(cap[1], false); }
    const ext = /^(https?:)?\/\//.test(url) || url.startsWith('mailto:');
    const cls = ext ? ' class="ext"' : '';
    const rel = ext ? ' rel="noopener noreferrer" target="_blank"' : '';
    return `<a href="${url}"${cls}${rel}${title ? ` title="${title}"` : ''}>${text}</a>`;
  });
  s = s.replace(/\*\*\*(\S(?:.*?\S)?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, '<em>$1</em>');
  s = s.replace(/~~(\S(?:.*?\S)?)~~/g, '<del>$1</del>');
  s = s.replace(/\[!(\w+)\]/g, (_m, n) => `<sup class="fn-ref"><a href="#fn-${n.toLowerCase()}" id="fnref-${n.toLowerCase()}">${n}</a></sup>`);
  s = s.replace(/\^\^([^^]+)\^\^/g, '<mark>$1</mark>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  return s;
}

function img(alt, url, cap, block) {
  if (url.startsWith('ph:')) return placeholder(url.slice(3), alt, cap);
  const src = /^(https?:|data:)/.test(url) ? url : BASE + url.replace(/^\/+/, '');
  const f = `<figure class="${block ? 'shot-block' : ''}"><img src="${src}" alt="${alt}" loading="lazy"><figcaption>${cap || alt}</figcaption></figure>`;
  return block ? f : `<img src="${src}" alt="${alt}" loading="lazy">`;
}
function placeholder(label, alt, cap) {
  return `<div class="placeholder" role="img" aria-label="${alt || label}">
    <svg class="ic"><use href="#i-camera"/></svg>
    <div>图位 ${label || '未命名'} · 待实拍</div>
    <small>${escHtml(cap || '把图丢进 assets/images/ 后重新构建即可')}</small>
  </div>`;
}
// 图床/仓库路径统一从 slots.json 走，改图不用动正文
function slotHtml(key, block) {
  const s = slots[key];
  if (!s) return placeholder(key, '未登记的图位', '在 src/slots.json 里补一条');
  if (s.status !== 'ready') return placeholder(key, s.alt || key, s.caption);
  const src = /^(https?:|data:)/.test(s.src) ? s.src : BASE + s.src.replace(/^\/+/, '');
  const fig = `<figure class="shot"><a href="${src}" data-zoom data-caption="${escHtml(s.caption || '')}"><img src="${src}" alt="${escHtml(s.alt || key)}" loading="lazy"><figcaption>${escHtml(s.caption || '')}</figcaption></a></figure>`;
  return block ? fig : `<img src="${src}" alt="${escHtml(s.alt || key)}" loading="lazy">`;
}

/* ---------------- blocks ---------------- */
function slugify(t, used) {
  let base = t.toLowerCase()
    .replace(/[`*_~[\]()#."']/g, '')
    .replace(/[^\w\u4e00-\u9fa5- ]/g, '')
    .trim().replace(/\s+/g, '-');
  if (!base) base = 'sec';
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}


const CALLOUT_ICON = { info: 'i-gear', tip: 'i-shield', warn: 'i-alert', danger: 'i-stop', note: 'i-book' };

// 整块原样输出的 raw html（首页 hero、组件级结构）。用行级状态机而不是正则：
// 正则那版非贪婪会在第一个 </p> 收尾、贪婪又在最后一个 </section> 失控，两种坑都踩过。
const isHtmlLine = l => /^<([a-zA-Z][\w-]*)/.test(l) || /^<!--/.test(l);
// 只数块级标签。inline（<b>/<span>/<p> 混写一行）全跳过，否则一行内 depth 就被清零了
const INLINE_T = /^(a|b|i|em|strong|code|kbd|sup|sub|mark|small|span|br|hr|img|svg|path|circle|rect|use|u|s|del|abbr)$/i;
function rawBlockAt(lines, start) {
  const open = lines[start];
  if (/^<!--/.test(open)) { let j = start; while (j < lines.length && !lines[j].includes('-->')) j++; return j; }
  let depth = 0;
  for (let j = start; j < lines.length; j++) {
    for (const m of lines[j].matchAll(/<\/?([a-zA-Z][\w-]*)(?:\s[^>]*)?\/?>/g)) {
      if (INLINE_T.test(m[1])) continue;
      if (m[0][1] === '/') depth--;
      else if (!m[0].endsWith('/>') && !/^(meta|link|input|br|hr|img)$/i.test(m[1])) depth++;
    }
    if (j === start) { if (depth === 0) return start; continue; }
    if (depth <= 0) return j;
  }
  return lines.length - 1;
}

const BLOCK_START = /^\s*(#{1,6}\s|>\s?|([-+*]|\d+[.)])\s|```|<\/?(?:div|li|ul|ol|table|thead|tbody|tr|th|td|h[1-6]|section|figure|blockquote|pre|hr|p class|\/DIV)|\{\{slot:|!\[|\|)/;
const isBlockStart = l => l.trim() !== '' && BLOCK_START.test(l);

function renderBlocks(src, ctx) {
  // callout 先抽出来，省得递归解析把嵌套搞糊
  src = src.replace(/^:::(info|tip|warn|danger|note)\s*(.*)\n([\s\S]*?)\n^:::\s*$/gm, (_, type, label, body) => {
    const ico = CALLOUT_ICON[type] || 'i-gear';
    const head = label.trim() ? `<span class="note-label">${inline(label.trim())}</span> ` : '';
    // 收成一行：整块 callout 交给下面 `<DIV ` 那条分支原样吐出，不参与后续块解析
    const inner = renderBlocks(body, ctx).trim().replace(/\n+/g, '');
    return `\n\n<DIV class="note note-${type}"><svg class="ic"><use href="#${ico}"/></svg><div>${head}${inner}</div></DIV>\n\n`;
  });

  const lines = src.split('\n');
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    let ln = lines[i];
    if (!ln.trim()) continue;
    if (ln.includes('<DIV class="note')) { out += ln.replace('<DIV ', '<div ').replace('</DIV>', '</div>') + '\n'; continue; }   // callout 的临时壳
    if (isHtmlLine(ln)) { const end = rawBlockAt(lines, i); out += lines.slice(i, end + 1).join('\n') + '\n'; i = end; continue; }

    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(ln))) {
      const lv = m[1].length, txt = m[2].replace(/\s*\{#([\w-]+)\}\s*$/, '');
      const id = /\{#([\w-]+)\}/.exec(m[2])?.[1] || slugify(txt, ctx.used);
      if (lv <= 3) ctx.toc.push({ lv, id, txt });
      const anchor = lv >= 2 && lv <= 3 ? `<a class="anchor" href="#${id}" aria-hidden="true">#</a>` : '';
      out += `<h${lv} id="${id}">${anchor}${inline(txt)}</h${lv}>\n`;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) { out += '<hr>\n'; continue; }
    if ((m = /^```\s*([\w+-]*)\s*$/.exec(ln))) {
      const lang = m[1]; const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      out += `<pre class="code"${lang ? ` data-lang="${lang}"` : ''}><code>${escHtml(buf.join('\n'))}</code></pre>\n`;
      continue;
    }
    if (/^>\s?/.test(ln)) {
      const buf = [];
      while (i < lines.length && (/^>\s?/.test(lines[i]) || (lines[i].trim() && buf.length && !/^[#\-|`<]/.test(lines[i])))) buf.push(lines[i++].replace(/^>\s?/, ''));
      i--;
      out += `<blockquote>${renderBlocks(buf.join('\n'), ctx).trim()}</blockquote>\n`;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(lines[i++].trim());
      i--;
      out += table(rows);
      continue;
    }
    if (/^\s*([-+*]|\d+[.)])\s/.test(ln)) {
      const re = /^(\s*)([-+*]|\d+[.)])(\s*)(.*)$/;
      const start = /^\s*(\d+)[.)]/.exec(ln);
      const tag = start ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length) {
        const mm = re.exec(lines[i]);
        if (!mm || mm[1].length > 1) break;
        const mark = mm[1].length + mm[2].length + mm[3].length;  // 续行至少要缩进到这里
        const buf = [mm[4]];
        i++;
        while (i < lines.length) {
          const n = lines[i];
          if (!n.trim()) {
            const nx = lines[i + 1] || '';
            if (nx.trim() && nx.match(/^\s*/)[0].length >= mark && !isBlockStart(nx)) { buf.push(''); i++; continue; }
            break;
          }
          if (isBlockStart(n)) break;                                    // 边界交给外层循环处理
          if (n.match(/^\s*/)[0] === '' && /^[^\s]/.test(n) && !/>/.test(n)) break;  // 顶格普通文本 = 段落，不属于本条
          buf.push(n.trim()); i++;
        }
        items.push(buf);
      }
      i--;
      const html = items.map(it => {
        const body = renderBlocks(it.join('\n'), ctx);
        let li = body.replace(/^<p>/, '').replace(/<\/p>\n?$/, '');
        // markdown 没有任务列表，这里认 "- [ ] / - [x]" 这一种写法就够
        if (/^\[[ xX]\]\s/.test(li)) li = `<li class="todo">${li.replace(/^\[[ xX]\]\s*/, '')}</li>`;
        else li = `<li>${li}</li>`;
        return li;
      }).join('\n').replace(/<\/li>\n<li/g, '</li><li');
      out += `<${tag}${start && +start[1] !== 1 ? ` start="${start[1]}"` : ''}>${html}</${tag}>\n`;
      continue;
    }
    // 整行只有图片 / slot
    if ((m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/.exec(ln.trim()))) { out += img(m[1], m[2], m[3], true) + '\n'; continue; }
    if ((m = /^\{\{slot:([\w.-]+)\}\}\s*$/.exec(ln.trim()))) { out += slotHtml(m[1], true) + '\n'; continue; }

    const buf = [ln];
    // 遇到下一个块级开头（含 <DIV / </div> 收口）就断掉，别把它当段落续行吞了
    while (i + 1 < lines.length && lines[i + 1].trim() && !isBlockStart(lines[i + 1])) buf.push(lines[++i]);
    out += `<p>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</p>\n`;
  }
  return out;
}

function table(rows) {
  const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const head = cells(rows[0]);
  const align = cells(rows[1]).map(c => /^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : '');
  const body = rows.slice(2).map(cells);
  const th = head.map((c, i) => `<th${align[i] ? ` style="text-align:${align[i]}"` : ''}>${inline(c)}</th>`).join('');
  const tr = body.map(r => '<tr>' + r.map((c, i) => `<td${align[i] ? ` style="text-align:${align[i]}"` : ''}>${inline(c)}</td>`).join('') + '</tr>').join('\n');
  return `<div class="table-scroll"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>\n`;
}

function renderMarkdown(md) {
  const ctx = { toc: [], used: new Set(['top']) };
  const fn = {};
  md = md.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, (_, k, v) => { fn[k] = v; return ''; });
  let html = renderBlocks(md, ctx);
  if (Object.keys(fn).length) {
    html += `<section class="footnotes"><h2 id="fn">注</h2><ol>${Object.entries(fn).map(([k, v]) =>
      `<li id="fn-${k.toLowerCase()}">${inline(v)} <a href="#fnref-${k.toLowerCase()}" aria-label="回到正文">↩</a></li>`).join('')}</ol></section>`;
  }
  return { html, toc: ctx.toc };
}

/* ---------------- layout ---------------- */
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231f5f7a'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%23fff' stroke-width='2'/%3E%3Ccircle cx='16' cy='16' r='2.2' fill='%23fff'/%3E%3C/svg%3E";

function layout(opts) {
  const { title, desc, body, active = '', wide = false } = opts;
  const url = cfg.siteUrl.replace(/\/$/, '') + opts.pathname;
  const nav = cfg.nav.map(n => {
    const cur = n.href === active ? ' aria-current="page"' : '';
    return `<li><a href="${BASE}${n.href}"${cur}><svg class="ic"><use href="#${n.icon}"/></svg>${n.text}</a></li>`;
  }).join('');

  return `<!doctype html>
<html lang="${cfg.lang}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escHtml(title)} · ${escHtml(cfg.title)}</title>
<meta name="description" content="${escHtml(desc || cfg.desc)}">
<meta name="theme-color" content="#0f1215" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f4f2ee" media="(prefers-color-scheme: light)">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc || cfg.desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${cfg.siteUrl.replace(/\/$/, '')}/assets/images/og.jpg">
<link rel="canonical" href="${url}">
<link rel="icon" href="${FAVICON}">
<link rel="icon" type="image/png" sizes="64x64" href="${BASE}assets/favicon.png">
<link rel="alternate" type="application/rss+xml" title="${escHtml(cfg.title)}" href="${BASE}feed.xml">
<link rel="stylesheet" href="${BASE}assets/ui.css">
<script>window.BASE=${JSON.stringify(BASE)};</script>
<script>
/* 先上主题再上内容，不然暗色用户会闪一下白 */
(function(){try{var t=localStorage.getItem('cosplay-blog-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){}})();
</script>
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<div class="progress" aria-hidden="true"><i></i></div>
<header class="nav">
  <div class="wrap nav-inner">
    <a class="brand" href="${BASE}index.html">
      <span class="brand-mark"><svg class="ic"><use href="#i-base"/></svg></span>
      <span>${escHtml(cfg.title)}<span class="brand-sub">${escHtml(cfg.tagline)}</span></span>
    </a>
    <ul class="nav-links" id="nav-links">${nav}</ul>
    <div class="nav-actions">
      <button class="icon-btn" data-search-btn aria-label="站内搜索"><svg class="ic"><use href="#i-search"/></svg></button>
      <button class="icon-btn" data-theme-btn="light" aria-pressed="false"><svg class="ic"><use href="#i-sun"/></svg><span class="sr-only">亮色</span></button>
      <button class="icon-btn" data-theme-btn="dark" aria-pressed="false"><svg class="ic"><use href="#i-moon"/></svg><span class="sr-only">暗色</span></button>
      <button class="icon-btn" data-theme-btn="auto" aria-pressed="false"><svg class="ic"><use href="#i-layers"/></svg><span class="sr-only">跟随系统</span></button>
      <a class="icon-btn" href="${cfg.repo}" aria-label="源码仓库"><svg class="ic"><use href="#i-github"/></svg></a>
      <button class="icon-btn nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="nav-links" aria-label="菜单"><svg class="ic"><use href="#i-menu"/></svg></button>
    </div>
  </div>
</header>
<div class="search-panel" data-search-panel>
  <div class="wrap">
    <label class="sr-only" for="q">站内搜索</label>
    <input id="q" type="search" placeholder="搜标题、正文、标签…（按 / 呼出，Esc 关闭）" autocomplete="off">
    <div class="search-hits"><div class="search-empty">输入关键词开始搜索。</div></div>
  </div>
</div>
<main id="main" class="wrap${wide ? '' : ' wrap-narrow'}">${body}</main>
<div class="lightbox" role="dialog" aria-modal="true" aria-label="放大查看">
  <button class="icon-btn" data-lb-close aria-label="关闭"><svg class="ic"><use href="#i-close"/></svg></button>
  <div><img alt=""><p></p></div>
</div>
${cfg.footerHtml(BASE)}
<button id="toTop" aria-label="回到顶部"><svg class="ic"><use href="#i-arrow-up"/></svg></button>
<script src="${BASE}assets/main.js" defer></script>
</body>
</html>`;
}

/* ---------------- 数据装配 ---------------- */
const readMd = f => fs.readFileSync(f, 'utf8');
const cnLen = s => (s.replace(/```[\s\S]*?```/g, '').match(/[\u4e00-\u9fa5A-Za-z0-9]/g) || []).length;

function loadPosts() {
  const dir = path.join(SRC, 'posts');
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const raw = readMd(path.join(dir, f));
    const [fmS, md] = splitFront(raw);
    const fm = parseFm(fmS);
    return { file: f, slug: f.replace(/\.md$/, ''), fm, md };
  }).sort((a, b) => (b.fm.date || '').localeCompare(a.fm.date || ''));
}
function loadPages() {
  const dir = path.join(SRC, 'pages');
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const raw = readMd(path.join(dir, f));
    const [fmS, md] = splitFront(raw);
    return { file: f, slug: f.replace(/\.md$/, ''), fm: parseFm(fmS), md };
  });
}

function fmtDate(d) { return d || ''; }
function stripMd(md) {
  return md.replace(/^:::.*?^:::\s*$/gms, '').replace(/[#>*`_~\[\]()!|-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function write(rel, html) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}

function copyAssets() {
  fs.rmSync(path.join(OUT, 'assets'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  // ui.css 是三个文件拼出来的，源码里分开写，产物里一个请求
  const css = ['tokens', 'base', 'ui'].map(n => `/* ---- ${n}.css ---- */\n` + fs.readFileSync(path.join(ROOT, 'assets/css', n + '.css'), 'utf8')).join('\n');
  fs.writeFileSync(path.join(OUT, 'assets/ui.css'), css);
  fs.copyFileSync(path.join(ROOT, 'assets/js/main.js'), path.join(OUT, 'assets/main.js'));
  const fav = path.join(ROOT, 'assets/favicon.png');
  if (fs.existsSync(fav)) fs.copyFileSync(fav, path.join(OUT, 'assets/favicon.png'));
  const icons = fs.readFileSync(path.join(ROOT, 'assets/icons.svg'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'assets/icons.svg'), icons);
  const imgs = path.join(ROOT, 'assets/images');
  if (fs.existsSync(imgs)) {
    fs.mkdirSync(path.join(OUT, 'assets/images'), { recursive: true });
    for (const f of fs.readdirSync(imgs)) fs.copyFileSync(path.join(imgs, f), path.join(OUT, 'assets/images', f));
  }
  return icons.replace('<svg xmlns="http://www.w3.org/2000/svg" style="display:none">', '<svg xmlns="http://www.w3.org/2000/svg" id="sprite-host" hidden aria-hidden="true" style="display:none">');
}

/* ---------------- 页面 ---------------- */
const tocOf = (toc) => toc.length ? `<nav class="toc" aria-label="目录">
  <div class="toc-title">Contents</div>
  <ol>${toc.map(t => `<li class="lvl-${t.lv}"><a href="#${t.id}">${escHtml(t.txt)}</a></li>`).join('')}</ol>
</nav>` : '<span></span>';

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const sprite = copyAssets();
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  const posts = loadPosts();
  const pages = loadPages();
  const published = posts.filter(p => p.fm.status !== 'draft');

  published.forEach(p => { p.out = `posts/${p.slug}.html`; });

  // 文章页
  for (const p of published) {
    const { html, toc } = renderMarkdown(p.md);
    const idx = published.indexOf(p);
    const prev = published[idx - 1], next = published[idx + 1];
    const pager = `<nav class="pager" aria-label="上一篇文章 / 下一篇文章">
      ${prev ? `<a href="${BASE}${prev.out}"><span>上一篇 · 更早</span><b>${escHtml(prev.fm.title)}</b></a>` : '<span></span>'}
      ${next ? `<a class="next" href="${BASE}${next.out}"><span>下一篇 · 更新</span><b>${escHtml(next.fm.title)}</b></a>` : '<span></span>'}
    </nav>`;
    const meta = `<div class="article-meta">
      <span>${fmtDate(p.fm.date)}</span><i class="dot"></i>
      <span>${p.fm.minutes || Math.max(1, Math.round(cnLen(p.md) / 400))} min</span><i class="dot"></i>
      <span>${(p.fm.tags || []).map(t => escHtml(t)).join(' / ')}</span>
    </div>`;
    const body = `<article>
      <header class="article-head">
        <a class="tag" href="${BASE}index.html#archive"><svg class="ic"><use href="#i-arrow-up"/></svg>文章归档</a>
        <h1>${escHtml(p.fm.title)}</h1>
        ${p.fm.desc ? `<p class="lead measure">${inline(p.fm.desc)}</p>` : ''}
        ${meta}
      </header>
      <div class="article-layout">
        ${tocOf(toc)}
        <div class="prose">${html}${pager}<div class="article-foot">${cfg.articleFoot}</div></div>
      </div>
    </article>`;
    p.out = `posts/${p.slug}.html`;
    const page = layout({ title: p.fm.title, desc: p.fm.desc, body, active: p.navKey || 'index.html', toc, pathname: '/' + p.out, wide: true });
    write(p.out, page.replace('<body>', '<body>' + sprite));
  }

  // 普通页面
  for (const g of pages) {
    const { html, toc } = renderMarkdown(g.md);
    const body = `<header class="article-head"><h1>${escHtml(g.fm.title)}</h1>${g.fm.desc ? `<p class="lead measure">${inline(g.fm.desc)}</p>` : ''}</header>
      <div class="article-layout">${tocOf(toc)}<div class="prose">${html}</div></div>`;
    g.out = `${g.slug}.html`;
    const page = layout({ title: g.fm.title, desc: g.fm.desc, body, active: g.fm.nav || g.out, toc, pathname: '/' + g.out, wide: true });
    write(g.out, page.replace('<body>', '<body>' + sprite));
  }

  // 首页（模板单独给，因为有 hero 这种一次性结构）
  const home = pages.find(p => p.slug === 'index') || { fm: {}, md: '' };
  const heroHtml = renderMarkdown(home.md).html;
  const list = published.map(p => `<a class="post-row" href="${BASE}${p.out || `posts/${p.slug}.html`}">
      <span class="date">${fmtDate(p.fm.date)}</span>
      <span><h3>${escHtml(p.fm.title)}</h3><p>${escHtml(p.fm.desc || stripMd(p.md).slice(0, 110))}</p>
      <span class="tag-row">${(p.fm.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</span></span>
      <span class="arrow"><svg class="ic"><use href="#i-arrow-right"/></svg></span>
    </a>`).join('\n');
  const body = `${heroHtml}
    <section id="archive" class="sec-head"><h2>全部文章</h2><span class="sec-tag">${published.length} POSTS · 按更新时间倒序</span></section>
    <div class="post-list">${list}</div>`;
  const page = layout({ title: cfg.title, desc: cfg.desc, body, active: 'index.html', pathname: '/index.html', wide: true });
  write('index.html', page.replace('<body>', '<body>' + sprite));

  // 404
  write('404.html', layout({
    title: '页面走丢了', desc: '404', active: '', pathname: '/404.html',
    body: `<div class="panel center" style="margin:80px 0"><h1>404</h1><p class="lead">这个路径下没有东西。可能是构建时漏了，也可能只是你记错了。</p>
    <p class="row" style="justify-content:center"><a class="btn btn-primary" href="${BASE}index.html">回首页</a><a class="btn" href="${BASE}safety.html">安全红线</a></p></div>`,
  }).replace('<body>', '<body>' + sprite));

  // 搜索索引 / RSS / sitemap
  const idx = [
    ...published.map(p => ({ u: `posts/${p.slug}.html`, t: p.fm.title, x: stripMd(p.md).slice(0, 320), d: p.fm.date, tags: (p.fm.tags || []).join(' ') })),
    ...pages.filter(p => p.slug !== 'index').map(p => ({ u: `${p.slug}.html`, t: p.fm.title, x: stripMd(p.md).slice(0, 320), d: p.fm.date || '', tags: '' })),
  ];
  write('search.json', JSON.stringify(idx));

  const site = cfg.siteUrl.replace(/\/$/, '') + '/';
  const items = published.map(p => `<item><title>${escHtml(p.fm.title)}</title><link>${site}posts/${p.slug}.html</link>
    <guid isPermaLink="true">${site}posts/${p.slug}.html</guid><pubDate>${new Date(p.fm.date).toUTCString()}</pubDate>
    <description>${escHtml(p.fm.desc || '')}</description></item>`).join('\n');
  write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${escHtml(cfg.title)}</title><link>${site}</link>
<description>${escHtml(cfg.desc)}</description><language>${cfg.lang}</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}</channel></rss>`);
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...published.map(p => `posts/${p.slug}.html`), ...pages.map(p => `${p.slug}.html`), 'index.html']
    .map(u => `  <url><loc>${site}${u}</loc></url>`).join('\n')}
</urlset>`);
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`);

  const n = published.length + pages.length + 2;
  console.log(`built ${n} pages · ${published.length} posts · BASE=${BASE}`);
}

build();
