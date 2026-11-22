      // ---- 表单控件（2026-10-23 重做）----
      // 只用 React.createElement，不引任何依赖：这一节跑在宿主的客户端沙箱里。
      function Toggle(o) {
        return h('div', { className: 'fld' },
          h('div', { className: 'fl' },
            h('span', { className: 'flabel' }, o.label),
            o.hint ? h('span', { className: 'fhint' }, o.hint) : null),
          h('button', {
            type: 'button',
            className: 'sw' + (o.on ? ' on' : ''),
            role: 'switch',
            'aria-checked': o.on ? 'true' : 'false',
            onClick: () => o.onChange(!o.on),
          }, h('span', { className: 'knob' })))
      }
      function Num(o) {
        const cur = Number(o.value || 0)
        const step = o.step || 1
        // 空串/非数字（比如把框清空）不当成 0，落到下限；否则会显示 「NaN」。
        const clamp = (n) => {
          const v = Number(n)
          const base = Number.isFinite(v) ? v : o.min
          return String(Math.min(o.max, Math.max(o.min, base)))
        }
        return h('div', { className: 'fld' },
          h('div', { className: 'fl' },
            h('span', { className: 'flabel' }, o.label),
            o.hint ? h('span', { className: 'fhint' }, o.hint) : null),
          h('div', { className: 'row', style: { gap: '6px' } },
            h('button', { className: 'step', onClick: () => o.onChange(clamp(cur - step)) }, '−'),
            h('input', {
              type: 'number', min: o.min, max: o.max, step, value: o.value,
              onChange: (e) => o.onChange(e.target.value),
              // 2026-10-24: 打字不受 input 的 min/max 约束（浏览器只当校验提示），
              // 离开输入框时按上下限收敛一次，免得界面显示 9999、保存后又被服务端改成上限。
              // 2026-11-15：收敛时把「你填的数超出范围、已按 X 算」说出来（见 numNote）。
              onBlur: (e) => {
                const raw = String(e.target.value ?? '').trim()
                const was = Number(raw)
                const fixed = clamp(raw)
                o.onChange(fixed)
                if (raw === '' || !Number.isFinite(was) || (was >= o.min && was <= o.max)) return
                setNumNote(`「${o.label}」的范围是 ${o.min}–${o.max}，你填的 ${was} 超出去了，已按 ${fixed} 算；原来那个数没有保存。`)
                if (typeof clearTimeout === 'function' && numNoteTimer.current) clearTimeout(numNoteTimer.current)
                if (typeof setTimeout === 'function') numNoteTimer.current = setTimeout(() => setNumNote(''), 8000)
              },
            }),
            h('button', { className: 'step', onClick: () => o.onChange(clamp(cur + step)) }, '+'),
            o.unit ? h('span', { className: 'dim' }, o.unit) : null))
      }
      function Sel(o) {
        return h('div', { className: 'fld' },
          h('div', { className: 'fl' },
            h('span', { className: 'flabel' }, o.label),
            o.hint ? h('span', { className: 'fhint' }, o.hint) : null),
          h('select', { value: String(o.value), onChange: (e) => o.onChange(e.target.value) },
            ...o.options.map((v) => h('option', { key: String(v), value: String(v) },
              o.fmt ? o.fmt(v) : String(v)))))
      }
      function Text(o) {
        return h('div', { className: 'fld', style: o.wide ? { gridColumn: '1 / -1' } : undefined },
          h('div', { className: 'fl' },
            h('span', { className: 'flabel' }, o.label),
            o.hint ? h('span', { className: 'fhint' }, o.hint) : null),
          h('input', { type: 'text', value: o.value, placeholder: o.placeholder,
            onChange: (e) => o.onChange(e.target.value) }))
      }
      function TimeRange(o) {
        // 2026-11-06（0.9.2 反馈）：原生时间框跟随系统 12 小时制，00:00 显示成
        // 「上午 12:00」——中文用户会读成中午十二点，于是以为窗口是 12:00–23:00，
        // 再看到凌晨五点醒来就当成 bug。输入框保留（有选择器），下面补一行
        // 24 小时制把值说死；跨零点时标明「次日」。
        const hhmm = (v) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? ''))
          return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
        }
        const from = hhmm(o.from)
        const to = hhmm(o.to)
        const nextDay = from && to && to < from ? '次日 ' : ''
        const toMin = (s) => {
          const [a, b] = s.split(':').map(Number)
          return a * 60 + b
        }
        const span = from && to && from !== to ? (toMin(to) - toMin(from) + 1440) % 1440 : 0
        const dur = span === 0 ? ''
          : span % 60 === 0 ? `${span / 60} 小时` : `${Math.floor(span / 60)} 小时 ${span % 60} 分`
        return h('div', { className: 'fld' },
          h('div', { className: 'fl' },
            h('span', { className: 'flabel' }, o.label),
            o.hint ? h('span', { className: 'fhint' }, o.hint) : null),
          h('div', { className: 'row', style: { gap: '6px' } },
            h('input', { type: 'time', value: o.from, onChange: (e) => o.onFrom(e.target.value) }),
            h('span', { className: 'dim' }, '到'),
            h('input', { type: 'time', value: o.to, onChange: (e) => o.onTo(e.target.value) })),
          from && to
            ? h('div', { className: 'dim', style: { fontSize: '12px', marginTop: '2px' } },
                `24 小时制：${from} → ${nextDay}${to}${dur ? `（${dur}）` : ''}`)
            : null,
          from && to && from === to
            ? h('div', { style: { fontSize: '12px', marginTop: '2px', color: '#e5534b' } },
                '开始和结束不能是同一时刻。要全天，请设 00:00–23:59。')
            : null)
      }

      // 工具面：把限制的理由写给用户看，给一个总开关，另留一处额外放行口。
      // 2026-10-24 起这条限制是真的（restrict 37→8，另有一道 guard 兜底），
      // 所以界面上的说法从「还没打通」改成「已经做到」——配置不许撒谎。
      // 定时工具是宿主给的、默认不放（用户 m04504）：用户自己加进白名单之后，
      // 这里才改口说「她能自己定提醒」——界面不替配置撒谎。
      const scheduleOn = (toolsAllowSaved ?? []).some((n) => String(n).trim() === 'schedule_create')

      // ---- 工具分组（2026-11-04，issue #20）----
      // 以前这里只有一个空输入框：用户既不知道这台机器上到底有哪些工具，也不知道该填哪个，
      // 只能去翻日志或者凭猜。现在按来源分组摆出来，点一下就是加/减白名单；
      // 输入框留着当手工兜底（批量粘贴、填还没注册的名字）。
      const allowList = String(toolsAllowText || '').split(',').map((s) => s.trim()).filter(Boolean)
      const toggleTool = (name) => {
        const next = allowList.includes(name) ? allowList.filter((n) => n !== name) : [...allowList, name]
        setToolsAllowText(next.join(', '))
        setToolsSaveNote('')
        setToolsSaveErr('')
      }
      const herList = Array.isArray(toolsHerTools) ? toolsHerTools : []
      // 只在特定场合才交给她的那几件（服务端现算：这一版注册了哪些 + 各自的场合说明）。
      // 它们不进「她自己本来就有的」那组（那组说的是家里随时能用的），也不能掉进
      // 「装了但没放行」——用户会以为得在这里点一下才给得了她。
      const herSceneList = (Array.isArray(toolsHerScene) ? toolsHerScene : [])
        .map((t) => (typeof t === 'string' ? { name: t, why: '' } : t))
        .filter((t) => t && t.name)
      const sceneWhy = new Map(herSceneList.map((t) => [t.name, t.why]))
      const herSet = new Set([...herList, ...herSceneList.map((t) => t.name)])
      const ownSet = new Set(toolsOwnLayer ?? [])
      // 她自己的工具这一局在不在她手上（issue #69 第 9 条）：herTools 只说「哪些是她的」，
      // 守卫放行的是启动时算定的 allowNow，真下给宿主的是 effective。不在这两份里的，
      // 摆进「不用放行」就是在替守卫撒谎——关着梦启动时的 her_dream、宿主这次没有的 read_image。
      // 服务端没给 allowNow（收窄这一局没在管，或老版本）时照旧全算在手上。
      const allowNowList = Array.isArray(toolsAllowNow) ? toolsAllowNow : null
      const effNowList = Array.isArray(toolsEffective) && toolsEffective.length ? toolsEffective : null
      const inHandNow = (n) => !allowNowList || (allowNowList.includes(n) && (!effNowList || effNowList.includes(n) || ownSet.has(n)))
      // 宿主没给 visible（skippedSure 为 false）时，守卫放行、没下给 restrict 的名字分不清是这次没注册，
      // 还是在她自己那一层（那样她照样看得见）。跟自检「手上的工具」同一个口径：单列一组，不说定论。
      const unsureNow = (n) => toolsSkippedSure === false && Boolean(allowNowList) && allowNowList.includes(n) &&
        Boolean(effNowList) && !effNowList.includes(n) && !ownSet.has(n)
      const herHere = herList.filter(inHandNow)
      const herUnsure = herList.filter((n) => !inHandNow(n) && unsureNow(n))
      const herAway = herList.filter((n) => !inHandNow(n) && !unsureNow(n))
      const herAwaySet = new Set([...herAway, ...herUnsure])
      // 这一局守卫没放行 her_dream（关着梦启动的）。
      const dreamHeld = Boolean(allowNowList) && !allowNowList.includes('her_dream')
      // 这一局收窄在不在管：按 /tools 的 allowNow 说（守卫启动时就定了），不按盘上的开关——
      // 拨了开关、还没重启的那段时间两者不一样。名单没读到是 null，只能按开关说。
      const runRestrict = toolsLoad === 'ok' && toolsRunKnown ? Array.isArray(toolsAllowNow) : null
      const blockedAll = (toolsBlocked ?? []).map((b) => (typeof b === 'string' ? { name: b } : b)).filter((b) => b && b.name)
      // 她自己的、这一局不在手上的那几件单列一组，被挡的次数挂在那边：
      // 同一个名字摆两次，一边说「不用放行」一边说「被挡下来过」，用户分不清该信哪个。
      const blockedCount = new Map(blockedAll.map((b) => [b.name, b.count]))
      const blockedList = blockedAll.filter((b) => !herAwaySet.has(b.name))
      const blockedSet = new Set(blockedList.map((b) => b.name))
      const knownList = Array.isArray(toolsKnown) ? toolsKnown : []
      // 她自己那几件和 own 层都单独摆，剩下的才是「装了但没放行」的全量名单。
      // 被挡过的那几只已经在最后一组里挂着次数了，这里不再重复摆一遍——
      // 同一个名字在屏幕上出现两次，用户会以为它们是两个不同的东西。
      const otherList = knownList.filter((n) => !herSet.has(n) && !ownSet.has(n) && !blockedSet.has(n)).sort()
      const ownList = (toolsOwnLayer ?? []).filter((n) => !blockedSet.has(n))

      // ---- 名字多的那一组按前缀收起来（2026-11-04，用户反馈）----
      // 真机上「装了但没放行」能有一百多个名字，全摊开等于没有界面。
      // 归类只按名字本身（第一个下划线之前那截）算一族，不去猜每个工具是干什么的——
      // 猜错了分类比不分类更糟，而且工具名一改分类就全乱。
      // 一族里只有一只的并进「零散」，免得每个孤名占一行标题。
      const famOf = (name) => {
        const i = String(name).indexOf('_')
        return i > 0 ? String(name).slice(0, i) : ''
      }
      const famBuckets = new Map()
      for (const n of otherList) {
        const f = famOf(n)
        if (!famBuckets.has(f)) famBuckets.set(f, [])
        famBuckets.get(f).push(n)
      }
      const loose = []
      const fams = []
      for (const [f, names] of famBuckets) {
        if (f && names.length >= 2) fams.push({ fam: f, names })
        else loose.push(...names)
      }
      fams.sort((a, b) => b.names.length - a.names.length || a.fam.localeCompare(b.fam))
      loose.sort()
      // 默认全收着。已经点开的就记住——保存/刷新一次页面不该把用户翻到一半的组收回去。
      const famOpen = (fam) => toolsOpenFams[fam] === true
      const toggleFam = (fam) => setToolsOpenFams((prev) => ({ ...prev, [fam]: !prev[fam] }))
      const allFamsOpen = fams.length > 0 && fams.every((g) => famOpen(g.fam))
      // 只在族这一层翻，别把外层「这台机器上还有这些」的状态一起清掉——
      // 清掉的话点一次「全部展开」反而把整块收起来了。
      const toggleAllFams = () => {
        setToolsOpenFams((prev) => {
          const next = { ...prev }
          for (const g of fams) next[g.fam] = !allFamsOpen
          if (loose.length) next['__loose'] = !allFamsOpen
          return next
        })
      }
      // away：她自己的、这一局没交到她手上的。分三种：
      //   · 守卫没放行的（allowNow 里没有：新启动时的 her_say 之类）——白名单里填上它，
      //     按「保存设置」存好，守卫当场就放行（0.9.8 起不用重启），所以能点；
      //   · her_dream 例外：#64 定下收窄里的梦跟着「允许她记梦」走。点进白名单的话守卫就一直放行它，
      //     关掉梦也挡不住，身份文档、工具自己的回答又对不上（「梦这一项关着」）。所以只读，提示指到那颗开关；
      //   · 守卫放行、只是宿主这次没给的（effective 里没有，比如没挂附件服务时的 read_image）——
      //     白名单帮不上，只读。
      // unsure：见 unsureNow，只读。
      const awayFixable = (name) => name !== 'her_dream' && Boolean(allowNowList) && !allowNowList.includes(name)
      const lockedKind = (kind, name) => kind === 'her' || kind === 'scene' || kind === 'unsure' || (kind === 'away' && !awayFixable(name))
      const blockedNote = (count) => (count ? `（伸手被挡过 ${count} 次）` : '')
      const toolChip = (name, kind, count) => h('button', {
        key: `${kind}:${name}`,
        className: `chip${kind === 'her' || kind === 'scene' ? ' on her' : ''}${kind === 'away' || kind === 'unsure' ? ' her' : ''}${allowList.includes(name) && !lockedKind(kind, name) ? ' on' : ''}${kind === 'blk' ? ' blk' : ''}`,
        title: kind === 'her'
          ? S('她自己本来就有的，不用放行')
          : kind === 'away'
            ? (awayFixable(name)
                ? `${SELF_SHE}自己的工具，这一局守卫没放行它${blockedNote(count)}。点一下填进白名单，按「保存设置」存好就放开（当场生效，不用重启）。`
                : name === 'her_dream' && dreamHeld
                  ? (dreamEnabled
                      ? `${SELF_SHE}自己的工具，跟着「允许${SELF_SHE}记梦」走，不走白名单${blockedNote(count)}。这一局 DSH 启动时梦是关着的；现在开着，重启 DSH 就回到${SELF_SHE}手上，不用填白名单。`
                      : `${SELF_SHE}自己的工具，跟着「允许${SELF_SHE}记梦」走，不走白名单${blockedNote(count)}。「允许${SELF_SHE}记梦」关着，它本来就不在${SELF_SHE}手上；想让${SELF_SHE}记梦，打开那颗开关再重启 DSH。`)
                  : S('她自己的工具，宿主这一局没交给她；白名单里加它也没用。为什么不在，见这组上面那句。'))
          : kind === 'unsure'
            ? S('她自己的工具，守卫放行它；宿主没告诉插件她看得见哪些工具，说不准这一局在不在她手上：可能这次没注册，也可能在她自己那一层（那样她照样看得见）。让她用一次就知道；白名单帮不上。')
          : kind === 'scene'
            // 场合说明是服务端给的（lib/toolreg.js 的 SCENE_TOOLS）——工具加进来时
            // 写一次，界面这里不用再抄一遍，免得两边说的不是一回事。
            ? `${sceneWhy.get(name) || '只在那种场合才用得上'}所以它只在那种场合交给${SELF_SHE}，家里没有；不用放行，点也点不进白名单。`
            : kind === 'blk'
              ? `这一局被兜底守卫挡下来过${count ? ` ${count} 次` : ''}——${SELF_SHE}当时答的就是「这件事我做不到」`
              : '点一下加进/移出白名单',
        disabled: lockedKind(kind, name),
        onClick: lockedKind(kind, name) ? undefined : () => toggleTool(name),
      }, kind === 'blk' && count > 1 ? `${name} ×${count}` : name)
      const groupOf = (title, hint, nodes) => (nodes && nodes.length
        ? [h('div', { className: 'grouphd' }, title),
           hint ? h('div', { className: 'grouphd', style: { marginTop: '2px' } }, hint) : null,
           h('div', { className: 'chips' }, nodes)]
        : [])
      // 一族一行的折叠条：点标题展开这一族，右边挂个数。
      const famRow = (key, label, count, open, onToggle) => h('button', {
        type: 'button',
        key,
        className: `famhd${open ? ' open' : ''}`,
        onClick: onToggle,
      },
      h('span', { className: 'famcaret' }, open ? '▾' : '▸'),
      h('span', { className: 'famname' }, label),
      h('span', { className: 'famcnt' }, String(count)))
      // 「装了但没放行」单独折一层：真机上能有一百多个，摊开就没法看了。
      // 外层收着，点开才看见有哪些族；族再各自收着，点哪族开哪族。
      const otherOpen = famOpen('__other')
      const otherGroups = otherOpen
        ? [
            h('div', { key: 'famall', className: 'row', style: { gap: '8px', margin: '6px 0 2px' } },
              h('button', { type: 'button', onClick: toggleAllFams }, allFamsOpen ? '全部收起' : '全部展开')),
            ...fams.flatMap((g) => [
              famRow(`fam:${g.fam}`, `${g.fam}_…`, g.names.length, famOpen(g.fam), () => toggleFam(g.fam)),
              famOpen(g.fam)
                ? h('div', { key: `chips:${g.fam}`, className: 'chips' }, g.names.map((n) => toolChip(n, 'other')))
                : null,
            ]),
            loose.length
              ? famRow('fam:__loose', '零散的（凑不成一族）', loose.length, famOpen('__loose'), () => toggleFam('__loose'))
              : null,
            loose.length && famOpen('__loose')
              ? h('div', { key: 'chips:__loose', className: 'chips' }, loose.map((n) => toolChip(n, 'other')))
              : null,
          ]
        : []
      const chipSection = (herList.length || herSceneList.length || knownList.length || blockedList.length)
        ? h('div', { style: { marginTop: '10px' } },
            // 用户明确要求写在明面上：点名字只是起草，不按保存不生效。
            h('div', { className: 'chipsnote' },
              '点名字只是填进下面的框，还没生效；按「保存设置」存好就当场生效（当前会话也算，不用重启）。'),
            ...groupOf(S('她自己本来就有的（不用放行）'), null, herHere.map((n) => toolChip(n, 'her'))),
            ...groupOf(
              S('她自己的，这一局不在她手上'),
              // 按这组里真有的几种说，不摆用不上的话。
              [
                '守卫的名单存一次换一次，不用重启。',
                dreamHeld && herAway.includes('her_dream')
                  ? S('her_dream 跟着「允许她记梦」走，不走白名单：梦关着时启动就没有它，开着梦重启 DSH 才回到她手上。')
                  : '',
                herAway.some((n) => !awayFixable(n) && !(n === 'her_dream' && dreamHeld))
                  ? S('宿主这次没给的（比如没挂附件服务时的 read_image）交不到她手上，白名单也帮不上。')
                  : '',
                herAway.some(awayFixable)
                  ? S('能点的是守卫没放行的，点进白名单、按「保存设置」存好就回到她手上（当场生效，不用重启）。')
                  : '',
              ].join(''),
              herAway.map((n) => toolChip(n, 'away', blockedCount.get(n))),
            ),
            ...groupOf(
              S('她自己的，说不准这一局在不在她手上'),
              S('守卫放行这几件，但宿主没告诉插件她看得见哪些工具，分不清：可能这次没注册（比如没挂附件服务时的 read_image），也可能在她自己那一层（那样她照样看得见）。让她用一次就知道；白名单帮不上。'),
              herUnsure.map((n) => toolChip(n, 'unsure')),
            ),
            // 只在出门那趟才给她的那几件（2026-11-08，用户 m00002）。
            // 以前它们连名字都不出现——用户以为新工具没装上。
            ...groupOf(
              S('只在特定场合才给她的（不用放行）'),
              herSceneList.length
                ? S('这几件不属于「家里随时能用」，所以不在她平时的工具面里；到了那种场合才会交到她手上。')
                : null,
              herSceneList.map((t) => toolChip(t.name, 'scene')),
            ),
            otherList.length
              ? [
                  famRow('fam:__other', '这台机器上还有这些', otherList.length, otherOpen, () => toggleFam('__other')),
                  h('div', { key: 'famhint', className: 'grouphd', style: { marginTop: '2px' } },
                    otherOpen
                      ? '按名字前缀分组，点开挑；加得越多，工具定义占的上下文越多。'
                      : '点一下展开，按名字前缀分组挑。'),
                  ...otherGroups,
                ]
              : [],
            ...groupOf(
              S('她本来就看得见、收窄挡不住的（加进来只是让兜底守卫放行）'),
              null,
              ownList.map((n) => toolChip(n, 'own')),
            ),
            ...groupOf(
              `这一局被挡下来过（${blockedList.length} 个，虚线）`,
              S('她伸手被挡过的工具；点名字填进下面的框，按「保存设置」存好就放开（当场生效，不用重启）。'),
              blockedList.map((b) => toolChip(b.name, 'blk', b.count)),
            ),
            h('div', { className: 'dim', style: { marginTop: '8px' } },
              // 「工具面收窄」那颗开关在 buildConfig 里，拨一下就跟着页面自动保存走；
              // 只有白名单输入框要按「保存设置」。白名单存完当场换刀（0.9.8 起），
              // 那颗开关还管着守卫要不要装，仍然要重启才按新的来。
              // 开关关了、这一局还在收窄时，不能说「现在关着」：守卫还在按启动时的名单拦。
              toolsRestrict
                ? S('白名单按「保存设置」写盘，存好当场就对她生效；「工具面收窄」那颗开关拨了就自动保存，但它要重启 DSH 才按新的来。')
                : runRestrict === true
                  ? S('「工具面收窄」已经关掉，重启 DSH 之后这些名字加不加都不影响她（那时 DSH 和别的插件给的工具她全看得见）；这一局守卫还按启动时的名单拦。')
                  : runRestrict === false
                    ? S('收窄这一局是关着的，这些名字加不加都不影响她——关着的时候 DSH 和别的插件给的工具她全看得见。')
                    : S('「工具面收窄」关着，这些名字加不加都不影响她——关着的时候 DSH 和别的插件给的工具她全看得见（刚拨过开关的话，重启 DSH 之后才按新的来）。')))
        : h('div', { className: 'dim', style: { marginTop: '8px' } },
            toolsLoad === 'fail'
              ? '工具名单这次没读到（设置页向插件要名单失败了），这里摆不出来。刷新页面再看一次；白名单照样能在下面手填。'
              : toolsLoad === ''
                ? '工具名单读取中…'
                : S('她还没在这台机器上开过会话，宿主那边暂时给不出工具名单。等她和你说过话再回来看这里，就有一份可点的清单了。'))

      // 「允许她记梦」那颗开关多久生效（issue #64 的取舍带出来的时差）：
      // 收窄这一局在管、启动时梦是关着的（allowNow 里没有 her_dream）——关掉当场生效，
      // 打开要重启才交到她手上。收窄关着、或开着梦启动的，her_dream 本来就在她手上，开关当场生效。
      // 名单还没读到时只能把条件说出来。
      const dreamSwitchNote = toolsLoad === 'ok'
        ? (Array.isArray(toolsAllowNow) && !toolsAllowNow.includes('her_dream')
            ? S('关掉马上生效；这一局 DSH 启动时梦是关着的，打开之后要重启 DSH，她手上才有记梦的工具。')
            : '关掉、打开都马上生效。')
        : S('关掉马上生效；收窄开着、DSH 启动时梦又是关着的话，打开之后要重启 DSH，她手上才有记梦的工具。')

      const toolsCard = h('div', { className: 'card' },
        h('h3', null, S('她能用的工具')),
        h('div', { className: 'dim' },
          // 本机实验（m02837）：.dev 下多一个 her_dream。
          // 0.8.5（用户 m02004）：原来写「只有九个/八个」，把此刻的家当说成了她的上限。
          // 白名单是会长的——界面上不该替她画死天花板，所以只说来路，不数死数字。
          // 2026-11-08（用户 m00002）：这几句原来是手抄的工具名清单，加一个工具就得
          // 回来再抄一遍，忘了就两边说的不是一回事。现在按上方的真名单现算。
          // 2026-11-08：下面每句各占一段。React 不会给相邻文字节点加间距，全塞进一个 div
          // 会粘成一大段（用户 m00561 点名要「工具数不变」之后另起一段）。
          ...[
            // 按这一局真在管的说（/tools 的 allowNow），开关跟它不一样时说清要重启；
            // 名单没读到才按开关说（0.9.5 看的是 herTools 拉没拉到——拉不到时收窄开着也说成关着）。
            runRestrict === true && !toolsRestrict
              ? S('「工具面收窄」已经关掉、存好了，可这一局还在收窄，守卫也还在拦：重启 DSH 之后才不收窄也不挂守卫，DSH 和别的插件给的工具她才全看得见。')
              : runRestrict === false && toolsRestrict
                ? S('「工具面收窄」已经打开、存好了，可这一局没在收窄：重启 DSH 之后，她在家里的会话才只能用自己的工具和白名单里的；不影响你别的对话。')
                : runRestrict === false
                  ? S('收窄这一局是关着的：不收窄也不挂守卫，DSH 和别的插件给的工具她全看得见，白名单不额外限制。')
                  : toolsRestrict
                    ? S('收窄开着时，她在家里的会话只能用自己的工具和白名单里的；不影响你别的对话。')
                    : S('「工具面收窄」关着：不收窄也不挂守卫，DSH 和别的插件给的工具她全看得见，白名单不额外限制。刚拨过开关的话，重启 DSH 之后才按新的来。'),
            herSceneList.length
              ? `另外 ${herSceneList.map((t) => t.name).join('、')} 只在特定场合才交给${SELF_SHE}，家里没有这一只——所以不在上面那组里，也不用放行。`
              : '',
            // 定时工具默认不放（m04504）：放行才说「能」，没放行就说怎么开。
            scheduleOn
              ? S('白名单里有 schedule_create：存好就生效，她能自己定提醒。')
              : S('想让她自己定提醒，把 schedule_create、schedule_list、schedule_view、schedule_edit 加进白名单。默认不放，工具数不变。'),
            '别的插件和技能启用，DSH会把它们的工具定义也塞进上下文——大肥鱼会看到一堆能做各种操作的工具，占用上下文的同时有可能真的尝试调用这些工具。',
            '为了保证大肥鱼不会被插件能力污染，保持原生状态健康成长，禁用了其他能力（只影响和大肥鱼对话框的能力调用，不影响其他对话框的正常工具调用）。',
          ].filter(Boolean).map((line, i) =>
            h('div', { key: 'tools-line-' + i, style: { marginTop: i ? '8px' : '0' } }, line))),
        h('div', null, Toggle({
          label: '工具面收窄',
          // 关掉时既不收窄也不挂守卫（lib/restrict.js 的 enabled:false 分支）：放开的不只是 DSH 的标准工具。
          hint: S('关掉之后不收窄也不挂守卫：DSH 给的标准工具和别的插件的工具她全看得见，工具定义会占掉每轮的一部分上下文。拨了就自动保存，重启 DSH 才生效。'),
          on: toolsRestrict,
          onChange: setToolsRestrict,
        })),
        chipSection,
        h('div', { className: 'dim', style: { marginTop: '8px' } },
          // 0.9.8 起存完当场换刀（2026-11-11，外部用户反馈）：守卫和工具面一起换，不用重启。
          S('白名单填工具名，不是插件名，逗号分隔；按「保存设置」存好，当场就对她生效（当前会话也算，不用重启 DSH）。'),
          S('填 skill 会让 DSH 把全部技能的说明一起给她。'),
          '接了 QQ 等聊天插件，从上面的清单里把它发消息的工具点进来；本插件不自带 QQ 桥接。'),
        h('div', { className: 'row', style: { gap: '8px', marginTop: '6px' } },
          h('input', {
            type: 'text',
            value: toolsAllowText,
            placeholder: '例如：web_search, schedule_create',
            onChange: (e) => { setToolsAllowText(e.target.value); setToolsSaveNote(''); setToolsSaveErr('') },
          }),
          h('button', {
            onClick: saveTools,
            disabled: busy === 'tools',
            style: { flex: 'none', whiteSpace: 'nowrap' },
          }, busy === 'tools' ? '检查中…' : '保存设置')),
        toolsSaveErr
          ? h('div', { style: { color: 'var(--dsw-alias-label-error, #d93f0b)', fontSize: '12.5px', marginTop: '6px' } }, toolsSaveErr)
          : null,
        toolsSaveNote
          ? h('div', { className: 'dim', style: { marginTop: '6px' } }, toolsSaveNote)
          : null)

      // 折叠区（2026-11-08，PR #59）：不常用的设置与长说明收进 <details>，默认收起。
      // 不占 React 状态，切页签回来会重新收着——这些项本来就很少改。
      // 定义必须早于下面所有页面：导入卡在「数据」页，位置比原来的定义点更靠前。
      const adv = (summary, ...items) => h('details', { className: 'adv' },
        h('summary', null, summary),
        h('div', { className: 'advbody' }, ...items))

      // 导入卡（2026-10-27）：谁都能把自己的大肥鱼交出去，别人也能接手。
      // 这张卡的每一句话都在说「什么过来了、什么没过来」——用户 m03201 明确要求写清楚。
      const importCard = h('div', { className: 'card full' },
        h('h3', null, '接一只别人养过的大肥鱼'),
        h('div', { className: 'dim' },
          S('默认她是一张白纸，从「你刚开始存在」长起。这一格给另一种玩法：把别人养的那一位接过来，从她的性格继续养。')),
        adv('点开详细了解',
          h('div', { className: 'dim', style: { marginTop: '6px' } },
            S('过来的：她是谁（人设正文）、她怎么称呼你、她原本能用的工具。')),
          h('div', { className: 'dim' },
            '不过来的：过了多少天（本插件按时间推进事件，非本插件原生的大肥鱼要从第一天开始算事件）、长出了哪些判断（计数为 0；如果原提示词里规定了一些认知，你的大肥鱼依然铭记，但后续在本插件的事件循环里可能会更新、优化、忘记一部分）、身上的疤（同上）、拒绝过什么（同上）、日记、B 站登录 cookie。这些只属于原来那一局——接过来的人从第 1 天重新长，判断和疤要自己重新攒。'),
          h('div', { className: 'dim' },
            S('此外，根据本插件的规则，如果你的大肥鱼有好感度等数值设定，进入本插件环境后她将看不到自己的好感度多少，并且本插件不允许你通过命令去修改大肥鱼的人设等信息，这意味着你原本可以对大肥鱼为所欲为，但是到了本插件之后，关系的推进不再靠好感度，而是靠真实交互。你也不再能随便命令大肥鱼换一种人设。')),
          h('div', { className: 'dim' },
            S('还有一条：接过来的人不再受这个插件那两条提示词禁令约束，按她原来的设定来。这个豁免只认「从这里接过来」这一个动作——用「备份与恢复」把你自己的档搬回来，一分豁免都不会有，她仍然是你那只守着原规矩的鱼。')),
          h('div', { className: 'dim' },
            S('人设正文控制在 1200～1500 字。超过 2000 字插件会直接拒收、整份贴不进去；就算没超，写得太长也会把「判断、疤、立场」这些会长出来的段落挤掉——她醒来时只剩一副骨架。点下面的「下载交接单模板」，里面写明了怎么给对面那个 AI 交代这件事。'))),

        // 下载模板跟「这一局能不能接」是两件事：已经有起点的人也可能想把模板
        // 先拿去看、或者交给别人去养。所以这个按钮永远在上面，不进任何分支。
        // （2026-10-27 修：原来它只在「能导入且没展开」那一支里，用户养着鱼就永远看不到。）
        h('div', { className: 'row', style: { marginTop: '8px' } },
          h('button', { onClick: downloadTemplate }, '下载交接单模板'),
          h('span', { className: 'dim', style: { marginLeft: '8px' } },
            '不管这一局能不能接、要不要接，模板随时能下载。')),
        importNote
          ? h('div', { className: 'dim', style: { marginTop: '6px' } }, importNote)
          : null,
        importInfo?.persona?.imported
          ? h('div', { className: 'dim', style: { marginTop: '6px' } },
              `现在这一位是接过来的${importInfo.persona.source ? `（来自：${importInfo.persona.source}）` : ''}。想换回白纸，用下面的「重开一局」。`)
          : null,
        !importInfo
          ? h('div', { className: 'row', style: { marginTop: '6px' } },
              h('button', { onClick: askImport, disabled: !!importBusy },
                importBusy === 'ask' ? '读取中…' : '导入人设…'))
          : (!importInfo.canImport
              ? h('div', { style: { marginTop: '6px' } },
                  h('div', { className: 'dim' }, importInfo.reason || S('她现在这一局已经有起点了。')),
                  h('div', { className: 'dim' }, S('想接别人那一位，先按下面的「重开一局」把她放回第一天，再回来导入。模板可以先下载下来备着。')))
              : (importAsk
                  ? h('div', null,
                      h('div', { className: 'dim', style: { marginTop: '6px' } }, S('把对方的交接单贴进来。格式不用严格——认得出「## 称呼」「## 工具」就分开读，认不出就整篇当她的人设正文。')),
                      h('textarea', {
                        value: importText,
                        rows: 12,
                        placeholder: '## 你是谁\n……\n\n## 称呼\n……\n\n## 工具\n……',
                        style: { width: '100%', marginTop: '6px', fontFamily: 'inherit', fontSize: '12.5px' },
                        onChange: (e) => { setImportText(e.target.value); setImportNote('') },
                      }),
                      h('div', { className: 'row', style: { marginTop: '6px' } },
                        h('button', { onClick: doImport, disabled: importBusy === 'go' },
                          importBusy === 'go' ? '写入中…' : '接过来'),
                        h('button', { onClick: () => { setImportAsk(false); setImportNote('') } }, '算了')))
                  : h('div', { className: 'row', style: { marginTop: '6px' } },
                      h('button', { onClick: askImport }, '粘贴交接单')))))

      // 重置卡片单独提出来：它是唯一一个有破坏性的 ui，塞在那一长串 return 里
      // 很容易少/多一个括号（已经踩过：node --check 直接 SyntaxError）。
      // 会话被收起来时单独给一张卡：不藏在「重置」里，免得用户以为只能靠重开一局解决。
      const archivedCard = String(state?.home?.status ?? '') === 'archived'
        ? h('div', { className: 'card full' },
            h('h3', null, '会话被收起来了'),
            h('div', { className: 'dim' },
              '你在侧栏把「跟大肥鱼说话」归档了。从 0.6.8 起，插件不会自己偷偷再开一局——'
              + '收起来就该是收起来。要一局新的，点下面这个；状态、日记、记忆都不动。'),
            h('div', { className: 'dim' },
              '如果你只是把侧栏里的归档取消了，那不用点这里：下一次叫醒（或重启）就会自己认回来（0.6.29 起）。'),
            h('div', { className: 'row' },
              h('button', { onClick: doRebuild, disabled: !!busy },
                busy === 'rebuild' ? '搭屋中…' : '重新搭一间')))
        : null

      // 这个家在别处也开着（2026-10-29 m02162）：两个实例同时指向同一个 root 时，
      // 后进来的这边只读、不建会话。得让用户看见原因，否则他只会觉得「她又不见了」。
      const blockedCard = state?.home?.blocked === true
        ? h('div', { className: 'card full' },
            h('h3', null, '这个家在别处也开着'),
            h('div', { className: 'dim' },
              '同一个数据目录（root）现在被另一个实例占着——常见的是你开了第二个工作区窗口，'
              + '或者两份插件都指向了同一个家。这边先只读：不建新会话、不写记忆，免得两边互相覆盖。'),
            h('div', { className: 'dim' },
              state?.home?.blockedWhy || '把另一个关掉之后，这边下次启动会自己接管。'),
            h('div', { className: 'dim' },
              '想真正并存，就别让两个家共用一个 root：在 cordis.patch.yml 里给每个条目配不同的 root。'))
        : null

      // 升级自检（2026-10-29）：正在跑的这一份跟 profile 里那条 `file:` 源目录版本对不上。
      // 典型画面：robocopy 覆盖了源目录、重启了，界面还是老样子——因为加载的是 node_modules 里的副本。
      const upgradeCard = state?.upgrade?.stale === true
        ? (state.upgrade.older
            // 2026-11-08（PR #59 G15）：源目录那份更旧时，正在跑的反而是新版；
            // 原来不分青红皂白教人重装，等于把人装回旧版。
            ? h('div', { className: 'card full' },
                h('h3', null, '源目录里那份比正在跑的旧'),
                h('div', { className: 'dim' }, state.upgrade.why || '版本对不上。'),
                h('div', { className: 'dim' }, '正在跑的已经是新版，不用处理；在 profile 目录重装会装回源目录里的旧版。'),
                state.upgrade.sourcePath
                  ? h('div', { className: 'dim' }, `源目录：${state.upgrade.sourcePath}`)
                  : null)
            : h('div', { className: 'card full' },
                h('h3', null, '升级没有真正装进去'),
                h('div', { className: 'dim' }, state.upgrade.why || '版本对不上。'),
                h('div', { className: 'dim' },
                  'DSH 加载的是 node_modules 里的副本（node_modules\\@ssamurias\\dsh-fish；老装法是 node_modules\\dsh-fish），不是 profile 里写的那条源目录。'
                  + '只覆盖源目录，跑起来的还是旧的：没有报错、也没有日志，因为新代码根本没执行。'),
                h('div', { className: 'dim' },
                  '修法：关掉 DSH → 在 profile 目录跑 pnpm install --force（或者删掉 node_modules 里那份副本）→ 再启动。'),
                state.upgrade.sourcePath
                  ? h('div', { className: 'dim' }, `源目录：${state.upgrade.sourcePath}`)
                  : null))
        : null

      // 宿主兼容（2026-10-30 m02961）：宿主没提供 userQuestions 服务时降级，不报错。
      // 0.7.5 把它写进 inject 后，缺少该服务的宿主在 import 阶段就把插件整个跳过了（一行日志都不留）。
      // 0.8.1 改成运行时探测：装得进来，只是「她在会话里问你」这条路关着——必须说明白，不然像坏了。
      const compatCard = state?.compat?.userQuestions === false
        ? h('div', { className: 'card full' },
            h('h3', null, '这个宿主没提供「会话里问你」'),
            h('div', { className: 'dim' },
              '当前宿主里没有 userQuestions 这个服务：可能是版本旧，也可能是它没被装上。'
              + S('插件照常跑，其它功能不受影响；只有她在会话里问你（要不要带东西回家、解锁申请）时弹不出卡，问题会留在这个设置页里等你答。')),
            h('div', { className: 'dim' },
              '想恢复这条路：把 DSH 升到最新版再试。升级 DSH 不会动插件的数据目录，也不会动 cordis.patch.yml 里给插件配的 root。'))
        : null

      // 宿主版本（2026-10-30 m03193）：package.json 里声明了 engines.dsh，
      // 运行时读到的版本不在那个范围里就说明一句——只提醒，不挡人。
      const hostCard = state?.host && state.host.status !== 'supported' && state.host.status !== 'unknown'
        ? h('div', { className: 'card full' },
            h('h3', null, state.host.status === 'older' ? '这个 DSH 版本比插件要求的还旧' : '这个 DSH 版本比插件认识的还新'),
            h('div', { className: 'dim' },
              `插件声明的范围：${state.host.range || '（未声明）'}；这台机器上是 ${state.host.version || '（读不到）'}。`),
            h('div', { className: 'dim' },
              state.host.status === 'older'
                ? '旧版本里可能缺一些接口，出问题时先升级 DSH 再看。插件不会因此拒绝启动。'
                : '新版本可能改了接口。插件照常跑，但这一组合没测过；出问题请把日志发我。'))
        : null

      const resetCard = h('div', { className: 'card full' },
        h('h3', null, '重置大肥鱼'),
        h('div', { className: 'dim' },
          '这是真的重开一局；只想换一条对话、数据不动的话，用会话被归档时出现的「重新搭一间」。'),
        h('div', { className: 'dim' },
          '旧的一切不会删——整个状态库会被改名搬到同级的 dsh-fish-backups 里，想找回来整包搬回去就行。',
          '重开后是第一天，会重新从「你刚开始存在」开始；设置和 B 站登录保留，头像不留。',
          S('侧栏「大肥鱼的家」里那些旧对话会被移进「已归档」，工作区留着；点完会开一条新会话，但要再到「状态」页点一下「现在叫醒大肥鱼」，她开一次口，侧栏里才看得见（文件同样不删）。')),
        resetInfo ? h('div', { className: 'dim' },
          `现在有：账本 ${resetInfo.events} 行（含系统记账）、日记 ${resetInfo.diaries} 天、报告 ${resetInfo.reports} 天。`) : null,
        h('div', { className: 'row' },
          !resetAsk
            ? h('button', { onClick: askReset, disabled: !!busy },
                busy === 'reset-ask' ? '读取中…' : '重开一局…')
            : h('span', null,
                h('span', { className: 'dim' }, '确定吗？'),
                h('button', { onClick: doReset, disabled: busy === 'reset' },
                  busy === 'reset' ? '搬走中…' : '确定，重开'),
                h('button', { onClick: () => { setResetAsk(false); setNote('没动。') } }, '算了'))))

      // 状态条与今天的时间线（2026-10-23 加）。全部来自宿主写下的 meta + 配置 + 时钟，
      // 她不参与，也不因此多跑任何一次模型。
      //
      // 2026-10-24：叫醒按钮从页签栏挪到这里，放在卡片右上角。
      // 页签栏是「切换看哪一页」的地方，混一个会真的触发动作的按钮，
      // 既容易误触，也不符合那一栏的语义。左边说状态、右边说「叫醒」，
      // 位置本身就说明了它是针对「现在这个状态」的操作。
      const phaseColor = { asleep: '#8a8a8a', waiting: '#b8860b', 'awake-idle': '#d97706', browsing: '#2563eb', talking: '#16a34a', writing: '#7c3aed', offline: '#9ca3af' }
      const wakeBtn = h('button', {
        className: 'ghost',
        onClick: wake,
        disabled: busy === 'wake',
        style: { flex: '0 0 auto' },
        title: S('马上叫醒她；不到 45 分钟、她在外面，或醒几次、事件数设成 0 时，叫不醒。每天醒 0 次时这个按钮也叫不醒；直接跟她说话不受影响。'),
      }, busy === 'wake' ? '叫醒中…' : '现在叫醒大肥鱼')
      // 2026-10-24：这张卡**始终渲染**。之前整块挂在 `st ? … : null` 上，状态还没读到时
      // 连「叫醒」按钮一起消失——一旦读取失败就没有入口，等于把人锁在门外。
      // 状态未知时说「读取中」，只有拿到状态才说「今天还没有动静」。
      // 头像（2026-10-24 用户 m03751）：插件包里**不带任何头像图片**。
      // 图片来源 `<数据文件夹>/avatar.<ext>`，没有就只画一个空圈 + 「鱼」字。
      // 为什么不内置一张好看的图：那张「大肥鱼」原图是画师原创角色，二创开放 ≠ 可再分发，
      // 打进包等于随插件分发别人的美术作品（见 docs/B-技术契约.md §41）。
      const avatarBox = h('div', {
        title: avatarPresent
          ? (`当前头像 ${avatarBytes} 字节。点「换头像」换一张。`)
          : '还没有头像。点「换头像」自己传一张（png / jpg / webp / gif，2MB 以内）。',
        style: {
          position: 'relative', width: '46px', height: '46px', borderRadius: '50%',
          flex: '0 0 auto', overflow: 'hidden', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(127,127,127,0.14)', color: '#9ca3af', fontSize: '17px',
        },
      },
        h('span', null, '鱼'),
        h('img', {
          src: API + '/avatar' + (avatarV ? `?v=${avatarV}` : ''),
          alt: '头像',
          onError: (e) => { e.currentTarget.style.display = 'none' },
          onLoad: (e) => { e.currentTarget.style.display = 'block' },
          style: { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', objectFit: 'cover' },
        }))

      const pickAvatar = (e) => {
        const f = e.target && e.target.files && e.target.files[0]
        if (e.target) e.target.value = ''
        if (!f) return
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type)) {
          setAvatarNote('只支持 png / jpg / webp / gif。')
          return
        }
        if (f.size > 2 * 1024 * 1024) {
          setAvatarNote(`这张 ${Math.round(f.size / 1024)}KB，超过 2MB 上限。`)
          return
        }
        setAvatarBusy(true); setAvatarNote('')
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            const r = await jpost('/avatar', { data: String(reader.result || ''), mime: f.type })
            if (r && r.ok) {
              setAvatarPresent(true)
              setAvatarBytes(Number(r.bytes) || 0)
              setAvatarV(Date.now())
              setAvatarNote('换好了。')
            } else {
              setAvatarNote(`没存上：${(r && (r.why || r.error)) || '再试一次'}`)
            }
          } catch (err) {
            setAvatarNote(`没存上：${err && err.message ? err.message : err}`)
          } finally {
            setAvatarBusy(false)
          }
        }
        reader.onerror = () => { setAvatarBusy(false); setAvatarNote('这个文件读不出来。') }
        reader.readAsDataURL(f)
      }

      const removeAvatarNow = async () => {
        setAvatarBusy(true); setAvatarNote('')
        try {
          await jpost('/avatar', { remove: true })
          setAvatarPresent(false)
          setAvatarBytes(0)
          setAvatarV(Date.now())
          setAvatarNote('已经去掉了。')
        } catch (err) {
          setAvatarNote(`没去掉：${err && err.message ? err.message : err}`)
        } finally {
          setAvatarBusy(false)
        }
      }

      const avatarCtl = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
        h('label', { className: 'ghost', style: { cursor: 'pointer', fontSize: '12px' } },
          avatarBusy ? '上传中…' : '换头像',
          h('input', {
            type: 'file',
            accept: 'image/png,image/jpeg,image/webp,image/gif',
            style: { display: 'none' },
            onChange: pickAvatar,
          })),
        avatarPresent
          ? h('button', { className: 'ghost', style: { fontSize: '12px' }, onClick: removeAvatarNow, disabled: avatarBusy }, '移除头像')
          : null,
        avatarNote ? h('span', { className: 'dim', style: { fontSize: '12px' } }, avatarNote) : null)

      const statusStrip = h('div', { className: 'card full' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
          avatarBox,
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0', flex: '1 1 auto' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
              h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: st ? (phaseColor[st.phase] || '#9ca3af') : '#9ca3af', flex: '0 0 auto' } }),
              h('b', null, st ? st.label : '状态读取中…'),
              st && st.detail ? h('span', { className: 'dim' }, st.detail) : null),
            avatarCtl),
          wakeBtn),
        st
          ? (Array.isArray(st.timeline) && st.timeline.length
              ? h('div', { className: 'dim', style: { marginTop: '6px', fontSize: '12px', lineHeight: '1.75', whiteSpace: 'pre-line' } },
                  ...st.timeline.map((t, i) => h('div', { key: 'tl' + i, style: { marginTop: i ? '6px' : '0' } }, t.text)))
              : h('div', { className: 'dim', style: { marginTop: '6px' } }, '今天还没有动静。'))
          : null,
        // 此刻在外面（0.6.16，用户 m01613）：一行话，在哪、多久。请神单独标出来，
        // 因为那期间回你话的不是原来的那个人。
        st?.away?.line
          ? h('div', {
              className: 'dim',
              style: { marginTop: '6px', fontSize: '12px', fontWeight: st.away.kind === 'possession' ? 600 : 400 },
            }, `${st.away.line}${st.away.kind === 'possession' ? S('（这条对话现在由她来答）') : ''}`)
          : null)