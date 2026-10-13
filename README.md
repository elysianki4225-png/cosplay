# TAILDOCK / 尾巴底座观测站

> 围绕一枚 **模块化尾巴底座（可拓展螺纹接口）** 的材料力学、生理代偿与 `23/1` 作息观测的独立博客。

| | |
|---|---|
| 站点 | <https://elysianki4225-png.github.io/cosplay/> |
| 仓库 | <https://github.com/elysianki4225-png/cosplay> |
| RSS | <https://elysianki4225-png.github.io/cosplay/feed.xml> |
| 许可 | 文字 CC BY-NC 4.0 / 代码 MIT |

## 用途边界（先说清楚）

本站讨论的道具是 **Cosplay / 拟态外观的装饰附件**：让尾巴在拍照、走台、长时间站立时不歪、不掉、不甩到路人。

- 它 **不是** 情趣用品，本站不做任何情趣用品推荐，不提供任何性用途层面的描述、指导或暗示。
- 生理相关章节的唯一目的，是把风险、代偿机制与 **停戴条件** 写清楚。
- 全部内容 **不构成医疗建议**；出现异常请立即停止并就医。**成年读者限定。**

## 为什么写这个

同一枚金属件，有人 20 分钟就想扔进抽屉，有人能维持每天 23 小时留置、1 小时空置的作息。差别不在"忍耐力"，而在四个可测量的变量：

1. 螺纹副选型与防松（M8×1.25 / 旋合圈数 / 扭矩上限）
2. 悬臂力矩——尾巴末端一个不受控的拉力会 1:1 变成体内剪切
3. 承托面积与压强（宽平法兰把压强压到软组织毛细血管闭合压以下）
4. 每天那 1 小时再灌注窗口，以及它的客观指标：压痕消退时间

本站就是围绕这四条展开的工程记录：规格表、力学换算、材料判定、失效复盘、可复现的日志字段。

## 站点内容

| 路径 | 内容 |
|---|---|
| `index.html` | 首页：定位说明、关键数据、按目的分流 |
| `posts/modular-tail-base-23-1.html` | **主报告**（≈19 min）：硬件解构 / 生理内幕 / 维护红线 |
| `posts/thread-lever-mistakes.html` | 外接螺纹配件的三个致命杠杆误区 |
| `posts/physiology-log-table.html` | 第 5 型、黏液与报警阈值：一张表看懂 |
| `gear.html` | 硬件档案：完整规格表 + 耗材更换周期（数值标注实测/标称/估算） |
| `safety.html` | 安全红线单页：立即停戴 8 条 / 禁忌 8 条 / 自检 5 步 / 本地计时器 |
| `media-guide.html` | 拍摄与图片规范：四个标准机位 + 图位工作流 |
| `log.html` | 站点与器材双时间线 |
| `about.html` | 项目信息、技术栈、许可与免责 |

## 技术实现

零依赖静态站。没有框架、没有运行时依赖、没有埋点、没有第三方 CDN（连字体都不引，避免国内直连白屏等字体）。

```
assets/
  css/tokens.css    设计变量（亮/暗两套 + 跟随系统）
  css/base.css      reset、排版尺度、工具类
  css/ui.css        响应式组件库
  js/main.js        主题 / 抽屉 / 目录高亮 / 搜索 / lightbox / 计时器
  icons.svg         34 枚自绘 24×24 图标，构建时内联
build/build.js      markdown 子集解析 + 页面装配 + RSS/sitemap/搜索索引
src/
  config.js         站点信息、导航、页脚、免责块
  slots.json        图位登记表（缺图 → 占位块，不出破图）
  posts/*.md        文章
  pages/*.md        单页
docs/               构建产物 = Pages 根目录
```

### 响应式界面库（本站自研，`assets/css/ui.css`）

- **布局**：`grid-2/3/4/12` + `col-3…col-12`、`wrap / wrap-narrow / measure`、`stack / row / row-between`
- **导航**：粘性顶栏、图标导航、当前页高亮、≤860px 移动端抽屉
- **内容件**：`card`（含 feature 卡）、`panel`、`article-head`、`footnotes`、`timeline`、`post-list`、`pager`
- **技术件**：`spec` 规格表 + 窄屏 `table-scroll`、`stat` 数据块、`tag` / `badge`、`code`、`kbd`
- **提示**：`note` callout 五态（info / tip / warn / danger / note）、`banner`、`checklist`、markdown 任务清单 `[ ]`
- **阅读体验**：粘性目录 + 滚动高亮、阅读进度条、`lightbox`、回到顶部、`skip-link`、打印样式
- **交互**：亮/暗/跟随系统三态（`localStorage` + `<head>` 内联脚本防闪白）、站内搜索（`/` 呼出、子串打分、键盘导航）、本地留置计时器
- **断点**：480 · 620 · 720 · 820 · 860 · 900 · 1080；`prefers-reduced-motion` / `prefers-color-scheme` 全程尊重

### Markdown 子集（`build/build.js`）

```markdown
## 标题                       {#自定义锚点}
> 引用   |  表格  |  ```fenced code```
- 列表（`- [ ]` 渲染成复选框）
:::warn 标题                    ← callout：info / tip / warn / danger / note
正文
:::
{{slot:hero-base}}              ← 图位，路径与说明写在 src/slots.json
脚注引用 [!1]  /  定义 [^1]: ...
```

## 本地跑

```bash
node build/build.js                       # 产物写到 docs/
python3 -m http.server 8080 -d docs       # 或 npx serve docs
```

要改访问路径（比如换域名），设 `BASE_PATH=/xxx/`；CI 里会自动按仓库名推导。

## 发布

`.github/workflows/deploy.yml` → Actions 构建 `docs/` → `upload-pages-artifact`。
仓库 **Settings → Pages → Build and deployment → Source = GitHub Actions** 选一次即可，之后 push 到 `main` 自动上线。

## 图片工作流

正文里只写 `{{slot:key}}`，不写死路径。补图：

```bash
cp 你的图.jpg assets/images/hero-base.jpg   # 目标尺寸 1600×1200（hero 位 1600×1000），单张 < 400 KB
# 把 src/slots.json 里对应条目的 status 改成 "ready"
node build/build.js
```

细则见站点 `media-guide.html`。图片只拍器材与桌面，不拍人体。
