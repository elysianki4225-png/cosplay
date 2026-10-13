const repo = 'elysianki4225-png/cosplay';
// GitHub Pages 的项目页挂在 <user>.github.io/<repo>/ 下，不是域名根。
// 所以站内所有绝对路径都得带这个前缀：写死 '/' 的话，浏览器会去
// https://<user>.github.io/assets/... 取 CSS/JS/图片（那是别人的地盘，一律 404），
// 于是只有能落地的首页打得开，其它页面全是无样式 + 破图。
// 改仓库名/换域名只需要改上面那行 repo（或用 BASE_PATH 覆盖）。
const basePath = `/${repo.split('/')[1]}/`;
const siteUrl = `https://${repo.split('/')[0]}.github.io${basePath}`;

module.exports = {
  title: 'TAILDOCK',
  tagline: 'Modular Tail Dock Log',
  lang: 'zh-CN',
  desc: '一枚模块化尾巴底座（可拓展螺纹接口）的材料力学、生理代偿与 23/1 留置作息观测记录。面向 Cosplay / Petplay 道具穿戴，不涉及任何性用途描述。',
  repo: `https://github.com/${repo}`,
  pagesUrl: siteUrl,
  basePath,
  siteUrl,

  nav: [
    { href: 'index.html', text: '首页', icon: 'i-book' },
    { href: 'posts/modular-tail-base-23-1.html', text: '主报告', icon: 'i-gear' },
    { href: 'gear.html', text: '硬件档案', icon: 'i-base' },
    { href: 'safety.html', text: '安全红线', icon: 'i-shield' },
    { href: 'privacy.html', text: '隐私与法务', icon: 'i-lock' },
    { href: 'media-guide.html', text: '拍摄规范', icon: 'i-camera' },
    { href: 'log.html', text: '更新日志', icon: 'i-clipboard' },
  ],

  footerHtml: (BASE) => `<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h4>About</h4>
        <p class="muted" style="max-width:44ch">${'' + 'TAILDOCK 是一份关于「模块化尾巴底座」的个人观测记录：把一坨 316L 不锈钢、一颗螺纹副和一段直肠黏膜之间的力学关系写清楚。目的只有一个——' + '让道具穿戴更像工程，而不是更像运气。'}</p>
        <div class="row" style="margin-top:14px">
          <a class="btn btn-sm" href="https://github.com/${repo}"><svg class="ic"><use href="#i-github"/></svg>源码 / 内容</a>
          <a class="btn btn-sm" href="${BASE}feed.xml"><svg class="ic"><use href="#i-rss"/></svg>RSS</a>
        </div>
      </div>
      <div>
        <h4>Site</h4>
        <ul>
          <li><a href="${BASE}index.html">文章归档</a></li>
          <li><a href="${BASE}gear.html">硬件规格表</a></li>
          <li><a href="${BASE}safety.html">停戴红线清单</a></li>
          <li><a href="${BASE}media-guide.html">拍摄与图片规范</a></li>
        </ul>
      </div>
      <div>
        <h4>Disclaimer</h4>
        <ul>
          <li>本站道具定位为 <b>Cosplay 装饰/外观附件</b></li>
          <li>非情趣用品推荐，无性用途描述</li>
          <li>所有内容仅记录个人观测，不构成医疗建议</li>
          <li>未成年人请勿阅读 / 请勿模仿</li>
        </ul>
      </div>
    </div>
    <div class="footer-note">
      <span>CC BY-NC 4.0 · 自建静态站（零依赖构建，无框架）</span>
      <span class="mono"><a href="${siteUrl}">${siteUrl.replace('https://', '')}</a></span>
    </div>
  </div>
</footer>`,

  // 图片按图位走，构建时才知道是成品还是占位
  articleFoot: `<div class="banner"><svg class="ic"><use href="#i-alert"/></svg>
  <div><b>读我一遍：</b>本文里的 23/1、克数、力矩、时间都是<b>个体参数</b>，不是推荐值。任何人先从几小时、从最轻的配件开始，出现红线信号立刻停。身体反馈优先于任何博客（包括这篇）。</div>
</div>`,
};
