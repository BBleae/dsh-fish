/**
 * client.js —— 观测台的浏览器半边（DSH「设置 → 鱼」里的一节）
 *
 * 为什么要有这一半（2026-10-22 定案）：
 *   宿主那半边 `observe.js` 注册的 `/dsh-fish/*` 路由是 JSON API，但**没有一个能点开的页面**——
 *   在浏览器里直接输 `/dsh-fish` 会被 connection 的信任栅栏挡成 401（它要的是 App 内的登录 cookie）。
 *   而 whale 的实证说明：**在 App 内部**（设置页里）同源 fetch 这些路由是通的，cookie 天然带着。
 *   所以观测台的正确形态是 settings.section，不是一个独立 HTML 页面。
 *
 * 数据流：section ⇄ 同源 fetch `/dsh-fish/*` ⇄ `~/.dsh-fish/`
 *   这里**只读 + 改环境**（时间窗、配额、日记可见性、冷落阈值），
 *   没有任何指向她本人的控件 —— 那是 B §8 的红线。
 */
window.__ModuleLoader__.load({
  // 这个 id 必须**等于 package.json 的包名**，不是短名：client-modules 用 loader
  // 条目名（完整包标识）去解析浏览器 bundle，注册时名字对不上，这一节就静默挂不上
  // ——宿主那半边照常跑，设置页却什么也不显示（2026-11-05 改名 @ssamurias/dsh-fish 后踩过）。
  id: '@ssamurias/dsh-fish',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    // {{SHARED_PRESSURE_FORMULAS}}

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useRef, useState } = React

    // 旁观者视角的第三人称（issue #139）。只用于**固定文案**：设置页说明、状态卡、
    // 提示语。她说过的话、日记、事件原文一律不经过这里——那些是她的原话，不替她改字。
    // 默认「她」；config.self.pronoun 可选「他」/「祂」（只经 /config API 改，设置页没有控件）。
    let SELF_SHE = '她'
    function S(text) {
      return String(text ?? '').split('她').join(SELF_SHE)
    }

    // 说明页那批文案（lib/wiki.js）用的是 `{S}` 占位而不是「她」：
    // 那边同时被服务端整页渲染（另一个进程，读不到这里这个变量），
    // 所以两边约定同一个占位符，各自替换。理由和 S() 一样——改称呼不该让说明书跟不上。
    function W(text) {
      return String(text ?? '').split('{S}').join(SELF_SHE)
    }

    // 插件 API 前缀不能写死 '/dsh-fish'：DSH 被反向代理挂在子路径下时
    // （如 /app/deepseek-harness/fngateway/），站点绝对路径会绕过前缀打 404（issue #132）。
    // 页面带 <base href="./"> 时 baseURI 就是子路径目录；根路径部署下仍是 '/dsh-fish'。
    // 宿主若注入 __DSH_BASE_PATH__，优先用它。
    const API = (() => {
      try {
        const injected = typeof window !== 'undefined' ? window.__DSH_BASE_PATH__ : undefined
        if (typeof injected === 'string' && injected.startsWith('/')) {
          const base = injected.replace(/\/+$/, '')
          return base ? `${base}/dsh-fish` : '/dsh-fish'
        }
        const base = typeof document !== 'undefined' ? document.baseURI : undefined
        if (!base) return '/dsh-fish'
        const dir = /\/$/.test(base) ? base : base.slice(0, base.lastIndexOf('/') + 1)
        return new URL('dsh-fish', dir).pathname.replace(/\/$/, '') || '/dsh-fish'
      } catch {
        return '/dsh-fish'
      }
    })()
    const NS = 'fish'

    // 「查多久的记录」的选项与本地存键（2026-11-07，用户反馈）。
    // 选项必须与服务端 /history 的夹值一致：以前这里给到 365，而 observe.js 与
    // history.js 都 `Math.min(180, …)`——选「一年」实际只拿到半年。现在两边都到 366。
    const HIST_DAYS_OPTIONS = [1, 7, 14, 30, 90, 180, 365]
    const HIST_DAYS_KEY = `${NS}.histDays`
    // 存/取「查多久的记录」（2026-11-07，用户反馈）：以前它只是组件里的 useState(14)，
    // 关掉设置页再打开就回到 14，看起来像配置丢了。浏览器里存 localStorage；
    // 宿主测试环境没有它（或隐私模式不让写），退回去也不影响别处。
    const readHistDays = () => {
      try {
        const n = Number(globalThis.localStorage?.getItem?.(HIST_DAYS_KEY))
        return HIST_DAYS_OPTIONS.includes(n) ? n : 14
      } catch { return 14 }
    }
    const storeHistDays = (n) => {
      try { globalThis.localStorage?.setItem?.(HIST_DAYS_KEY, String(n)) } catch { /* 存不下就算了 */ }
    }

    // ------------------------------------------------- 工具名白名单（2026-10-24）
    // 客户端就地实现一份，规则与 lib/settings.js 的 validateToolNames 一致
    // （那份是 node 模块，这边只能 require('react')，拿不到）。
    // 真正的拦截在服务端 /config：拼错的名字连盘都写不进去。
    const TOOL_NAME_RE = /^[a-z][a-z0-9_-]*$/
    function parseToolNames(input) {
      // 与 lib/settings.js 同一份规则：数组里夹带逗号也要再拆一次
      const raw = (Array.isArray(input) ? input : [input]).flatMap((x) => String(x ?? '').split(/[,，\s]+/))
      const seen = new Set()
      const out = []
      for (const x of raw) {
        const s = x.trim()
        if (!s || seen.has(s)) continue
        seen.add(s)
        out.push(s)
      }
      return out
    }
    function checkToolNames(input, known) {
      const names = parseToolNames(input)
      const set = Array.isArray(known) && known.length ? new Set(known.map(String)) : null
      const unknown = names.filter((n) => !TOOL_NAME_RE.test(n) || (set && !set.has(n)))
      return { ok: unknown.length === 0, names, unknown, checked: Boolean(set) }
    }

    // ------------------------------------------------- 本地时间（2026-11-03）
    // 事件里的 ts 是 UTC（toISOString() 带 Z）。以前界面直接 `String(ts).slice(0,16)`，
    // 切出来的是 UTC 那一刻，东八区看小纸条永远早 8 小时——而正文里她自己写的
    // 「现在十点多」又是对的，两边对不上（github:ssamurias/dsh-fish#19）。
    //
    // 客户端只能 require('react')，拿不到 lib/settings.js 的 dateKey，所以就地实现一份
    // （同上面 parseToolNames 的做法）。服务端那份在 lib/inbox.js 里，改规则时两边一起改。
    const pad2 = (n) => String(n).padStart(2, '0')
    /** @returns {'YYYY-MM-DD HH:MM'} 解析不出来时返回空串（宁可不印，也不印错） */
    function localStamp(ts) {
      const ms = Date.parse(String(ts ?? ''))
      if (!Number.isFinite(ms)) return ''
      const d = new Date(ms)
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    }

    // ---------------------------------------------------------------- 样式
    const CSS_TAG = 'dsh-fish/section.css'
    const CSS = [
      '.dfish{color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:14px}',
      '.dfish h2{margin:0;font-size:16px;font-weight:500;line-height:24px}',
      '.dfish .sub{color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:19px;margin:0}',
      '.dfish .card{border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px}',
      '.dfish details.adv{grid-column:1/-1;margin-top:6px}',
      '.dfish details.adv>summary{cursor:pointer;font-size:12.5px;color:var(--dsw-alias-label-tertiary);list-style:none}',
      '.dfish details.adv>summary::-webkit-details-marker{display:none}',
      '.dfish details.adv>summary::before{content:"▸ ";}',
      '.dfish details.adv[open]>summary::before{content:"▾ ";}',
      '.dfish details.adv>summary:hover{color:var(--dsw-alias-label-primary)}',
      '.dfish details.adv .advbody{margin-top:8px;display:flex;flex-direction:column;gap:8px}',
      '.dfish .card>h3{margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.06em;color:var(--dsw-alias-label-tertiary);text-transform:uppercase}',
      '.dfish .kv{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:13px;line-height:19px}',
      '.dfish .kv b{color:var(--dsw-alias-label-tertiary);font-weight:400}',
      '.dfish ul{margin:0;padding-left:17px;font-size:13px;line-height:20px}',
      '.dfish li{margin:3px 0}',
      '.dfish .tag{display:inline-block;padding:0 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:6px}',
      // 工具分组胶囊（2026-11-04，issue #20）。以前只有一个逗号分隔的输入框，
      // 用户既不知道这台机器上到底有哪些工具，也不知道该填哪个——只能去翻日志。
      // 现在按来源分组摆出来，点一下就是加/减白名单，输入框退成手工兜底。
      '.dfish .chips{display:flex;flex-wrap:wrap;gap:6px;margin:5px 0 0}',
      '.dfish .chip{background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:11.5px;height:22px;padding:0 9px;cursor:pointer;white-space:nowrap}',
      '.dfish .chip:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
      '.dfish .chip.on{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:rgba(128,128,128,.10)}',
      '.dfish .chip.her{cursor:default;opacity:.8}',
      '.dfish .chip.blk{border-style:dashed}',
      '.dfish .grouphd{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);margin:11px 0 0}',
      // 折叠条（2026-11-04，用户反馈）：一百多个胶囊全摊开等于没有界面。
      // 按名字前缀分族、默认全收着，点哪族开哪族。
      '.dfish .famhd{display:flex;align-items:center;gap:6px;width:100%;height:24px;text-align:left;background:transparent;border:0;border-radius:6px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:12px;line-height:18px;padding:0 4px;margin:3px 0 0;cursor:pointer}',
      '.dfish .famhd:hover:not(:disabled){background:rgba(128,128,128,.10);color:var(--dsw-alias-label-primary)}',
      '.dfish .famhd .famcaret{flex:none;width:9px;font-size:10px;opacity:.7}',
      '.dfish .famhd .famname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace}',
      '.dfish .famhd .famcnt{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dfish .famhd.open .famname{color:var(--dsw-alias-label-primary)}',
      '.dfish .chipsnote{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);background:rgba(128,128,128,.07);border-radius:6px;padding:6px 8px;margin:0 0 4px}',
      '.dfish pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit);font-family:ui-monospace,Consolas,monospace}',
      '.dfish .empty{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0}',
      '.dfish .dim{color:var(--dsw-alias-label-tertiary);font-size:12px}',
      '.dfish .err{color:#e5484d;font-size:12.5px;white-space:pre-wrap}',
      '.dfish .ok{color:#30a46c;font-size:12.5px;white-space:pre-wrap}',
      '.dfish .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '.dfish .form{display:flex;flex-direction:column;gap:9px;font-size:13px}',
      '.dfish .form label{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.dfish input[type=number]{width:62px;background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12.5px;height:26px;padding:0 7px;outline:none}',
      '.dfish input[type=text]{flex:1;min-width:200px;background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12.5px;height:26px;padding:0 7px;outline:none}',
      '.dfish button{background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;color:var(--dsw-alias-label-primary);font-size:12.5px;height:28px;padding:0 12px;cursor:pointer}',
      '.dfish button:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
      '.dfish button:disabled{opacity:.5;cursor:default}',
      // 说明入口（2026-11-16，用户 m04417）：默认的蓝链跟这一页的按钮、胶囊完全不是一个语言——
      // 一串带下划线的蓝字插在卡片里，像从别处粘过来的。改成和按钮同高同圆角的「引导钮」：
      // 描边用 border-l3（比普通按钮的 l2 略重一点，认出它是主操作），字色跟正文一样，
      // 只有悬停时才泛出 business-primary —— 读起来是按钮，不是链接。
      '.dfish .go{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:7px;color:var(--dsw-alias-label-primary);background:rgba(128,128,128,.06);font-size:12.5px;text-decoration:none;white-space:nowrap}',
      '.dfish .go:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);text-decoration:none}',
      '.dfish .go .arrow{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1}',
      '.dfish .go:hover .arrow{color:var(--dsw-alias-state-business-primary)}',
      '.dfish textarea{width:100%;box-sizing:border-box;min-height:66px;resize:vertical;background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:8px 10px;outline:none}',
      // 卡片内的两格切换（扫码 / 粘贴 cookie，2026-11-02）。
      // 刻意不复用页面顶部那套 .tabs/.tab：那是导航栏的类名，卡片里再套一层
      // 会渲染成「多了一行页面页签」，而且下面 85~96 行同名定义会把它逐条覆盖掉。
      '.dfish .seg{display:inline-flex;gap:2px;padding:2px;margin:0 0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:rgba(128,128,128,.06)}',
      '.dfish .seg>button{height:24px;padding:0 11px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:12px}',
      '.dfish .seg>button:hover:not(:disabled):not(.on){background:rgba(128,128,128,.12);color:var(--dsw-alias-label-primary);border:0}',
      '.dfish .seg>button.on{background:rgba(128,128,128,.18);color:var(--dsw-alias-state-business-primary);font-weight:500}',
      '.dfish .seg>button.on:hover{color:var(--dsw-alias-state-business-primary);background:rgba(128,128,128,.24)}',
      '.dfish .said{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:21px;border-left:2px solid var(--dsw-alias-border-l2);padding-left:10px;margin:6px 0}',
      '.dfish .badge{display:inline-block;min-width:16px;text-align:center;padding:0 5px;border-radius:999px;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted,#fff);font-size:10.5px;line-height:16px;margin-left:6px}',
      '.dfish .tabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:5px;background:rgba(128,128,128,.06)}',
      '.dfish .tab{background:transparent;border:.5px solid transparent;border-radius:7px;height:28px;padding:0 11px;font-size:12.5px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));cursor:pointer}',
      '.dfish .tab:hover{color:var(--dsw-alias-label-primary);background:rgba(128,128,128,.12)}',
      // 选中态踩过两次坑（2026-10-25 用户真机截图暴露）：
      // ① 最初写死 color:#fff —— 深色主题下白字压白底，整片看不见；
      // ② 改成 brand-primary 当底色 —— 那其实是「正文墨色」（浅色 #0f1115 近黑 / 深色 #f9fafb 近白），
      //    于是浅色主题出现黑块、深色主题出现白块，仍然难看。
      // 正确做法：底色只用中性的浅罩层，强调靠 state-business-primary 的字色和描边。
      '.dfish .tab.on{background:rgba(128,128,128,.18);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-state-business-primary);font-weight:500}',
      '.dfish .tab.on:hover{color:var(--dsw-alias-state-business-primary);background:rgba(128,128,128,.24)}',
      '.dfish .tabs .grow{flex:1}',
      '.dfish .tabhint{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-tertiary);margin:-6px 0 0}',
      '.dfish .page{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;align-items:start}',
      '.dfish .page>.card{min-width:0}',
      '.dfish .card.full{grid-column:1 / -1}',
      '.dfish .pressure-summary{display:grid;gap:9px;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}',
      '.dfish .pressure-metric{min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px}',
      '.dfish .pressure-value{font-variant-numeric:tabular-nums;font-size:15px;font-weight:600}',
      '.dfish .load-tabs{margin:8px 0 12px}',
      '.dfish .load-panel{display:grid;gap:8px;min-width:0}',
      '.dfish .load-heading{display:flex;align-items:baseline;justify-content:space-between;gap:6px;flex-wrap:wrap}',

      '.dfish .load-median-line{stroke:var(--dsw-alias-label-secondary);stroke-dasharray:4 3}',
      '.dfish .load-band{fill:currentColor;opacity:.16}',
      '.dfish .load-legend{display:flex;flex-wrap:wrap;gap:4px 12px}',
      '.dfish .load-reference{text-align:right}',
      '.dfish .load-delta{font-variant-numeric:tabular-nums}',
      '.dfish .load-factor{display:flex;align-items:baseline;gap:6px 10px;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px}',
      '.dfish .load-factor label{display:flex;align-items:center;gap:5px;min-width:125px}',

      '.dfish .pressure-section{border-top:1px solid var(--dsw-alias-border-l2);margin-top:9px;padding-top:7px;min-width:0;font-size:12px}',
      '.dfish .pressure-section summary{cursor:pointer;font-size:12px;font-weight:500}',
      '.dfish .pressure-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}',
      '.dfish .pressure-table th,.dfish .pressure-table td{padding:6px 4px;text-align:left;overflow-wrap:anywhere;border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.dfish .pressure-table th{color:var(--dsw-alias-label-secondary);font-weight:500}',
      '.dfish .pressure-table :is(th,td):last-child{text-align:right}',
      '.dfish .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 18px}',
      '.dfish .fld{display:flex;flex-direction:column;gap:5px;min-width:0}',
      '.dfish .fl{display:flex;flex-direction:column;gap:2px}',
      '.dfish .flabel{font-size:13px;line-height:19px}',
      // 2026-11-08：hint 里可以用换行分段（E9 那行挑评论的规则要单独一行）。
      '.dfish .fhint{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:pre-line}',
      '.dfish .hint{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);margin:0}',
      '.dfish .warn{font-size:12px;line-height:18px;color:#b8860b;margin:6px 0}',
      // 下拉框（2026-10-25 用户真机反馈：暗色下「只有一个白条」，字全看不见）。
      // 根因：select 背景写的是 transparent，原生控件在深色主题里会用 UA 白底绘制，
      // 而字色是 label-primary（深色主题下接近白）——白底白字。option 弹层同理。
      // 修法：底色改成主题的不透明层色，option 显式给同一组底色/字色，
      // color-scheme 继承 <html> 上宿主设的 dark/light（原生弹层跟着切换）。
      '.dfish select{height:28px;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;background-color:var(--dsw-alias-bg-layer-1,Field);color:var(--dsw-alias-label-primary,CanvasText);color-scheme:inherit;font-size:12.5px;padding:0 8px;outline:none;cursor:pointer;max-width:240px}',
      '.dfish select option{background-color:var(--dsw-alias-bg-layer-1,Field);color:var(--dsw-alias-label-primary,CanvasText)}',
      '.dfish input[type=time]{height:28px;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;background-color:var(--dsw-alias-bg-layer-1,Field);color:var(--dsw-alias-label-primary,CanvasText);color-scheme:inherit;font-size:12.5px;padding:0 6px;outline:none}',
      '.dfish .step{width:26px;height:26px;padding:0;border-radius:6px;font-size:14px;line-height:1}',
      // 日记翻页条（2026-10-26）：日期多于一天才出现，一行放得下三个元素就够。
      '.dfish .pager{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:2px 0 8px}',
      '.dfish .pager button{height:24px;padding:0 10px;font-size:12px;border-radius:6px}',
      '.dfish .pager .dim{font-size:12px;font-variant-numeric:tabular-nums}',
      '.dfish .sw{position:relative;width:40px;height:22px;padding:0;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);background:rgba(128,128,128,.18);cursor:pointer;transition:background .15s}',
      '.dfish .sw .knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}',
      '.dfish .sw.on{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
      '.dfish .sw.on .knob{left:20px}',
      '.dfish .savebar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:4px}',
      '.dfish button.primary{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted,#fff)}',
      '.dfish button.primary:hover:not(:disabled){opacity:.9;color:var(--dsw-alias-label-primary-inverted,#fff)}',
      // GitHub 链接（2026-10-25 用户要求）：商标小图 + 文字，点开新窗口。
      // 用 inline-flex 让 icon 和文字基线对齐；hover 只换颜色不动位置。
      '.dfish .ghlink{display:inline-flex;align-items:center;gap:6px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-decoration:none;border-radius:6px;padding:2px 4px;margin-left:-4px}',
      '.dfish .ghlink:hover{color:var(--dsw-alias-state-business-primary);background:rgba(128,128,128,.1)}',
      '.dfish .ghlink svg{flex:0 0 auto}',
      // 常见问题解答按钮（2026-10-28 用户要求）：点开就地展开，不在设置页里铺满。
      // 2026-10-28 晚（用户 m00416「点了没有反应」）：原本是 `<a target="_blank">` 开新窗口，
      // 但宿主的信任栅栏只认 App 登录 cookie，新标签页一律 403 —— 换成 button + 面板。
      '.dfish .faq-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 16px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:13.5px;text-decoration:none;background:transparent;cursor:pointer}',
      '.dfish .faq-btn:hover{background:rgba(128,128,128,.12);color:var(--dsw-alias-label-primary)}',
      '.dfish .faq-btn .arrow{opacity:.6;font-size:12px}',
      '.dfish .faq-panel{margin-top:10px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:rgba(128,128,128,.04);overflow:hidden}',
      '.dfish .faq-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:0.5px solid var(--dsw-alias-border-l2)}',
      '.dfish .faq-head button{height:24px;padding:0 10px;font-size:12px;border-radius:6px}',
      '.dfish .faq-body{max-height:52vh;overflow:auto;padding:4px 12px 12px}',
      '.dfish .faq-qa{padding:10px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}',
      '.dfish .faq-qa:last-child{border-bottom:0}',
      '.dfish .faq-q{font-size:13.5px;font-weight:600;line-height:1.7}',
      '.dfish .faq-a{margin:6px 0 0;font-size:13px;line-height:1.75;color:var(--dsw-alias-label-secondary)}',
      // 扫码登录浮层（2026-11-02 按仓库配色重做）。
      // 原版把卡片写成 #fff 底 + #111 字，深色主题下是一块刺眼白板；
      // 强调色也用了 B 站蓝 #00aeec，和插件自己的强调色（state-business-primary）不同源。
      // 现在卡片走主题层色、按钮走通用 button 样式 + .go 强调类。
      // 唯一保留写死的白底是二维码本身：扫码要的是黑白高对比，跟着主题变成暗底反而扫不出来。
      '.dfish .qrovl{position:fixed;inset:0;z-index:91;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.62)}',
      '.dfish .qrcard{width:min(340px,92vw);box-sizing:border-box;background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,CanvasText);border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;padding:18px 18px 14px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.45)}',
      '.dfish .qrcard h4{margin:0 0 12px;font-size:13.5px;font-weight:600;line-height:20px}',
      '.dfish .qrpic{display:block;width:100%;max-width:252px;margin:0 auto;border-radius:8px;background:#fff}',
      '.dfish .qrph{display:flex;align-items:center;justify-content:center;width:100%;max-width:252px;height:252px;margin:0 auto;box-sizing:border-box;border:.5px dashed var(--dsw-alias-border-l2);border-radius:8px;background:rgba(128,128,128,.06);color:var(--dsw-alias-label-tertiary);font-size:12.5px}',
      '.dfish .qrwho{margin:4px 0 6px;font-size:14px;line-height:20px}',
      '.dfish .qrstat{margin:10px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}',
      '.dfish .qrerr{margin:6px 0 0;font-size:12px;line-height:18px;color:#e5484d}',
      '.dfish .biliwarn{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 10px;padding:10px 12px;border-radius:8px;background:rgba(229,72,77,.10);border:1px solid rgba(229,72,77,.35);font-size:12.5px;line-height:19px;color:#e5484d}',
      '.dfish .qrbtns{display:flex;gap:8px;justify-content:center;margin-top:14px}',
      '.dfish .qrbtns button{height:30px;padding:0 14px;font-size:13px;border-radius:8px}',
      '.dfish .qrbtns button.go{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted,#fff)}',
      '.dfish .qrbtns button.go:hover:not(:disabled){opacity:.9;color:var(--dsw-alias-label-primary-inverted,#fff);border-color:var(--dsw-alias-state-business-primary)}',
    ].join('\n')

    function useStyleOnce() {
      useEffect(() => {
        const current = document.querySelector(`style[data-tag="${CSS_TAG}"]`)
        if (current) {
          if (current.textContent !== CSS) current.textContent = CSS
          return
        }
        const el = document.createElement('style')
        el.setAttribute('data-tag', CSS_TAG)
        el.textContent = CSS
        document.head.appendChild(el)
      }, [])
    }

    // ---------------------------------------------------------------- 工具
    const esc = (s) => String(s == null ? '' : s)

    /**
     * 把质量指标渲染成两位小数。
     *
     * 为什么要有这个函数（2026-10-23，观测台空白页的根因）：
     *   宿主那边 `/state` 的 quality 不是数字，是带样本量的结构体
     *   `{ stability: { score, sample, worst }, consistency: { score, pairs }, novelty: { score, recent, older } }`
     *   （样本太少时故意不报裸分数，避免"看数字调性格"）。
     *   而这里原来写的是 `s.quality.stability.toFixed(2)` —— 对一个对象调 toFixed，
     *   React 渲染抛 TypeError，整节被错误边界吞掉，用户看到的就是**设置页一片空白**。
     *   所以这里同时接受数字和 `{score}` 两种形态，取不到就给 em dash，绝不再抛。
     */
    function q2(v) {
      const n = typeof v === 'number' ? v : Number(v && v.score)
      return Number.isFinite(n) ? n.toFixed(2) : '—'
    }

    /**
     * 「判断漂移」那一行的值：样本不够时不准印 0.00。
     *
     * 2026-10-26（用户 m05785「为什么剩下两个全是0」）：三个指标在样本不足时给的
     * 默认值原本被直接当成结果显示——没有判断时稳定 0.00、说话不足两条时一致 1.00、
     * 没有七天前的老话时新鲜 0.00。三个数里有两个是"还没法测"，不是"她很差"。
     * 现在把这种情况写成一句人话，数字只在真的能测时才印。
     */
    function bandOf(v) {
      return typeof v === 'string' ? v.trim() : ''
    }
    function qStability(v) {
      if (!v) return '—'
      const band = bandOf(v && v.band)
      // 2026-10-27（用户 m06350）：能测出来的时候，数字和判读一起给——只印那句
      // 「长在这些事上，抽掉一条少一块」，用户看不出到底是多少，以为没测。
      // 样本不够时才只给判读：那种 0.00 是默认值，不是测量结果，不能当数字印。
      if (!Number(v.sample ?? 0) || !Number(v.beliefs ?? 0)) return band || '还没攒到判断，测不出来'
      const n = Number(v.score)
      const num = Number.isFinite(n) ? n.toFixed(2) : '—'
      // 2026-11-07（issue #57）：只印均值，会把「平均动 3%、某一次动了 15%」写成一片安安静静。
      // 最大值明显高于均值时一并印出来——这两个数合起来才是这一行的全部事实。
      const w = Number(v.worst)
      const worst = Number.isFinite(w) && Number.isFinite(n) && w > n + 0.005 ? `（最大 ${w.toFixed(2)}）` : ''
      return band ? `${num}${worst} · ${band}` : `${num}${worst}`
    }
    function qConsistency(v) {
      if (!v) return '—'
      const pairs = Number(v.pairs ?? 0)
      if (!pairs) return '还没有跨阶段的话可比'
      const n = Number(v.score)
      return Number.isFinite(n) ? n.toFixed(2) : '—'
    }
    function qNovelty(v) {
      if (!v) return '—'
      const recent = Number(v.recent ?? 0)
      const older = Number(v.older ?? 0)
      if (!recent) return '最近一周没写下自己的话'
      if (!older) return '还没有七天前的老话可比'
      const n = Number(v.score)
      return Number.isFinite(n) ? n.toFixed(2) : '—'
    }

    async function jget(path) {
      const r = await fetch(API + path, { headers: { accept: 'application/json' } })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const hint = r.status === 401 || r.status === 403 ? '（被信任栅栏拒绝：请在 App 内打开这一页）' : ''
        throw new Error(`HTTP ${r.status}${hint} ${j.error || ''}`.trim())
      }
      return j
    }

    async function jpost(path, body) {
      const r = await fetch(API + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body == null ? {} : body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        // 有些失败要带着后端给的名单再决定下一步（恢复撞上碎字文件，issue #65）。
        const err = new Error(j.error || `HTTP ${r.status}`)
        err.payload = j
        err.status = r.status
        throw err
      }
      return j
    }

    // 给人看的大小：和 lib/backup.js 的 sizeText 同一个写法（1MB 以上写 MB，十进制，
    // 留一位小数、往上取，刚过上限的包不会显示成和上限一样大）。
    function mbText(bytes) {
      const n = Math.max(0, Number(bytes) || 0)
      if (n >= 1000000) return `${Math.ceil(n / 100000) / 10}MB`
      return `${Math.max(1, Math.ceil(n / 1000))}KB`
    }

    // 回执里的名单：最多列前 10 条，剩下的报个数。total 是真实条数（恢复接口只带前 200 条）。
    // 一下列几千条，一句回执就成了一大段；顺序由后端排好（丢了找不回来的 owner.json、日记这类在前）。
    function someOf(list, total) {
      const all = Array.isArray(list) ? list : []
      const n = Math.max(Number(total) || 0, all.length)
      const shown = all.slice(0, 10)
      return shown.join('、') + (n > shown.length ? `，还有 ${n - shown.length} 个没列出来，完整名单在备份文件的 skipped 里` : '')
    }

    // 没打进包的文件怎么说：有名字的照 someOf 列；事件流顶到恢复上限附近时，
    // 包里连说明行都写不下，后端只记了个数（skippedUnlisted），这几个单独说一句。
    // named 是有名字的真实条数（恢复接口的名单只带前 200 条）。
    function missingText(list, named, unlisted) {
      const listed = someOf(list, named)
      const n = Math.max(0, Number(unlisted) || 0)
      if (!n) return listed
      const why = '（再写就超过「从备份恢复」一次能收的大小）'
      return listed ? `${listed}；另有 ${n} 个连名字都写不进包里${why}` : `包里连它们的名字都写不下${why}`
    }

    // ---------------------------------------------------------------- 说明入口（原理页最上面那一条）
    //
    // 2026-11-16 用户 m03816：不要独立的「说明」页签，也不要设置页里那个搜索框——
    // 「而是一个点击跳转的超链接……点了之后，浏览器自动打开本地 html 页面」。
    // 所以 App 里只留一行：一句它在讲什么，加一个蓝链；整套说明在浏览器里看。
    //
    // 为什么这里敢用 <a target="_blank">（前两次都撞墙，两次都不是「再调调」能解决的）：
    //   · 链到插件自己的路由 → 桌面版 setWindowOpenHandler 对 http(s) 是 openExternal + deny，
    //     链接被甩给系统浏览器；而那道信任栅栏要的 cookie 是「按本次启动密钥签的」，
    //     只有 App 自己的 webContents 带着，浏览器里必然 401。
    //   · 链到 file:// → 同一个 handler 里 file: 既不 openExternal 也不放行，点了没反应。
    //   · 回环小站（lib/wikiserve.js）不一样：目标不是宿主的任何一条路由，是我们自己起的服务，
    //     只监听 127.0.0.1、只认 GET。浏览器打开它，就跟打开任何一个本地小站一样；
    //     Electron 看到 http(s) 就 openExternal，正好把这一下变成「系统浏览器打开」。
    //
    // 组件放在模块作用域：写在 FishSection 里，每次渲染都是新的函数身份，React 会当成
    // 另一个组件卸载重挂，每次都要重新取一遍 /wiki.data。
    function WikiLink() {
      const [info, setInfo] = useState(null)
      const [err, setErr] = useState('')
      const [saving, setSaving] = useState(false)
      const [saved, setSaved] = useState('')

      useEffect(() => {
        let alive = true
        jget('/wiki.data')
          .then((r) => { if (alive) setInfo(r) })
          .catch((e) => { if (alive) setErr(String(e?.message ?? e)) })
        return () => { alive = false }
      }, [])

      // 存一份能双击打开的 HTML：浏览器里当然也能「另存为」，但名字和位置得自己找；
      // 这一条是给「想发给别人 / 想留在本地」的人留的（用户 m02916 的 C 案还留着）。
      const saveHtml = async () => {
        setSaving(true)
        setSaved('')
        try {
          const r = await fetch(API + '/wiki', { headers: { accept: 'text/html' } })
          if (!r.ok) throw new Error('HTTP ' + r.status)
          const html = await r.text()
          const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = '大肥鱼说明.html'
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
          setSaved('存好了，双击那个文件也能看。')
        } catch (e) {
          setSaved('没存成：' + (e?.message ?? e) + '。过一会儿再点一次。')
        } finally {
          setSaving(false)
        }
      }

      const url = typeof info?.url === 'string' ? info.url : ''
      const count = Array.isArray(info?.entries) ? info.entries.length : 0

      return h('div', { className: 'card', style: { margin: '0 0 12px' } },
        h('div', { style: { fontSize: '13px', fontWeight: 500, lineHeight: '20px' } },
          count ? S('wiki：界面上那些词和数，' + count + ' 条都在这一页') : S('wiki：界面上那些词和数，一条一条讲清')),
        h('div', { className: 'dim', style: { marginTop: '4px', lineHeight: '1.8' } },
          S('阶段怎么算、门要什么证据、疤是什么、劲儿从哪来、五个设置页各管什么、四十七张事件卡都在什么时候出。')),
        h('div', { style: { marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
          url
            ? h('a', { className: 'go', href: url, target: '_blank', rel: 'noreferrer' },
                S('在浏览器里打开'), h('span', { className: 'arrow' }, '↗'))
            : h('span', { className: 'dim' }, err ? '没拿到地址：' + err : '正在准备地址……一秒'),
          h('button', { onClick: saveHtml, disabled: saving, style: { fontSize: '12.5px' } },
            saving ? '正在存……' : '存一份 HTML')),
        saved ? h('div', { className: 'ok', style: { marginTop: '6px' } }, saved) : null)
    }
