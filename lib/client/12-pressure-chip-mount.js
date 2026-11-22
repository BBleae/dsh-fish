    // ---------------------------------------------------------------- 会话压力（对话页）
    // 2026-11-17（用户 m02719）：压力入口从设置页搬到对话页——会话头部一个小胶囊，
    // 点开是迷你面板；另有「压力」页签放稍微完整一点的表。按工作区过滤由服务端做，
    // 不是她这间房的会话返回 not-fish，这里什么都不渲染。
    function pressureK(value) {
      const n = Number(value)
      if (!Number.isFinite(n)) return '—'
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
      if (n >= 1e3) return `${Math.round(n / 1e3)}k`
      return String(Math.round(n))
    }

    function pressureTone(score) {
      const n = Number(score)
      if (!Number.isFinite(n)) return 'var(--dsh-text-dim, #8a8a8a)'
      if (n >= 85) return 'var(--dsh-danger, #d9534f)'
      if (n >= 70) return 'var(--dsh-warning, #c9973f)'
      return 'var(--dsh-success, #3f9e63)'
    }

    // 逐轮曲线的分要在浏览器里现算：服务端 live 只给当前这一轮的总分。
    // 公式与 lib/session-pressure.js 的 pressureScore 保持一致（2026-11-18 真机点开胶囊消失）。
    function pressureScore(tokens, threshold) {
      if (!Number.isFinite(tokens) || tokens < 0 || !Number.isFinite(threshold) || threshold <= 0) return null
      return Math.min(100, 100 * tokens / threshold)
    }

    // 不再定时轮询（2026-11-18 用户 m03880）：挂载取一次、打开弹层取一次（带 composite）、
    // 页面重新可见时取一次；房外会话在服务端就是 not-fish，前端也不会去问别的房间。
    function usePressure(sessionId, active) {
      const [data, setData] = useState(null)
      const [failed, setFailed] = useState(false)
      const [tick, setTick] = useState(0)
      useEffect(() => {
        if (!sessionId) return undefined
        let alive = true
        let timer = null
        let attempts = 0
        const run = async () => {
          try {
            const q = `session=${encodeURIComponent(sessionId)}${active ? '&composite=1' : '&light=1'}`
            const next = await jget(`/session-pressure?${q}`)
            if (!alive) return
            setData(next)
            setFailed(false)
            // 服务端第一次常常还在算（availability=pending）。只在这段时间里短轮询，
            // 算完就停；不做常驻定时器（2026-11-18 用户反馈胶囊要等点击才出现）。
            if (next?.availability === 'pending' && attempts < 8) {
              attempts += 1
              timer = setTimeout(() => { void run() }, 1500)
            }
          } catch {
            if (alive) setFailed(true)
          }
        }
        void run()
        const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void run() }
        if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', onVisible)
        return () => {
          alive = false
          if (timer) clearTimeout(timer)
          if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', onVisible)
        }
      }, [sessionId, active, tick])
      return [data, failed, () => setTick(n => n + 1)]
    }

    function pressureMiniRows(data) {
      const rows = data?.usage?.roundDiagnostics ?? []
      return rows.slice(-6).map(row => h('div', {
        key: String(row.turn),
        style: { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', opacity: 0.85 },
      },
        h('span', null, `第 ${row.turn} 轮`),
        h('span', null, `输入 ${pressureK(row.input)} · 输出 ${pressureK(row.output)}`)))
    }

    // 宿主的主题变量不保证凑齐（深色下 --dsh-surface 有、--dsh-text 未必有），
    // 这里看页面正文文字颜色的明暗判断深浅，再把一整套面板颜色从根上传下去。
    function pressurePalette(el) {
      let dark = false
      try {
        const probe = (typeof document !== 'undefined' && document.body) || el
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(getComputedStyle(probe).color || ''))
        if (m) dark = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255 > 0.5
      } catch { /* 取不到样式就按浅色面板兜底 */ }
      return dark
        ? { surface: '#1f2023', text: '#ececef', dim: '#a1a1aa', border: 'rgba(255,255,255,.14)', chip: 'rgba(255,255,255,.07)' }
        : { surface: '#ffffff', text: '#1d1d1f', dim: '#6b7280', border: 'rgba(0,0,0,.12)', chip: 'rgba(0,0,0,.045)' }
    }

    function PressureChip(props) {
      const sessionId = props?.sessionId ?? props?.session?.id ?? props?.session?.header?.id
      const [open, setOpen] = useState(false)
      const [data, failed, reload] = usePressure(sessionId, open)
      const [anchor, setAnchor] = useState(null)
      const [palette, setPalette] = useState(pressurePalette(null))
      const [tab, setTab] = useState('current')
      const [hidden, setHidden] = useState([])
      // 手动换房（2026-11-18，用户 m02113 / m02215）：先点「换一间…」，就地问一遍，
      // 把后果写清再动手；误触只会停在问这一句，不会真的换。
      const [rotateAsk, setRotateAsk] = useState(false)
      const [rotateBusy, setRotateBusy] = useState(false)
      const [rotateNote, setRotateNote] = useState('')
      const [rotateErr, setRotateErr] = useState('')
      const boxRef = useRef(null)
      const dlgRef = useRef(null)
      // 用原生 dialog 的 top layer：标题栏的祖先可能 overflow:hidden 或有 transform，
      // 弹层挂在里面会被裁掉（2026-11-17 真机只看到一个阴影框）。
      useEffect(() => {
        const dlg = dlgRef.current
        if (!dlg) return
        if (open && !dlg.open) { try { dlg.showModal() } catch { /* 老内核没有 showModal 就退回普通定位 */ } }
        if (!open && dlg.open) dlg.close()
      }, [open])
      // 自己的遮罩自己定：宿主可能给所有 dialog 配了深色 backdrop，会盖住弹层。
      useEffect(() => {
        if (!open) return
        const id = 'dsh-fish-pressure-dialog-css'
        if (!document.getElementById(id)) {
          const st = document.createElement('style')
          st.id = id
          st.textContent = '.pressure-dialog::backdrop{background:transparent}'
          document.head.appendChild(st)
        }
      }, [open])
      if (!sessionId) return null
      const availability = data?.availability
      // 房外/无会话才隐藏（用户 m02888）。还在算（pending）也要先把胶囊摆出来，
      // 否则切进对话时看起来「默认不显示」，得等一次点击触发重渲染才冒出来（2026-11-18 用户反馈）。
      if (availability === 'not-fish' || availability === 'no-session') return null
      const score = pressureScoreOf(data)
      const label = Number.isFinite(score) ? String(Math.round(score)) : (failed ? '压力 —' : '压力 …')
      const toggle = (ev) => {
        if (open) { setOpen(false); return }
        const rect = ev.currentTarget.getBoundingClientRect()
        setPalette(pressurePalette(ev.currentTarget))
        setAnchor({
          top: Math.round(rect.bottom + 6),
          right: Math.max(8, Math.round(window.innerWidth - rect.right)),
        })
        setOpen(true)
      }
      // 换房的后果就这几条，说清再让他点第二个按钮。她正在说话时服务端会回 409，
      // 这里把那句话直接摆出来（不吞掉，也不假装换好了）。
      const doRotate = async () => {
        if (rotateBusy) return
        setRotateBusy(true)
        setRotateErr('')
        try {
          const r = await jpost('/home/rotate', { confirm: 'rotate', from: sessionId })
          setRotateAsk(false)
          setRotateNote(String(r?.note ?? S('换好了。')))
        } catch (e) {
          setRotateErr(String(e?.message || e || S('没换成。')))
        } finally {
          setRotateBusy(false)
        }
      }
      const rotateAskBox = rotateAsk ? h('div', {
        style: {
          border: '1px solid ' + palette.border, borderRadius: '8px',
          padding: '10px 12px', marginBottom: '10px', background: 'var(--pf-chip)',
          fontSize: '12.5px', lineHeight: '19px',
        },
      },
        h('div', { style: { fontWeight: 500, marginBottom: '4px' } }, S('要换一间吗？先看清会发生什么：')),
        h('div', null, S('· 现在这一间会改名留档（叫「跟大肥鱼说话·…之前」），不删，侧栏里还能翻到。')),
        h('div', null, S('· 新的一间是空的，只带一页「上次停在这」——她记的事、便条、日记都还在，不跟着换。')),
        h('div', null, S('· 轮数从 0 重新数；她这轮还没说完的话不会丢，会留在旧的那一间里。')),
        h('div', null, S('· 换完会叫她一声；侧栏里等她说出第一句才出现。')),
        rotateErr ? h('div', { style: { marginTop: '6px', color: '#d9534f' } }, rotateErr) : null,
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
          h('button', {
            type: 'button',
            onClick: doRotate,
            disabled: rotateBusy,
            style: {
              fontSize: '12px', padding: '4px 12px', borderRadius: '6px', cursor: rotateBusy ? 'default' : 'pointer',
              border: '1px solid ' + palette.border, background: 'transparent', color: palette.text,
            },
          }, rotateBusy ? S('换着…') : S('换一间')),
          h('button', {
            type: 'button',
            onClick: () => { setRotateAsk(false); setRotateErr('') },
            style: { fontSize: '12px', padding: '4px 12px', borderRadius: '6px', border: 'none', background: 'transparent', color: palette.dim, cursor: 'pointer' },
          }, S('先不换'))))
        : null
      const rotateDoneBox = rotateNote ? h('div', {
        style: {
          border: '1px solid ' + palette.border, borderRadius: '8px', padding: '9px 12px',
          marginBottom: '10px', fontSize: '12.5px', lineHeight: '19px',
        },
      },
        h('div', null, rotateNote),
        h('button', {
          type: 'button',
          onClick: () => { setRotateNote(''); setOpen(false) },
          style: { marginTop: '6px', fontSize: '12px', padding: '3px 10px', borderRadius: '6px', border: '1px solid ' + palette.border, background: 'transparent', color: palette.text, cursor: 'pointer' },
        }, S('知道了'))) : null
      return h('div', { ref: boxRef, style: { position: 'relative', display: 'inline-flex' } },
        h('button', {
          type: 'button',
          title: S('这间对话的上下文占用；点一下看细一点'),
          onClick: toggle,
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '2px 9px', borderRadius: '999px', fontSize: '12px', lineHeight: '18px',
            border: '1px solid var(--dsh-border, #3a3a3a)', background: 'transparent',
            color: pressureTone(score), cursor: 'pointer',
          },
        },
          h('span', { style: { width: '6px', height: '6px', borderRadius: '999px', background: pressureTone(score) } }),
          label),
        open && anchor ? h('dialog', {
          ref: dlgRef,
          className: 'pressure-dialog',
          onClose: () => setOpen(false),
          onPointerDown: (ev) => { if (ev.target === ev.currentTarget) setOpen(false) },
          style: {
            position: 'fixed', top: anchor.top + 'px', right: anchor.right + 'px', left: 'auto', bottom: 'auto',
            margin: 0, padding: 0, border: 'none', background: 'transparent', color: 'inherit',
            maxWidth: 'none', maxHeight: 'none', width: '520px', overflow: 'visible',
          },
        }, h('div', {
          style: {
            width: '520px', maxWidth: 'calc(100vw - 32px)', maxHeight: '80vh', overflowY: 'auto',
            padding: '14px 16px', borderRadius: '10px', textAlign: 'left',
            background: palette.surface, color: palette.text,
            border: '1px solid ' + palette.border,
            boxShadow: '0 12px 32px rgba(0,0,0,.35)',
            // 面板内部的 .hint / 边框等继续读宿主变量，这里把它们固定成当前主题的一套值。
            '--dsh-surface': palette.surface,
            '--dsh-text': palette.text,
            '--dsh-text-dim': palette.dim,
            '--dsh-border': palette.border,
            '--pf-surface': palette.surface, '--pf-text': palette.text, '--pf-dim': palette.dim,
            '--pf-line': palette.border, '--pf-chip': palette.chip,
          },
        }, rotateAskBox, rotateDoneBox, pressureReport({
          data: data, failed: failed, reload: reload, tab: tab, setTab: setTab, hidden: hidden, setHidden: setHidden,
          // 只有胶囊弹层里给这个入口；「压力」页签是另一处渲染，不带换房按钮。
          onRotate: () => { setRotateAsk(true); setRotateNote(''); setRotateErr('') },
        }))) : null)
    }

    // 综合分：A/B/C 三种加权公式的平均（PR #148，2026-11-18 用户 m04025）。
    // 缺了才退回上下文占用，保证老数据也能显示。
    function pressureScoreOf(data) {
      // Number(null) 是 0：空值必须先挡掉，否则「还没算出来」会被显示成 0 分（2026-11-18 用户报 0 分）。
      const raw = data?.compositeAverage
      const average = raw == null ? NaN : Number(raw)
      if (Number.isFinite(average)) return average
      const live = data?.live?.score
      return live == null ? NaN : (Number.isFinite(Number(live)) ? Number(live) : NaN)
    }

    function pressureAdvice(data) {
      const score = pressureScoreOf(data)
      if (!Number.isFinite(score)) return null
      if (score >= 95) return S('这一段快到顶了：聊完这轮就换个房间吧。')
      if (score >= 85) return S('还能再聊几轮，但可以开始想换房间了。')
      if (score >= 70) return S('还够用，不过已经过半，别把一整个长任务都堆在这一间。')
      return S('还很空，这间房可以继续用。')
    }

    // 第一屏的结论：只看综合分落点，说人话（用户 m03303 要「直观告诉要不要换对话」）。
    function pressureVerdict(score) {
      const n = Number(score)
      if (!Number.isFinite(n)) return { title: S('数据还不够'), tone: '#8a8a8a', hint: S('再聊几轮才有对照。') }
      if (n >= 95) return { title: S('该换房间了'), tone: '#d9534f', hint: S('这一段基本装满，换一间接着聊。') }
      if (n >= 85) return { title: S('准备换房'), tone: '#e08a1e', hint: S('还能再聊几轮，可以先想好下一句在哪儿说。') }
      if (n >= 70) return { title: S('还够用，但过半了'), tone: '#b58a00', hint: S('别把一整个长任务都堆在这一间。') }
      return { title: S('还很空'), tone: '#3a9d5d', hint: S('这间房可以继续用。') }
    }

    function pressureBar(pct, tone) {
      const width = Math.max(0, Math.min(100, Number(pct) || 0))
      return h('div', { style: { height: '6px', borderRadius: '999px', background: 'rgba(128,128,128,.22)', overflow: 'hidden' } },
        h('div', { style: { width: width + '%', height: '100%', background: tone, borderRadius: '999px' } }))
    }

    // 分页式完整报表（用户 m03375）：当前 / 历史 / 指标 / 计算 四个页签。
    function pressureReport(props) {
      const { data, failed, reload, tab, setTab, hidden, setHidden, onRotate } = props
      // 一套自己的排版尺度：正文 12.5、次要说明 11.5、标题 13、数字 15；不再混用 11/12/15 的随机组合。
      const section = (title, extra) => h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '7px 10px', borderRadius: '7px',
          background: 'var(--pf-chip)', marginBottom: '6px',
        },
      },
        h('span', { style: { fontSize: '12px', fontWeight: 500, letterSpacing: '.01em' } }, title),
        extra != null ? h('span', { style: { marginLeft: 'auto', fontSize: '11px', color: 'var(--pf-dim)' } }, extra) : null)
      const table = (headers, list) => h('div', { style: { overflowX: 'auto' } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ...headers.map(name => h('th', {
            key: name,
            style: {
              textAlign: 'left', padding: '6px 8px', fontSize: '11.5px', fontWeight: 500,
              color: 'var(--pf-dim)', background: 'var(--pf-chip)',
              whiteSpace: 'nowrap', borderBottom: '1px solid var(--pf-line)',
            },
          }, name)))),
          h('tbody', null, ...list.map((row, i) => h('tr', { key: String(i) },
            ...row.map((cell, j) => h('td', {
              key: String(j),
              style: {
                padding: '6px 8px', fontSize: '12.5px', borderBottom: '1px solid var(--pf-line)',
                whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
              },
            }, cell)))))))
      const stat = (label, value) => h('div', {
        key: label,
        style: { padding: '8px 10px', borderRadius: '8px', background: 'var(--pf-chip)' },
      },
        h('div', { style: { fontSize: '11px', color: 'var(--pf-dim)' } }, label),
        h('div', { style: { fontSize: '15px', fontWeight: 600, marginTop: '2px', fontVariantNumeric: 'tabular-nums' } }, value))
      if (failed || data?.availability === 'unavailable') {
        return h('div', null,
          h('p', { className: 'hint' }, S('这次没读到压力数据。不是坏了，再试一次。')),
          h('button', { onClick: () => reload() }, S('重新读')))
      }
      if (!data) return h('div', { className: 'hint' }, S('正在算这一轮的压力……'))
      const score = pressureScoreOf(data)
      const tone = pressureTone(score)
      const verdict = pressureVerdict(score)
      const windowSize = Number(data?.live?.contextWindow)
      const tokens = Number(data?.live?.tokens)
      const ratio = windowSize > 0 && Number.isFinite(tokens) ? Math.max(0, Math.min(100, tokens / windowSize * 100)) : null
      const usage = data?.usage ?? {}
      const usageRows = usage.roundDiagnostics ?? []
      const last = usageRows.at(-1)
      const history = usage.history ?? []
      const tools = (data?.tools ?? []).slice(0, 8)
      const growth = (data?.growth ?? []).slice(0, 8)
      const allFactors = data?.load?.factors ?? []
      const ref = usage.reference ?? {}
      const requestsTotal = usageRows.reduce((sum, row) => sum + (Number(row.requests) || 0), 0)
      const toolErrorsTotal = usageRows.reduce((sum, row) => sum + (Number(row.toolErrors) || 0), 0)
      const completedRounds = usageRows.filter(row => Number(row.requests) > 0).length
      // 走势用每轮开头那一次请求的输入量 ÷ 当轮窗口：这才是「聊到这一轮时上下文占了多少」。
      const series = usageRows.map(row => {
        // 老会话不一定记着当轮窗口/首请求输入（2026-11-18 用户反馈图一直空）：
        // 窗口退回当前 live 的 contextWindow，首请求退回该轮总输入，保证曲线能画出来。
        const liveWindow = Number(data?.live?.contextWindow)
        const win = Number(row.window) || (liveWindow > 0 ? liveWindow : NaN)
        const firstRaw = Number(row.first)
        const first = Number.isFinite(firstRaw) ? firstRaw : Number(row.input)
        if (!Number.isFinite(win) || win <= 0 || !Number.isFinite(first)) return null
        return { turn: row.turn, pct: Math.max(0, Math.min(100, first / win * 100)) }
      }).filter(Boolean)
      const chartH = 88
      const chartW = 260
      const plot = series.length > 1
        ? h('svg', {
          viewBox: `0 0 ${chartW} ${chartH}`, preserveAspectRatio: 'none',
          style: { width: '100%', height: chartH + 'px', display: 'block', color: tone },
        },
          [70, 85, 100].map(level => h('line', {
            key: String(level), x1: 0, x2: chartW,
            y1: 78 - level / 100 * 68, y2: 78 - level / 100 * 68,
            stroke: 'currentColor', opacity: 0.16, strokeDasharray: '3 3',
          })),
          h('path', {
            fill: 'currentColor', opacity: 0.1,
            d: `M0,78 L${series.map((row, i) => `${(i / (series.length - 1)) * chartW},${78 - row.pct / 100 * 68}`).join(' L')} L${chartW},78 Z`,
          }),
          h('polyline', {
            fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round',
            points: series.map((row, i) => `${(i / (series.length - 1)) * chartW},${78 - row.pct / 100 * 68}`).join(' '),
          }),
          h('circle', {
            cx: chartW, cy: 78 - series.at(-1).pct / 100 * 68, r: 2.4, fill: 'currentColor',
          }))
        : h('div', { style: { fontSize: '12px', color: 'var(--pf-dim)' } },
          series.length ? S('只有一轮，够画一个点，还不够成走势。') : S('还没有留下每轮的上下文记录。'))
      const headline = h('div', { style: { display: 'grid', gap: '10px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px' } },
            h('span', { style: { fontSize: '30px', lineHeight: '32px', fontWeight: 600, color: tone } },
              Number.isFinite(score) ? String(Math.round(score)) : '—'),
            h('span', { style: { fontSize: '12px', color: 'var(--pf-dim)' } }, S('分 · 越高越重'))),
          h('span', {
            style: {
              marginLeft: 'auto', padding: '3px 10px', borderRadius: '999px',
              fontSize: '11.5px', color: verdict.tone, background: 'var(--pf-chip)',
              border: '1px solid ' + verdict.tone, whiteSpace: 'nowrap',
            },
          }, verdict.title),
          h('button', {
            onClick: () => reload(),
            style: {
              fontSize: '11.5px', background: 'transparent', border: '1px solid var(--pf-line)',
              color: 'var(--pf-dim)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer',
            },
          }, S('刷新')),
          // 手动换房（2026-11-18，用户 m02113 / m02215）：入口就在「这间装到哪了」旁边，
          // 因为「该换房间了」这句提示本来就出现在这里。点开的是就地确认，不是 native confirm：
          // 弹层本身已经是 native dialog，再叠一层系统框在深色主题里很难看，也说不清后果。
          onRotate ? h('button', {
            onClick: onRotate,
            title: S('换一条新会话接着聊；旧的那条改名留档，不删'),
            style: {
              fontSize: '11.5px',
              background: 'transparent',
              border: '1px solid ' + (Number(score) >= 85 ? tone : 'var(--pf-line)'),
              color: Number(score) >= 85 ? tone : 'var(--pf-dim)',
              borderRadius: '6px', padding: '3px 8px', cursor: 'pointer',
            },
          }, S('换一间…')) : null),
        h('div', { style: { fontSize: '13px', fontWeight: 400, lineHeight: '19px' } }, verdict.hint),
        h('div', { style: { display: 'grid', gap: '5px' } },
          h('div', { style: { height: '6px', borderRadius: '999px', background: 'var(--pf-chip)', overflow: 'hidden' } },
            h('div', { style: { width: Math.round(ratio ?? 0) + '%', height: '100%', background: tone, borderRadius: '999px' } })),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--pf-dim)' } },
            h('span', null, ratio === null ? S('上下文占用未知') : `上下文已用 ${Math.round(ratio)}%`),
            h('span', null, `${pressureK(tokens)} / ${pressureK(windowSize)} Token`))),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' } },
          stat(S('轮数'), String(completedRounds || usageRows.length)),
          stat(S('样本'), ref.count ? String(ref.count) : S('不足')),
          stat(S('请求'), String(requestsTotal)),
          stat(S('报错'), String(toolErrorsTotal))))
      // 第一屏给「历史同轮中位数」（2026-11-18 用户 m03803）：直接回答「这一轮比过去同轮重还是轻」。
      const medianLine = (() => {
        const mp = data?.medianPoint
        if (!mp) return h('div', { style: { fontSize: '12px', color: 'var(--pf-dim)' } },
          S('历史同轮中位数还没有样本：这版开始每轮记录，攒几轮就能对照。'))
        const nowPct = ratio === null ? null : Math.round(ratio)
        const diff = nowPct === null ? null : nowPct - Math.round(mp.pct)
        const kind = mp.n >= 10 ? S('中位数') : S('参考')
        const tail = nowPct === null ? ''
          : diff === 0 ? S('，和它差不多')
            : diff > 0 ? `，比它高 ${diff} 个百分点`
              : `，比它低 ${-diff} 个百分点`
        return h('div', { style: { fontSize: '12px', color: 'var(--pf-text)', lineHeight: '19px' } },
          `第 ${mp.turn} 轮历史${kind} ${mp.pct}%（样本 ${mp.n} 次）· 你现在 ${nowPct === null ? '—' : nowPct + '%'}${tail}`)
      })()
      // 被中断的轮不记用量，但明说一句，别让人以为漏数了（2026-11-18 用户 m03880）。
      const interrupted = Number(data?.interruptedRounds) || 0
      const interruptedLine = interrupted
        ? h('div', { style: { fontSize: '12px', color: 'var(--pf-dim)' } },
          `其中 ${interrupted} 轮被中断，没有记录。`)
        : null
      const currentView = h('div', { style: { display: 'grid', gap: '14px' } },
        medianLine,
        interruptedLine,
        h('div', null,
          section(S('上下文占用走势'), S('虚线 70 / 85 / 100')),
          plot,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--pf-dim)', marginTop: '2px' } },
            h('span', null, series.length ? `第 ${series[0].turn} 轮` : ''),
            h('span', null, series.length ? `第 ${series.at(-1).turn} 轮` : ''))),
        growth.length ? h('div', null,
          section(S('增长最大的轮次')),
          table([S('轮次'), S('净增长'), S('轮末 Token'), S('请求')],
            growth.map(row => [`第 ${row.turn} 轮`, row.delta != null ? '+' + pressureK(row.delta) : '—', pressureK(row.tokens), String(row.requests ?? '—')]))) : null,
        tools.length ? h('div', null,
          section(S('工具结果长期残留')),
          table([S('工具'), S('累计 Token'), S('调用')],
            tools.map(row => [row.name, pressureK(row.tokens), String(row.calls ?? '—')]))) : null,
        usageRows.length ? h('div', null,
          section(S('逐轮明细'), S('最近 12 轮')),
          table([S('轮次'), S('输入'), S('输出'), S('请求'), S('重试')],
            usageRows.slice(-12).reverse().map(row => [`第 ${row.turn} 轮`, pressureK(row.input), pressureK(row.output), String(row.requests ?? '—'), String(row.attempts ?? '—')]))) : null)
      const historyView = h('div', { style: { display: 'grid', gap: '12px' } },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' } },
          stat(S('参考样本'), ref.count ? String(ref.count) : S('不足')),
          stat('P90', ref.p90 != null ? pressureK(ref.p90) : '—'),
          stat(S('历史会话'), String(history.length))),
        ref.count && ref.count >= 10 ? null
          : h('div', { className: 'hint' }, S('历史样本要凑够 10 个完整用量的轮次才给对照；现在还不够，所以只报这间房自己的数。')),
        history.length ? table([S('会话'), S('状态'), S('轮数')],
          history.slice(0, 10).map(row => [row.title || S('未命名会话'), row.status ?? '—', String(row.count ?? row.turns ?? '—')]))
          : h('div', { className: 'hint' }, S('还没有可以对照的历史会话。')),
        h('div', { className: 'hint' }, S('只统计这间房的会话；别的房间与子代理不参与。')))
      const factorsView = h('div', { style: { display: 'grid', gap: '10px' } },
        h('div', { className: 'hint' }, S('勾选只影响这张表显示哪几项；分数仍按七项固定权重算。')),
        ...allFactors.map(factor => {
          const on = !hidden.includes(factor.id)
          const cur = Number(factor.current)
          const base = Number(factor.baseline)
          const span = Math.max(1, Number.isFinite(cur) ? cur : 0, Number.isFinite(base) ? base : 0)
          return h('div', { key: factor.id, style: { display: 'grid', gap: '5px', opacity: factor.available ? 1 : 0.55 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' } },
              h('input', {
                type: 'checkbox', checked: on,
                onChange: () => setHidden(prev => on ? [...prev, factor.id] : prev.filter(id => id !== factor.id)),
              }),
              h('span', { style: { fontWeight: 500 } }, `${factor.label ?? factor.id} · ${factor.weight}%`),
              h('span', { style: { marginLeft: 'auto', fontSize: '11.5px', color: 'var(--pf-dim)' } },
                `${Number.isFinite(cur) ? Math.round(cur) : '—'} / ${Number.isFinite(base) ? Math.round(base) : '—'}${factor.provisional ? S(' · 样本少') : ''}`)),
            on ? h('div', { style: { position: 'relative', height: '5px', borderRadius: '999px', background: 'var(--pf-chip)' } },
              h('div', { style: { width: Math.min(100, (Number.isFinite(cur) ? cur : 0) / span * 100) + '%', height: '100%', borderRadius: '999px', background: tone, opacity: 0.85 } }),
              Number.isFinite(base) ? h('div', {
                style: {
                  position: 'absolute', top: '-2px', bottom: '-2px',
                  left: Math.min(100, base / span * 100) + '%', width: '1px',
                  background: 'currentColor', opacity: 0.5,
                },
              }) : null) : null)
        }))
      const calcView = h('div', { style: { display: 'grid', gap: '9px', fontSize: '12.5px', lineHeight: '1.7', color: 'var(--pf-dim)' } },
        h('p', null, S('最上面那个分数是综合负担：容量、请求、结构三项各算一遍。A 按固定权重相加；B 把三项当风险相乘；C 以容量为主、再用请求和结构修正。三种取平均，0 最轻、100 满格。')),
        h('p', null, S('三项看什么：容量是窗口现在占了多少；请求是每轮重放相对窗口有多重、缓存省了多少、输出占多少；结构是工具结果堆了多少、重复可见多少、重试报错多不多。')),
        h('p', null, S('分数段：20 以下很轻，随便聊；20–50 正常、还能装；50–75 开始变重，长任务最好拆开；85 以上该准备换房间；95 以上聊完这轮就换。')),
        h('p', null, S('这个分不跟历史比。指标页那七项才跟历史同轮中位数比；样本不到 10 个只当参考，不到 3 个不报。')),
        h('p', null, S('数据来自每轮模型实报的 Token；压缩次数只统计宿主事件流里能看到的，别的压缩插件不对外暴露。')),
        h('p', null, S('只读统计：不改对话，也不写事件流。')))
      const tabs = [['current', S('当前')], ['history', S('历史')], ['factors', S('指标')], ['calc', S('计算')]]
      return h('div', { style: { display: 'grid', gap: '14px' } },
        headline,
        h('div', { style: { display: 'flex', gap: '18px', borderBottom: '1px solid var(--pf-line)' } },
          ...tabs.map(([id, label]) => h('button', {
            key: id, type: 'button', onClick: () => setTab(id),
            style: {
              padding: '6px 0 7px', fontSize: '12.5px', background: 'transparent', cursor: 'pointer',
              color: 'inherit', border: 'none',
              borderBottom: tab === id ? '2px solid ' + tone : '2px solid transparent',
              color: tab === id ? tone : 'var(--pf-dim)',
              fontWeight: tab === id ? 500 : 400,
            },
          }, label))),
        tab === 'current' ? currentView : tab === 'history' ? historyView : tab === 'factors' ? factorsView : calcView)
    }
    // ---------------------------------------------------------------- 挂载
    const inject = ['slots']
    const NAMES = { nav: '大肥鱼' }

    function apply(ctx) {
      ctx.effect(
        () =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: NS, order: 7, label: () => NAMES.nav },
              FishSection,
            ),
            'dsh-fish: settings section',
          ),
        'dsh-fish: settings section',
      )
      // 对话页的常驻入口（2026-11-17，用户 m02719）：会话头部小胶囊 + 压力页签。
      // 两边共用同一份 /session-pressure?session=… 数据；非她这间房的会话服务端返回 not-fish，组件直接不渲染。
      ctx.effect(
        () =>
          ctx.slots.inject('conversation.session.header.actions', () =>
            ctx.slots.register(
              { name: 'conversation.session.header.actions', id: 'pressure-chip', order: 20 },
              PressureChip,
            ),
            'dsh-fish: pressure chip',
          ),
        'dsh-fish: pressure chip',
      )
      // 没有页签：页签会被宿主给每个会话都列出来，没法按会话隐藏（用户 m02888）。
      // 压力入口只留小胶囊，点开的弹层里是完整内容；非她这间房时胶囊本身不渲染。
    }

    exports.apply = apply
    exports.inject = inject
    exports.FishSection = FishSection
    return module.exports
  },
})
