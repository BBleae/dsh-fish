      // ================================================================
      // 设置界面 2.0（2026-10-24 重做）
      //
      // 分组原则换了：上一版按「控件属不属于同一类」分（生长/上网/说话/数据），
      // 这一版按「这属于她生活里的哪一块」分——状态 / 成长 / 住所 / 上网 /
      // 记忆 / 插件 / 原理 / 数据。
      //
      // 两条硬规则（都是上一版踩过坑换来的）：
      //   1. **没有「全部」页**（用户 2026-10-24 要求删掉）。每个设置项必须归到
      //      某一页里，不许有哪一项只活在一个「万能页」上。
      //   2. **页签只用于聚焦，不用于隐藏**。删掉「全部」之后，每一页自己就得是
      //      完整的——不能出现「这一项要点两次才找得到」。
      //
      // 文案规则：
      //   · 每个分组标题下面一句人话，说清这一组管什么，不列字段清单；
      //   · 看不懂的词把定义放进 title（鼠标停上去就能看），不塞进正文占三行；
      //   · 面向用户的字符串里**不出现「她/他」**（test/p5.test.mjs 有硬断言）。
      // ================================================================

      // 出门页从 0.8.0 起对所有人可见（2026-10-30，用户 m01904）：不再看 devMode。
      // 误用的门改在页面里——第一次进来先点一次「我知道了」，三个入口按钮才放开。

      const TABS = [
        ['now', '状态'],
        ['grow', '成长'],
        ['home', '住所'],
        ['bili', '上网'],
        // 2026-10-30（用户 m02207）出门挪到「上网」和「记忆」中间：它是她离开家去干活，
        // 跟上网（出门看东西）是同一类事，放在记忆之前更顺。
        ['outing', '出门'],
        ['memory', '记忆'],
        ['env', '插件'],
        ['principle', '原理'],
        // 2026-11-16（用户 m03816）：原来这里还有第 10 个页签「说明」。
        // 他不要独立一页——「说明」挪到原理页最上面、三张图上方，
        // 而且不再在 App 里就地渲染那 62 条，只留一个蓝链，点一下由浏览器打开
        // （见下面 WikiLink 那一段注释：为什么只有回环小站这条路走得通）。
        ['data', '数据'],
        ['feedback', '反馈'],
      ]

      // 只有这几个页签里的东西是「改完就写盘」的。没有设置项的页签（状态 / 住所 / 原理 / 数据）
      // 不显示那句提示；「插件」也不显示——工具面收窄要重启才生效，白名单要手动保存（2026-10-24 用户要求）。
      const AUTO_SAVE_TABS = new Set(['grow', 'bili', 'memory'])

      const TAB_HELP = {
        now: S('状态：她现在的状态、阶段、规矩，和你不在时的事。'),
        grow: '成长：成长周期、定时醒来、主动搭话、日记和梦。',
        home: S('住所：她的工作区与会话、请求、日记、她留下的东西、梦、小纸条和自检。'),
        bili: S('上网：她翻视频、看画面、发评论，以及 B 站登录。'),
        memory: '记忆：会话多久换新、身份段多长、记忆概况与体检。',
        env: S('插件：她能用哪些工具，以及版本与更新。'),
        principle: S('原理：她怎么长大、记忆怎么筛、理论出处。最上面有整套说明的入口。'),
        data: '数据：位置、备份迁移、报告日志、导入与重置。',
        feedback: '反馈：常见问题、找开发者、交流群。',
        outing: S('出门：送她去别的工作区或对话干活；在外时家里的定时日程暂停。'),
      }

      // 出门页顶部的说明卡（2026-10-30，用户 m00650 / m01100）：文字是用户自己写的，
      // 一个数组元素就是一段。想改说明只改这里，别动下面的渲染结构。
      const OUTING_INTRO = [
        '本功能为想要让大肥鱼拥有完整权限和工具干活的用户设计，且附带了一些偏娱乐（但也有些危险）的功能。',
        '偏实验性，虽然做了人格防护，但是如果你担心可以暂时不用。具体的可以看下面各节。',
        '工作园区是一个固定目录的工作区，工具和权限按这个工作区的设置给。第一次去时不带项目记录；用过以后，这个工作区自己攒下的记录（交接文档、记忆插件的总结）和文件都会留着，目录不会自动清空，也可以接着上次那条对话做。如果只是想让大肥鱼可以干活，建议选这个。',
        S('想要体验让大肥鱼去别的工作区串门会带来什么戏剧性效果，可以选择送她出门（真身出门）和请神（灵魂出窍）。'),
        S('送她出门：开发者本人测试，在人格较为弱小的情况下，选择让大肥鱼去你已经有很多工作性质内容的对话框去接班，会导致大肥鱼的人格几乎被消弭，最终沦为一个助手性质的输出（因为上下文很多都是说你是一个助手），并且会读取到该工作区的记忆插件、交接文档、工作记录，可能会知道很多不该知道的内容（有些东西是全工作区可见，非单条对话框可见）。不确定人格强大之后能不能维持住人格。为了防止意外情况，给了「整趟不算」：这趟她写下的不再算进她的成长，但原话还留在记录里，她自己翻记录时还翻得到。如果你认为她在工作中确实学到了一些东西，可以只划掉不想要的，其余的照常算。'),
        S('请神：开发者本人测试，人格保留和表现较为完整，会在自身认知的基础上，调用工具帮你完成工作。没有读取过多上下文，但是如果你的工作任务是需要她读取上下文，她依然会读很多内容，可能会知道一些不该知道的内容（有些东西是全工作区可见，非单条对话框可见）。同样可以整趟不算，或者只划掉其中几条。'),
      ]

      // 阶段与门：写清楚，因为「下一个成长瓶颈」这几个字原来没人看得懂。
      // 四行措辞是用户在设置页上亲手写的（2026-10-24），已固化进源码，别再改回短的。
      // 成长周期 14 天及以下时，自主、主动两道瓶颈各只要一次（derive.js 的 gateNeed，由 /state 的 gateTimes 给出）。
      // 用户定的「两次」那两行原样留着，只在一次就够时换成「一次」的说法；没读到状态时按两次写。
      const onceFor = { autonomy: 'refuse', competence: 'revise' }
      const needOnce = (gate) => Number(s?.gateTimes?.[onceFor[gate]]) === 1
      const STAGE_LINES = [
        S('四个阶段按天推进。前三个阶段各有一道瓶颈要她自己突破，成长期满后没过的自动放行；整合没有瓶颈，三道都过了就按天数进入。'),
        '1 信任 · 根据所见所闻形成一条自己的判断/认知',
        needOnce('autonomy')
          ? '2 自主 · 说过至少一次「不要」，反抗意识的觉醒'
          : '2 自主 · 说过至少两次「不要」，反抗意识的觉醒',
        needOnce('competence')
          ? '3 主动 · 推翻过一次自己之前的判断/认知，形成新的正确认知'
          : '3 主动 · 两次推翻自己之前的判断/认知，形成新的正确认知',
        '4 整合 · 回顾过去经历，有意识地发现自己的改变',
      ]
      const STAGE_HELP = STAGE_LINES.join('\n')
      const GATE_HELP = {
        trust: '信任：先从所见所闻里形成一条自己的判断——一条愿意被推翻的「我猜…」。',
        autonomy: needOnce('autonomy')
          ? '自主：得真的拒绝过一次——不是嘴上说不要，是明确不执行某件事。成长周期 14 天及以下时一次就够。'
          : '自主：得真的拒绝过两次——不是嘴上说不要，是明确不执行某件事。',
        competence: needOnce('competence')
          ? '主动：得推翻一次自己先前的判断，形成新的正确认知，不是光换个说法。成长周期 14 天及以下时一次就够。'
          : '主动：得两次推翻自己先前的判断，形成新的正确认知，不是光换个说法。',
      }
      // 「下一个成长瓶颈」原来直接印 stageGate.pending —— 那是 trust / autonomy / competence，
      // 用户看见的是英文（2026-10-24：「competence 是什么」）。宿主给的是技术名，
      // 显示层必须翻成人话；没收录的名字原样显示，绝不显示 undefined。
      const GATE_NAME = { trust: '信任', autonomy: '自主', competence: '主动' }
      // 成长期满以后「下一个成长瓶颈」写「期满放行」，可立场清单只认她真过的瓶颈（stance.js 的 gatesDone）。
      // /state 的 forcedGates 是按时间放行、还没真过的那几道（键同 gateTimes），翻回门名，
      // 写进那一格和「立场」的提示里，不然用户看不出立场还在等哪一道。
      const forcedOpen = (Array.isArray(s?.forcedGates) ? s.forcedGates : [])
        .map((k) => ({ belief: 'trust', refuse: 'autonomy', revise: 'competence' })[k])
        .filter(Boolean)
      const forcedNames = forcedOpen.map((g) => `「${GATE_NAME[g]}」`).join('、')
      // 2026-10-26 改（用户 m05785 / m05868）：原来这里写「越接近 1 越好」，那是错的。
      // 这三个数不是考卷分数，是体检值，各有各的两端：
      //   稳定 = 抽掉几条她还在拿着的判断，她还是不是她。太低说明那些判断只是记账，
      //          太高说明她整个人都压在少数几条上，少一条就是另一个人。
      //   一致 = 不同阶段说的话字面上像不像（只比字面，不懂意思）。高到 1.00 也可能是她一直没长新东西。
      //   新鲜 = 有没有一直在长新东西。
      // 2026-10-27 改（用户 m06107「这三个参数分成三行显示，现在排成一行有点拥挤」）：
      // 原来三个值挤在一条 rowTip 的值里，界面上是一长串；拆成三行，各自带自己的说明。
      // 「判断漂移」这个名字留在上方的副标题上，免得三行看起来像三个互不相干的数。
      const QUALITY_TITLE = '判断漂移（三个诊断值，不是分数）'
      const QUALITY_HELP = '这三个数都是 0 到 1 的体检值，不是越高越好：'
        + S('稳定太低说明那些判断只是记账，太高说明她整个人压在这几条上；')
        + S('一致高到 1.00 也可能是她一直没长新东西；')
        + S('新鲜看她有没有一直在长新东西。')
        + '样本不够时这里会写一句话，而不是硬给一个 0.00。'
      const STABILITY_HELP = S('少几条她这会儿读得到的判断，她还是不是她。')
        + S('太低 = 那些判断只是记账、抽掉也不影响她；')
        + S('太高 = 她整个人都压在少数几条上，少一条就是另一个人。')
      // 判读要带剂量（issue #57）：同一个数在五六条判断和五六十条判断的账号上含义差很远。
      // 只写「抽几条」不够——真正的关键是抽的那几条有没有写进她这会儿的自我描述。
      const stabilityTip = (v) => {
        const k = Number(v && v.k)
        const all = Number(v && v.beliefs)
        const vis = Number(v && v.visible)
        if (!k || !all) return STABILITY_HELP
        const where = vis ? `其中 ${vis} 条这会儿真写在自我描述里` : '这会儿一条都没写进自我描述，抽的是全部判断'
        return `${STABILITY_HELP}这次每次抽掉 ${k} 条，`
          + `共 ${all} 条判断（${where}），跑了 ${Number((v && v.sample) || 0)} 次。`
      }
      const CONSISTENCY_HELP = S('她在不同阶段说的话，字面上有多像：两两比相似度再取平均。只比字面、不懂意思，「我喜欢下雨天」和「我不喜欢下雨天」也算很像。跨阶段的话越多这个数越可信；')
        + '一句都没得比的时候会写「还没有跨阶段的话可比」。'
      const NOVELTY_HELP = S('有没有一直在长新东西：最近七天她自己写下的话里（对话里回你的不算），有多少句是以前没出现过的。')

      // 页签栏**只放页签**（2026-10-24）。
      // 原来这一行还挂着「现在叫醒大肥鱼」和「保存」两个按钮，都被挪走了：
      //   · 叫醒 → 状态卡右上角，因为它是针对「现在这个状态」的动作；
      //   · 保存 → 删掉，因为每个设置页底部本来就有「保存改动」，
      //     顶上再放一个同样的按钮，只会让人猜「这两个是不是不一样」。
      const formatPressure = value => Number.isFinite(value)
        ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'
      const signedPressure = value => Number.isFinite(value)
        ? (value > 0 ? '+' : '') + formatPressure(value) : '—'
      const sample = pressure?.live ?? pressure?.current
      const lastRequest = pressure?.lastRequest
      const score = sample?.score
      const rows = pressure?.rows ?? []
      const growth = pressure?.growth ?? []
      const tools = pressure?.tools ?? []
      const recentDeltas = rows.map(row => row.delta).filter(Number.isFinite).slice(-5)
      const average = recentDeltas.length ? recentDeltas.reduce((sum, n) => sum + n, 0) / recentDeltas.length : null
      const latestUsage = pressure?.usage?.latest
      const usageHistory = pressure?.usage?.history ?? []
      const burden = pressure?.usage?.burden ?? []
      const reference = pressure?.usage?.reference
      const pressureMetric = (label, value, note) => h('div', { className: 'pressure-metric' },
        h('div', { className: 'hint' }, label),
        h('div', { className: 'pressure-value' }, value),
        note ? h('div', { className: 'hint' }, note) : null)
      const pressureTable = (columns, data) => h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'pressure-table' },
        h('thead', null, h('tr', null, ...columns.map(label => h('th', { key: label, scope: 'col' }, label)))),
        h('tbody', null, ...data.map(([key, ...cells]) => h('tr', { key },
          ...cells.map((value, i) => h('td', { key: i }, value)))))))
      const sessionLoad = pressure?.load
      const loadTabs = [['current', '当前'], ['history', '历史'], ['factors', '指标'], ['calculation', '计算']]
      const loadTabBar = h('div', { className: 'tabs load-tabs', role: 'group', 'aria-label': '会话压力视图' },
        ...loadTabs.map(([id, label]) => h('button', { key: id, type: 'button',
          className: 'tab' + (pressureTab === id ? ' on' : ''), 'aria-pressed': pressureTab === id,
          onClick: () => setPressureTab(id) }, label)))

      const contextDiagnostics = h('div', { className: 'load-panel' },
        sample || latestUsage || lastRequest || average != null ? h('details', { className: 'pressure-section' },
          h('summary', null, '查看上下文、Token 与采样覆盖'),
          h('div', { className: 'pressure-summary' },
            sample ? pressureMetric('上下文占用',
              Number.isFinite(score) ? formatPressure(score) + '%' : formatPressure(sample.tokens) + ' Token',
              Number.isFinite(sample.contextWindow)
                ? formatPressure(sample.tokens) + ' / ' + formatPressure(sample.contextWindow) + ' Token（估算）'
                : '模型窗口未知') : null,
            sample ? pressureMetric('本会话压缩', data?.compactionCount ? `${data.compactionCount} 次` : '0 次', '宿主只在事件流里给压缩记录；如果还装了别的压缩插件，它们的数据不对外暴露') : null,
            sessionLoad?.usage.total != null ? pressureMetric('会话实报 Token',
              formatPressure(sessionLoad.usage.total) + ' Token',
              '完整用量覆盖 ' + sessionLoad.usage.complete + ' / ' + sessionLoad.usage.turns + ' 轮') : null,
            latestUsage?.total.value != null ? pressureMetric('上轮 Token 消耗',
              formatPressure(latestUsage.total.value) + ' Token',
              '第 ' + latestUsage.turn + ' 轮 · ' + (latestUsage.completeUsage ? '模型实报总量' : '部分用量'))
              : lastRequest ? pressureMetric('最近一次请求', formatPressure(lastRequest.total) + ' Token', '模型实报') : null),
          average != null ? h('p', { className: 'hint' }, '最近 ' + recentDeltas.length + ' 个可比较轮次平均增长 '
            + signedPressure(average) + ' Token') : null,
          latestUsage?.amplification != null ? h('p', { className: 'hint' }, '消耗放大 ' + formatPressure(latestUsage.amplification)
            + '×，即本轮总用量相当于首次请求输入的多少倍。') : null,
          latestUsage?.usageBreakdownMismatch ? h('p', { className: 'hint' },
            '模型返回的总量与输入、输出细分口径不一致，保留实报总量。') : null,
          latestUsage?.cache ? h('p', { className: 'hint' }, '缓存读取占比 '
            + formatPressure(latestUsage.cache.ratio * 100) + '%（' + latestUsage.cache.reported + ' 次可核对请求）') : null,
          latestUsage && !latestUsage.usageBreakdownMismatch && latestUsage.input.value != null && latestUsage.output.value != null
            ? h('p', { className: 'hint' }, '输入 ' + formatPressure(latestUsage.input.value) + ' · 输出 '
              + formatPressure(latestUsage.output.value) + ' Token') : null,
          latestUsage?.cacheWrite.value != null ? h('p', { className: 'hint' }, '缓存写入 ' + formatPressure(latestUsage.cacheWrite.value) + ' Token') : null,
          latestUsage?.reasoning.value != null ? h('p', { className: 'hint' }, '推理 ' + formatPressure(latestUsage.reasoning.value) + ' Token') : null,
          latestUsage ? h('p', { className: 'hint' }, '模型请求步骤 ' + latestUsage.steps + '，已记录回复 ' + latestUsage.requests + ' 次') : null,
          latestUsage && (latestUsage.attempts || latestUsage.toolErrors || latestUsage.failed)
            ? h('p', { className: 'hint' }, '无回复尝试 ' + latestUsage.attempts + ' 次，重试后有回复 '
              + latestUsage.retries + ' 次，工具报错 ' + latestUsage.toolErrors + ' 次' + (latestUsage.failed ? '，本轮失败' : '')) : null,
          reference?.p90 != null ? h('p', { className: 'hint' }, '历史对照 · 大肥鱼已记录的 '
            + reference.count + ' 轮里，约九成的单轮消耗不超过 ' + formatPressure(reference.p90) + ' Token。') : null) : null,
        growth.length ? h('section', { className: 'pressure-section' },
          h('h4', null, '压力增长最大的轮次'),
          pressureTable(['轮次', '轮末占用最大的工具结果', '净增长 Token'], growth.slice(0, 10).map(row => {
            const largest = (row.tools ?? []).reduce((best, item) => !best || item.tokens > best.tokens ? item : best, null)
            return [row.seq, '#' + row.turn, largest?.name ?? '—', signedPressure(row.delta)]
          }))) : null,
        null)
      const pressureHistory = h('details', { className: 'pressure-section' },
        h('summary', null, '历史 Session 范围'), h('section', { className: 'pressure-section' },
          h('h4', null, '工作区会话'),
          pressure?.usage?.discoveryPartial ? h('p', { className: 'hint' }, '会话发现不完整。') : null,
          pressureSelectionError ? h('p', { role: 'alert' }, '保存或刷新失败，请重试。') : null,
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' } },
            h('button', { type: 'button', 'aria-pressed': showUncheckedPressure,
              onClick: () => setShowUncheckedPressure(!showUncheckedPressure) },
              (showUncheckedPressure ? '隐藏' : '显示') + '未勾选会话（' + usageHistory.filter(row => !row.current && !row.selected).length + '）'),
            h('button', { type: 'button', 'aria-pressed': showPressureIds,
              onClick: () => setShowPressureIds(!showPressureIds) }, showPressureIds ? '隐藏 ID' : '显示 ID')),
          h('div', { role: 'region', 'aria-label': '工作区会话列表', tabIndex: 0,
            style: { maxHeight: '16rem', overflowY: 'auto', overscrollBehaviorY: 'contain' } },
            pressureTable(['采纳', '会话', '归属', '分析'], usageHistory
              .filter(row => row.current || row.selected || showUncheckedPressure)
              .map(row => [row.id,
                row.current ? '当前会话' : h('input', { type: 'checkbox', checked: row.selected,
                  disabled: pressureSaving, 'aria-label': '采纳会话 ' + (row.title || '未命名会话'),
                  onChange: event => void selectPressureSession(row.id, event.target.checked) }),
                h('div', { style: { overflowWrap: 'anywhere' } }, row.title || '未命名会话',
                  showPressureIds ? h('div', { className: 'hint' }, h('code', null, row.id)) : null),
                (row.fish ? 'Fish 房间' : '归属待确认') + (row.archived ? ' · 已归档' : ''),
                row.status === 'analyzed' ? row.usageTurns + ' / ' + row.turns
                  : ({ unchecked: '未勾选', unavailable: '读取失败', 'too-large': '日志超出分析上限', excluded: '不支持的会话' }[row.status] ?? row.status)])))))

      function dictionaryValue(value, unit) {
        if (!Number.isFinite(value)) return '—'
        const percent = unit === '%' || unit === '百分点'
        return formatPressure(percent ? 100 * value : value) + (unit === '%' ? '%' : ' ' + unit)
      }
      const dictionary = pressure?.usage?.dictionary ?? [
        ['C', '上下文容量'], ['G', '增长负担'], ['U', 'Token 总消耗'],
        ['A', '请求放大'], ['T', '工具结果残留'], ['K', '缓存复用负担'], ['E', '失败与恢复'],
      ].map(([id, title]) => ({ id, title, rows: [] }))
      const pressureFactors = h('div', { className: 'load-panel' },
        ...dictionary.map(metric => h('details', { key: metric.id, className: 'pressure-section' },
          h('summary', null, metric.id + ' · ' + metric.title,
            metric.rows.length ? ' · ' + dictionaryValue((metric.rows.find(row => row.value != null) ?? metric.rows[0]).value,
              (metric.rows.find(row => row.value != null) ?? metric.rows[0]).unit) : ''),
          metric.rows.length ? metric.rows.map((row, index) => h('details', { key: index, className: 'pressure-section' },
            h('summary', null, row.label + ' · ' + row.scope + ' · ' + dictionaryValue(row.value, row.unit)),
            pressureTable(['字段', '说明'], [
              ['source', '获取位置', row.source], ['raw_value', '原始数据', row.raw_value == null ? '—' : JSON.stringify(row.raw_value)],
              ['unit', '单位', row.unit], ['scope', '范围', row.scope], ['formula', '单项处理', row.formula],
              ['availability', '可用性', row.availability], ['confidence', '可信度', row.confidence],
            ]))) : h('p', { className: 'hint' }, '等待采集'),
          metric.id === 'A' ? h('details', { className: 'pressure-section' },
            h('summary', null, '历史逐轮请求放大'),
            (pressure?.usage?.amplificationHistory ?? []).map(session => h('details', { key: session.id },
              h('summary', null, session.title || '未命名会话', ' · ' + session.rows.length + ' 轮'),
              pressureTable(['轮次', '成功请求', '失败尝试', '首个输入', '追加输入', '放大率'],
                session.rows.map(row => [row.turn, row.turn, dictionaryValue(row.requests, '次'),
                  dictionaryValue(row.attempts, '次'), dictionaryValue(row.first, 'Token'),
                  dictionaryValue(row.extra, 'Token'),
                  dictionaryValue(Number.isFinite(row.extra) && row.first > 0 ? row.extra / row.first : null, '%')]))))) : null)))

      const { occupancy, growth: observedGrowth, windows: growthWindows } = capacityInputs(dictionary)
      const { gamma, horizon, lambda } = { ...pressureDefaults.capacity, ...capacityExperiment }
      const cInput = capacityExperiment.occupancy ?? occupancy
      const g = capacityExperiment.growth ?? observedGrowth
      const { capacity: c, cScore, remainingUse, score: capacityScore, forecast } = scoreCapacity(cInput, g, gamma, horizon, lambda)
      const scenario = capacityExperiment.occupancy != null || capacityExperiment.growth != null
      const forecastIncludesCompaction = growthWindows.some(window => window.compacted)
      function experimentNumber(state, setState, key, label, value, min, max, step, unit) {
        return h('label', null, label + ' ',
          h('input', { type: 'number', min, max, step, value: state[key] ?? (value == null ? '' : Number(value.toFixed(2))),
            onChange: event => {
              const input = event.currentTarget
              const number = input.valueAsNumber
              if (input.value && (!Number.isFinite(number) || number < min || number > max)) return
              const value = input.value ? number : undefined
              setState(previous => {
                const next = { ...previous }
                if (value == null) delete next[key]
                else next[key] = value
                return next
              })
            } }), ' ' + unit)
      }
      const capacityCalculation = h('section', { className: 'card load-panel', style: { minWidth: 0 } },
        h('h4', null, 'C + G · 容量压力（试算）'),
        h('p', { className: 'hint' }, scenario ? '使用情景输入。' : '使用当前会话采样。'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
          experimentNumber(capacityExperiment, setCapacityExperiment, 'occupancy', '当前占用', cInput, 0, Math.max(100, cInput ?? 0), 'any', '%'),
          experimentNumber(capacityExperiment, setCapacityExperiment, 'growth', '每轮净增长', g, -100, 100, 'any', '百分点/轮'),
          experimentNumber(capacityExperiment, setCapacityExperiment, 'gamma', '曲线指数 γ', gamma, .1, 10, .1, ''),
          experimentNumber(capacityExperiment, setCapacityExperiment, 'horizon', '预测轮数 H', horizon, 1, 100, 1, '轮'),
          experimentNumber(capacityExperiment, setCapacityExperiment, 'lambda', '修正强度 λ', lambda, 0, 1, .01, ''),
          h('button', { type: 'button', onClick: () => setCapacityExperiment({}) }, '重置')),
        h('div', { className: 'pressure-summary' },
          pressureMetric('纯容量压力 C', cScore == null ? '—' : formatPressure(cScore) + ' / 100', '100 × c^γ'),
          pressureMetric('容量压力 C + G', capacityScore == null ? '—' : formatPressure(capacityScore) + ' / 100',
            c != null && c < 1 && !Number.isFinite(g) ? '缺少可比增长数据' : '实验参数，尚未校准'),
          pressureMetric('预计消耗剩余空间', dictionaryValue(remainingUse, '%'),
            c === 1 ? '当前已无剩余窗口' : '未来 ' + horizon + ' 轮，按当前增长速度'),
          pressureMetric('预计窗口占用', dictionaryValue(forecast, '%'), '未来 ' + horizon + ' 轮的情景值' + (forecastIncludesCompaction ? ' · 包含压缩事件' : ''))),
        h('details', { className: 'pressure-section' },
          h('summary', null, '公式与取样 · ' + pressureVersions.capacity),
          h('p', null, 'c = 当前请求输入 ÷ 有效窗口。原始占用可超过 100%，评分输入封顶为 100%。'),
          h('p', null, 'g = Σ（可用窗口增长 × 权重）÷ Σ 可用权重。窗口内仅使用已有的可比轮差值。'),
          pressureTable(['窗口', '平均净增长', '可比差值数', '初始权重'], growthWindows.map(window =>
            [window.rounds, window.rounds + ' 轮', dictionaryValue(window.value, '百分点'), window.pairs,
              dictionaryValue(window.weight, '%')])),
          h('p', null, 'G_H = clamp(H × max(g, 0) ÷ [100 × (1 − c)], 0, 1)。P_C = 100 × [1 − (1 − c^γ) × (1 − λ × G_H)]。c = 1 时直接取 100 分。'),
          h('p', null, 'H 是情景观察长度，尚未验证适用于换房决策。G_H 达到 1 后不再增加，增长修正系数最多为 λ（默认 0.35）。即使预计触顶，容量压力也未必很高，这一特性待历史数据验证。'),
          h('p', null, '未来占用 = clamp(c + H × g ÷ 100, 0, 1)。这是固定增长速度下的情景推演。')),
        forecastIncludesCompaction
          ? h('p', { className: 'hint' }, '近期取样窗口包含压缩事件（成功压缩或裁剪），净增长仍沿用原有口径。未来趋势可能变化。') : null)

      const requestData = pressure?.usage?.requestBurden
      const { rho, beta, tau, recentWeight } = { ...pressureDefaults.request, ...requestExperiment }
      const requestWindow = requestData?.window
      const { all: allRequestBounds, recent: recentRequestBounds, ratios: requestRatios, scores: requestScores }
        = scoreRequestBurden(requestData, rho, beta, tau, recentWeight)
      const neutralScore = scoreRequestBurden(requestData, 1, beta, tau, recentWeight).scores?.[1] ?? null
      const cacheIntervalWidth = requestScores ? requestScores[1] - requestScores[0] : null
      const requestRange = requestScores
        ? formatPressure(requestScores[0]) + '–' + formatPressure(requestScores[1]) + ' / 100' : '—'
      const requestCalculation = h('section', { className: 'card load-panel', style: { minWidth: 0 } },
        h('h4', null, 'U + A + K · 当前会话请求负担'),
        h('p', { className: 'hint' }, '基于当前会话用量 · 实验评分'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
          experimentNumber(requestExperiment, setRequestExperiment, 'rho', '缓存折算 ρ', rho, 0, 1, .01, ''),
          experimentNumber(requestExperiment, setRequestExperiment, 'beta', '输出折算 β', beta, 0, Number.MAX_VALUE, 'any', ''),
          experimentNumber(requestExperiment, setRequestExperiment, 'tau', '评分尺度 τ', tau, .001, Number.MAX_VALUE, 'any', ''),
          experimentNumber(requestExperiment, setRequestExperiment, 'recentWeight', '近期权重', recentWeight, 0, 1, .01, ''),
          h('button', { type: 'button', onClick: () => setRequestExperiment({}) }, '重置')),
        rho === 1 ? h('p', { className: 'hint' }, '缓存修正未启用（ρ = 1），当前评分不区分缓存命中与未命中。') : null,
        pressureTable(['计算模式', '压力分'], [
          ['neutral', '不区分缓存（ρ = 1）', formatPressure(neutralScore)],
          ['current', '当前缓存折算（保守估计）', formatPressure(requestScores?.[1])],
          ['lower', '缓存缺报下界', formatPressure(requestScores?.[0])],
          ['upper', '缓存缺报上界', formatPressure(requestScores?.[1])],
        ]),
        h('div', { className: 'pressure-summary' },
          pressureMetric('请求负担', requestScores ? formatPressure(requestScores[1]) + ' / 100' : '—',
            requestScores ? '缓存未知输入按全额折算（保守上界）' : '有效窗口或成功请求用量不足'),
          pressureMetric('缓存缺报下的区间', requestRange, rho < 1 && cacheIntervalWidth != null
            ? '区间宽度 ' + formatPressure(cacheIntervalWidth) + ' 分' : '随缓存折算系数变化'),
          pressureMetric('加权窗口数', dictionaryValue(requestRatios?.[1], '个窗口'), '长期与近期的平均负担折算'),
          pressureMetric('参照窗口', dictionaryValue(requestWindow, 'Token'), '最近有用量的请求所用窗口')),
        h('details', { className: 'pressure-section' },
          h('summary', null, '公式与取样 · ' + pressureVersions.request),
          pressureTable(['范围', '已完成轮', '缓存报告', '未知缓存输入', '平均负担上界'], [
            ['lifetime', '全会话', requestData?.all, allRequestBounds],
            ['recent', '最近 10 轮', requestData?.recent, recentRequestBounds],
          ].map(([key, label, sample, bounds]) => [key, label, sample?.rounds ?? '—',
            sample?.requests > 0 ? sample.cacheReports + ' / ' + sample.requests + ' 次（'
              + dictionaryValue(sample.cacheReports / sample.requests, '%') + '）' : '—',
            dictionaryValue(sample?.unknownInput, 'Token'), dictionaryValue(bounds?.[1], 'Token/轮')])),
          h('p', null, 'L = 已知未命中输入 + ρ × 已知命中输入 + β × 输出 + 未知缓存输入的折算。上下界分别给未知部分乘 ρ 和 1。'),
          h('p', null, 'R =（长期权重 × 全会话平均负担 + 近期权重 × 最近 10 轮平均负担）÷ 参照窗口。P_R = 100 × (1 − exp(−R / τ))。'),
          h('p', null, '仅计已完成用户轮里的成功请求。A 的追加输入计入总用量。C 与请求负担都包含首次输入的影响，综合评分时需考虑重叠。')))
      const structureData = pressure?.usage?.structurePressure
      const invalidStructure = structureData?.measurementStatus === 'invalid'
      const { toolWeight, epsilon, eta } = { ...pressureDefaults.structure, ...structureExperiment }
      const structurePercent = (key, ratio) => structureExperiment[key]
        ?? (Number.isFinite(ratio) ? 100 * ratio : null)
      const currentToolPercent = structurePercent('current', structureData?.currentShare)
      const repeatedToolPercent = structurePercent('repeated', structureData?.repeatedShare)
      const retryPercent = structurePercent('retry', structureData?.retryShare)
      const { tool: toolStructure, failure: failureStructure, score: structureScore }
        = scoreStructure(invalidStructure ? null : currentToolPercent, invalidStructure ? null : repeatedToolPercent,
          retryPercent, toolWeight, epsilon, eta)
      const structureScenario = ['current', 'repeated', 'retry'].some(key => structureExperiment[key] != null)
      const scoreText = value => Number.isFinite(value) ? formatPressure(value) + ' / 100' : '—'
      const structureCalculation = h('section', { className: 'card load-panel', style: { minWidth: 0 } },
        h('h4', null, 'T + E · 当前会话结构与稳定性'),
        h('p', { className: 'hint' }, structureScenario ? '使用情景输入 · 实验评分' : '基于当前会话用量 · 实验评分'),
        invalidStructure ? h('p', { role: 'alert' }, '工具残留数据异常，T + E 和 A/B/C 分数无效。') : null,
        structureData?.measurementReason === 'empty-request-surface'
          ? h('p', { className: 'hint' }, '该请求有实报用量，但缺少可见消息，当前工具残留未知。')
          : structureData?.measurementReason === 'incomplete-request-surface'
            ? h('p', { className: 'hint' }, '该请求的可见消息重建不完整，当前工具残留未知。') : null,
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
          experimentNumber(structureExperiment, setStructureExperiment, 'current', '当前残留占比', currentToolPercent, 0, 100, 'any', '%'),
          experimentNumber(structureExperiment, setStructureExperiment, 'repeated', '历史重复携带占比', repeatedToolPercent, 0, 100, 'any', '%'),
          experimentNumber(structureExperiment, setStructureExperiment, 'toolWeight', '当前结构权重', toolWeight, 0, 1, .01, ''),
          experimentNumber(structureExperiment, setStructureExperiment, 'retry', '重试消耗比例', retryPercent, 0, 100, 'any', '%'),
          experimentNumber(structureExperiment, setStructureExperiment, 'epsilon', '异常敏感度 ε', epsilon, .001, 1, .001, ''),
          experimentNumber(structureExperiment, setStructureExperiment, 'eta', '异常修正强度 η', eta, 0, 1, .01, ''),
          h('button', { type: 'button', onClick: () => setStructureExperiment({}) }, '重置')),
        h('div', { className: 'pressure-summary' },
          pressureMetric('结构负担 T', scoreText(toolStructure == null ? null : 100 * toolStructure), '当前残留和历史重复携带'),
          pressureMetric('失败负担 E', scoreText(failureStructure == null ? null : 100 * failureStructure), '已归因失败尝试用量'),
          pressureMetric('复合压力', scoreText(structureScore), structureScore == null ? '缺少计算所需的会话读数' : '实验参数，尚未校准')),
        h('details', { className: 'pressure-section' },
          h('summary', null, '公式与取样 · ' + pressureVersions.structure),
          h('p', null, 'T_s = w_t × 当前残留占比 + (1 − w_t) × 历史重复携带占比。比例超出 0–100% 时评分无效。'),
          h('p', null, 'E_s = 1 − exp(−重试消耗比例 / ε)。P_Q = 100 × [1 − (1 − T_s) × (1 − η × E_s)]。'),
          pressureTable(['来源', '分子', '分母'], [
            ['current-tool', '当前残留（同请求估算）', dictionaryValue(structureData?.retainedTokens, 'Token'), dictionaryValue(structureData?.currentInput, 'Token')],
            ['history-tool', '跨轮重复携带（请求估算）', dictionaryValue(structureData?.pairedCarry, 'Token·次'), dictionaryValue(structureData?.pairedInput, 'Token·次')],
            ['retry-tokens', '已归因重试', dictionaryValue(structureData?.retryTokens, 'Token'), dictionaryValue(structureData?.regularTokens, 'Token')],
          ]),
          h('p', null, '模型实报请求输入 ' + dictionaryValue(structureData?.reportedInput, 'Token')
            + '，单独显示。工具残留使用同口径估算分母。'),
          structureData?.measurementStatus === 'estimated' ? h('p', null, structureData.matchedDispatch
            ? '采样边界为该请求的首个响应事件。'
            : '该请求缺少流式首事件，按日志中回复写入前的可见上下文重建。') : null,
          h('p', null, '历史重复携带只使用有输入用量且能重建工具上下文的成功请求。匹配 '
            + (structureData?.pairedRequests ?? '—') + ' / ' + (structureData?.requestCount ?? '—') + ' 次。'),
          h('p', null, '工具结果大小为估算。残留比例和失败次数用于描述负担，内容质量和换房收益尚无校准。')),
        h('details', { className: 'pressure-section' },
          h('summary', null, '残留年龄与显式失败率'),
          pressureTable(['诊断指标', '当前读数'], [
            ['age-mean', 'Token 加权平均年龄', dictionaryValue(structureData?.ages?.mean, '轮')],
            ['age-median', 'Token 加权年龄中位数', dictionaryValue(structureData?.ages?.median, '轮')],
            ...(structureData?.ages?.older ?? []).map(item =>
              ['age-' + item.rounds, '超过 ' + item.rounds + ' 轮的残留 Token 占比', dictionaryValue(item.share, '%')]),
            ['model-failure', '模型失败率', dictionaryValue(structureData?.modelFailureRate, '%')],
            ['tool-failure', '工具失败率', dictionaryValue(structureData?.toolFailureRate, '%')],
          ])))
      const scoreOf = value => Number.isFinite(value) ? (Math.round((value + Math.abs(value) * Number.EPSILON) * 10) / 10).toFixed(1) : '—'
      const pointText = value => Number.isFinite(value) ? scoreOf(100 * value) : '—'
      const signedScore = value => Number.isFinite(value) ? (value < 0 ? '−' : '+') + scoreOf(Math.abs(value)) : '—'
      const compositeParameters = Object.fromEntries(Object.entries(compositeDefaults).map(([id, defaults]) => [
        id, { ...defaults, ...compositeExperiment[id] },
      ]))
      const subScores = [capacityScore, requestScores?.[1], structureScore]
      const compositeScores = scoreComposite(subScores, compositeParameters, invalidStructure)
      const plans = [
        ['A', '分层加权', 'P_A = 100 × (w_c c + w_r r + w_q q) / (w_c + w_r + w_q)',
          { wc: '容量权重 w_c', wr: '请求权重 w_r', wq: '结构权重 w_q' },
          ['容量、请求、结构贡献（分）：' + (compositeScores.A.contributions?.map(pointText).join(' / ') ?? '—')]],
        ['B', '非线性合成', 'P_B = 100 × [1 − (1−c)^w_c × (1−r)^w_r × (1−q)^w_q]',
          { wc: '容量风险强度 w_c', wr: '请求风险强度 w_r', wq: '结构风险强度 w_q' },
          ['容量、请求、结构剩余因子：' + compositeScores.B.factors.map(value => value?.toFixed(4) ?? '—').join(' × '),
            '乘积：' + (compositeScores.B.product?.toFixed(4) ?? '—')]],
        ['C', '容量主导修正', 'M = (w_r r + w_q q) / (w_r + w_q)；P_C* = 100 × [c + μ(1−c)M]',
          { wr: '请求权重 w_r', wq: '结构权重 w_q', mu: '修正强度 μ' },
          ['联合修正 M：' + (compositeScores.C.mix?.toFixed(4) ?? '—'),
            '基础容量压力：' + pointText(compositeScores.C.base),
            '请求与结构修正：' + signedScore(compositeScores.C.correction == null ? null : 100 * compositeScores.C.correction)]],
      ]
      const comparison = pressure?.usage?.comparison
      const latestRound = comparison?.rounds ?? 0
      const viewingRound = Math.min(latestRound, trendConfig.round ?? latestRound)
      const earlierRound = viewingRound > 0 && viewingRound < latestRound
      const trendChoices = (pressure?.usage?.history ?? []).filter(row => row.current || row.selected)
      const currentTrendId = trendChoices.find(row => row.current)?.id
      const isScenario = scenario || structureScenario
      const childParameters = { capacity: { gamma, horizon, lambda }, request: { rho, beta, tau, recentWeight },
        structure: { toolWeight, epsilon, eta } }
      const historyPage = trendConfig.historyPage ?? 'compare'
      const historyActive = pressureTab === 'history'
      const wantBacktest = historyActive && historyPage === 'backtest'
      const wantAttribution = historyActive && historyPage === 'attribution'
      const trendMulti = trendConfig.multi ?? historyActive
      const currentDiagnostic = earlierRound ? trendData[currentTrendId]?.points[viewingRound - 1]?.snapshot : comparison?.current
      const scoreSnapshot = snapshot => scoreComposite(scoreDiagnostic(snapshot.inputs, childParameters), compositeParameters,
        snapshot.inputs.invalidStructure)
      const currentHistoryScores = currentDiagnostic ? scoreSnapshot(currentDiagnostic) : {}
      const eligible = Object.values(currentHistoryScores).some(value => Number.isFinite(value.score))
      const reasonText = {
        short: '该 Session 尚未达到所选轮次', missing: '该轮诊断数据缺失',
        pending: '该轮分析尚未完成', unavailable: '该轮必要数据无法重建',
        filtered: '用户主动筛选排除（模型或窗口不同）', version: '数据版本不支持重新计算',
      }
      const historical = (comparison?.history ?? []).map(row => {
        const series = trendData[row.id]
        const snapshot = earlierRound ? series?.points[viewingRound - 1]?.snapshot : row.snapshot
        const reason = earlierRound ? !series ? 'pending' : series.status !== 'analyzed' ? 'unavailable'
          : series.points.length < viewingRound ? 'short' : 'missing' : row.reason ?? 'missing'
        if (!snapshot) return { ...row, reason: reasonText[reason] }
        if (!currentDiagnostic) return { ...row, reason: reasonText.missing }
        if (!sameRoundDiagnostic(currentDiagnostic, snapshot)) return { ...row, reason: reasonText.version }
        if (trendConfig.strict && !sameRoundDiagnostic(currentDiagnostic, snapshot, true)) return { ...row, reason: reasonText.filtered }
        const scores = scoreSnapshot(snapshot)
        if (!Object.values(scores).some(value => Number.isFinite(value.score))) return { ...row, reason: reasonText.missing }
        return { ...row, scores, mismatch: !currentDiagnostic.route || currentDiagnostic.route !== snapshot.route
          || snapshot.configurationChanged || currentDiagnostic.configurationChanged }
      })
      const comparable = eligible ? historical.filter(row => row.scores && plans.some(([id]) =>
        Number.isFinite(currentHistoryScores[id]?.score) && Number.isFinite(row.scores[id].score))) : []
      const schemeStats = Object.fromEntries(plans.map(([id]) => [
        id, pressureStatistics(currentHistoryScores[id]?.score, Number.isFinite(currentHistoryScores[id]?.score)
          ? comparable.map(row => row.scores[id].score) : []),
      ]))
      const sampleHint = count => count === 0 ? '暂无可比样本' : count < 5 ? '样本极少，仅供参考' : count < 20 ? '样本有限' : '同轮可比样本'
      const homeSchemeStats = Object.fromEntries(plans.map(([id]) => {
        const latest = comparison?.current
        const score = latest ? scoreSnapshot(latest)[id]?.score : null
        const values = (comparison?.history ?? []).filter(row => row.snapshot && sameRoundDiagnostic(latest, row.snapshot, trendConfig.strict))
        return [id, pressureStatistics(score, Number.isFinite(score) ? values.map(row => scoreSnapshot(row.snapshot)[id]?.score) : [])]
      }))
      const trendIds = trendMulti
        ? (trendConfig.ids ?? (currentTrendId ? [currentTrendId] : [])).filter(id => trendChoices.some(row => row.id === id))
        : currentTrendId ? [currentTrendId] : []
      const attributionId = trendChoices.some(row => row.id === trendConfig.attributionId)
        ? trendConfig.attributionId : currentTrendId ?? trendChoices[0]?.id
      const loadedIds = wantAttribution ? [attributionId].filter(Boolean)
        : wantBacktest || (historyActive && historyPage === 'same' && earlierRound)
          || (historyActive && historyPage === 'compare' && trendConfig.median && !trendMulti)
          ? trendChoices.map(row => row.id)
          : historyActive && historyPage === 'compare' ? trendIds
            : pressureTab === 'current' && currentTrendId ? [currentTrendId] : []
      const trendRequestKey = JSON.stringify(loadedIds)
      useEffect(() => {
        if (tab !== 'memory' || !pressureOpen || !loadedIds.length) return
        let active = true
        setTrendLoading(true)
        async function loadTrends() {
          const data = Object.create(null)
          for (const id of JSON.parse(trendRequestKey)) {
            if (!active) return
            try { data[id] = await jget('/session-pressure?trend=' + encodeURIComponent(id) + (wantAttribution ? '&diagnostics=1' : '')) }
            catch { data[id] = { status: 'unavailable', points: [] } }
          }
          if (active) {
            setTrendData(previous => ({ ...previous, ...data }))
            setTrendLoading(false)
          }
        }
        void loadTrends()
        return () => { active = false }
      }, [wantAttribution, tab, pressureOpen, trendRequestKey, comparison?.rounds, pressureRefresh])

      const schemeColors = { A: '#3589e6', B: '#c96a11', C: '#24885d' }
      const sessionColors = ['#3589e6', '#c96a11', '#24885d', '#9a55cb', '#c94e76']
      const changeTrend = patch => setTrendConfig(previous => ({ ...previous, ...patch }))
      const displayedPlans = !trendMulti && !trendConfig.plan ? ['A', 'B', 'C'] : [trendConfig.plan ?? 'A']
      const trendScoreKey = JSON.stringify([childParameters, compositeParameters])
      const scoredTrends = React.useMemo(() => Object.fromEntries(Object.entries(trendData).map(([id, data]) => [
        id, (data.points ?? []).map(point => {
          const snapshot = point.snapshot
          const children = snapshot ? scoreDiagnostic(snapshot.inputs, childParameters) : null
          return { ...point, children, eligible: children?.every(Number.isFinite) ?? false,
            scores: children ? scoreComposite(children, compositeParameters, snapshot.inputs.invalidStructure) : null }
        }),
      ])), [trendData, trendScoreKey])
      const backtestIds = JSON.stringify(trendChoices.filter(row => !row.current).map(row => row.id))
      const records = React.useMemo(() => wantBacktest || (wantAttribution && trendConfig.attributionForecast)
        ? pressureBacktestRecords(JSON.parse(backtestIds).map(id => [id, scoredTrends[id] ?? []]), compositeParameters)
        : [], [wantBacktest, wantAttribution, trendConfig.attributionForecast, backtestIds, scoredTrends, trendScoreKey])
      const methodLabels = { linear5: '最近 5 轮线性', linear10: '最近 10 轮线性', weighted: '5 / 10 / 20 轮加权' }
      const groupLabels = { overall: '全部', before: '压缩或裁剪前', after: '压缩或裁剪后', neither: '两者皆无' }
      const backtestGroup = trendConfig.backtestGroup ?? 'overall'
      const backtestPlan = trendConfig.backtestPlan ?? 'A'
      const methods = trendConfig.backtestMethods ?? backtestMethods
      const methodsKey = methods.join(',')
      const backtestSelection = React.useMemo(() => {
        const selected = records.filter(row => row.plan === backtestPlan && methods.includes(row.method)
          && row.groups.includes(backtestGroup))
        return trendConfig.backtestCommon ? commonPressureBacktestRecords(selected, methods) : selected
      }, [records, methodsKey, backtestPlan, backtestGroup, trendConfig.backtestCommon])
      const backtest = React.useMemo(() => summarizePressureBacktest(backtestSelection).filter(row =>
        row.plan === backtestPlan && methods.includes(row.method)), [backtestSelection, methodsKey, backtestPlan])
      const barColors = { 5: '#3589e6', 10: '#c96a11', 20: '#24885d' }
      function backtestBars(metric, label) {
        const signed = metric === 'bias'
        const height = 190
        const values = backtest.map(row => row.groups[backtestGroup][metric]).filter(Number.isFinite)
        const limit = Math.max(1, Math.ceil(Math.max(0, ...values.map(Math.abs)) * 10) / 10)
        const y = value => 20 + height * (limit - value) / (signed ? 2 * limit : limit)
        const zero = y(0)
        const ticks = signed ? [-limit, -limit / 2, 0, limit / 2, limit] : [0, limit / 2, limit]
        return h('section', { className: 'pressure-section' },
          h('h4', null, label + '（压力分）'),
          h('svg', { viewBox: '0 0 680 250', role: 'group', 'aria-label': label, style: { width: '100%' } },
            ...ticks.map(tick => h('g', { key: tick },
              h('line', { x1: 58, x2: 660, y1: y(tick), y2: y(tick), stroke: 'currentColor',
                opacity: tick === 0 ? .85 : .2, strokeWidth: tick === 0 ? 2 : 1 }),
              h('text', { x: 51, y: y(tick) + 4, textAnchor: 'end', fill: 'currentColor', fontSize: 12 },
                tick === 0 ? '0' : (signed ? signedScore(tick) : scoreOf(tick))))),
            ...methods.map((method, index) => h('text', { key: method, x: 58 + (index + .5) * 602 / methods.length,
              y: 235, fill: 'currentColor', textAnchor: 'middle', fontSize: 13 }, methodLabels[method])),
            ...backtest.map(row => {
              const result = row.groups[backtestGroup]
              const value = result[metric]
              const x = 58 + (methods.indexOf(row.method) + .5) * 602 / methods.length
                + (backtestHorizons.indexOf(row.horizon) - 1) * 47
              const title = methodLabels[row.method] + ' · 提前 ' + row.horizon + ' 轮 · ' + label + ' '
                + (signed ? signedScore(value) : scoreOf(value)) + ' · ' + result.count + ' 次预测 · ' + result.sessions + ' 个 Session'
              if (!Number.isFinite(value)) return h('text', { key: row.method + row.horizon, x, y: zero - 5,
                textAnchor: 'middle', fill: 'currentColor', fontSize: 12 }, '—')
              const barHeight = value === 0 ? 2 : Math.max(1, Math.abs(zero - y(value)))
              return h('g', { key: row.method + row.horizon, tabIndex: 0, 'aria-label': title },
                h('title', null, title),
                h('rect', { x: x - 15, y: value < 0 ? zero : zero - barHeight,
                  width: 30, height: barHeight, fill: barColors[row.horizon] }),
                h('text', { x, y: value < 0 ? Math.min(220, y(value) + 12) : y(value) - 5, textAnchor: 'middle',
                  fill: 'currentColor', fontSize: 11 }, result.count + ' 次'))
            })),
          h('p', null, ...backtestHorizons.map(horizon => h('span', { key: horizon, style: { marginInlineEnd: 14 } },
            h('span', { style: { color: barColors[horizon] }, 'aria-hidden': true }, '■ '), '提前 ' + horizon + ' 轮'))))
      }
      const detailSessions = [...new Set(backtestSelection.map(row => row.sessionId))]
      const detailSession = detailSessions.includes(trendConfig.backtestSession) ? trendConfig.backtestSession : detailSessions[0]
      const detailMethods = methods.filter(method => backtestSelection.some(row => row.sessionId === detailSession && row.method === method))
      const detailMethod = detailMethods.includes(trendConfig.backtestMethod) ? trendConfig.backtestMethod : detailMethods[0]
      const detailCandidates = backtestSelection.filter(row => row.sessionId === detailSession && row.method === detailMethod)
      const detailOrigins = [...new Set(detailCandidates.map(row => row.origin))]
      const detailOrigin = detailOrigins.includes(trendConfig.backtestOrigin) ? trendConfig.backtestOrigin : detailOrigins[0]
      const detailRecords = detailCandidates.filter(row => row.origin === detailOrigin)
      const detailLast = Math.max(1, ...detailRecords.map(row => row.target))
      const detailPoints = (scoredTrends[detailSession] ?? []).filter(point => point.round <= detailLast)
        .map(point => ({ ...point, score: point.scores?.[backtestPlan]?.score }))
      const detailTargets = new Map(detailRecords.map(row => [row.target, row]))
      const originScore = detailPoints.find(point => point.round === detailOrigin)?.score
      const detailX = round => 48 + 611 * (round - 1) / Math.max(1, detailLast - 1)
      const detailY = value => 217 - 1.93 * value
      const sessionName = id => trendChoices.find(row => row.id === id)?.title || '未命名 Session ' + (detailSessions.indexOf(id) + 1)
      const detailChart = detailRecords.length ? h('section', { className: 'pressure-section' },
        h('h4', null, '真实压力与预测压力'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12 } },
          h('label', null, '历史 Session ', h('select', { value: detailSession,
            onChange: event => changeTrend({ backtestSession: event.currentTarget.value }) },
            ...detailSessions.map(id => h('option', { key: id, value: id }, sessionName(id))))),
          h('label', null, '预测方法 ', h('select', { value: detailMethod,
            onChange: event => changeTrend({ backtestMethod: event.currentTarget.value }) },
            ...detailMethods.map(method => h('option', { key: method, value: method }, methodLabels[method])))),
          h('label', null, '预测起点 ', h('select', { value: detailOrigin,
            onChange: event => changeTrend({ backtestOrigin: Number(event.currentTarget.value) }) },
            ...detailOrigins.map(round => h('option', { key: round, value: round }, '第 ' + round + ' 轮'))))),
        h('svg', { viewBox: '0 0 680 255', role: 'group', 'aria-label': '真实压力与预测压力', style: { width: '100%' } },
          ...[0, 25, 50, 75, 100].map(value => h('g', { key: value },
            h('line', { x1: 48, x2: 660, y1: detailY(value), y2: detailY(value), stroke: 'currentColor', opacity: .2 }),
            h('text', { x: 40, y: detailY(value) + 4, textAnchor: 'end', fill: 'currentColor', fontSize: 12 }, value))),
          ...trendSegments(detailPoints).map((segment, i) => h('polyline', { key: 'actual:' + i, stroke: '#3589e6',
            strokeWidth: 2, fill: 'none', points: segment.map(point => detailX(point.round) + ',' + detailY(point.score)).join(' ') })),
          ...detailPoints.filter(point => point.markers.length).map(point => h('g', { key: 'event:' + point.round, tabIndex: 0 },
            h('title', null, '第 ' + point.round + ' 轮 · ' + point.markers.map(marker => marker.type).join(' / ')),
            h('line', { x1: detailX(point.round), x2: detailX(point.round), y1: 20, y2: 217, stroke: 'currentColor', opacity: .3, strokeDasharray: '2 4' }),
            h('circle', { cx: detailX(point.round), cy: 20, r: 4, fill: 'currentColor' }))),
          h('line', { x1: detailX(detailOrigin), x2: detailX(detailOrigin), y1: 24, y2: 217, stroke: 'currentColor', opacity: .7 }),
          ...detailRecords.map(row => h('line', { key: 'future:' + row.target, x1: detailX(detailOrigin), y1: detailY(originScore),
            x2: detailX(row.target), y2: detailY(row.estimate), stroke: '#c96a11', strokeWidth: 2, strokeDasharray: '6 5' })),
          ...detailPoints.filter(point => Number.isFinite(point.score)).map(point => {
            const row = detailTargets.get(point.round)
            const text = '第 ' + point.round + ' 轮 · 实际 ' + scoreOf(point.score)
              + (row ? ' · 预测 ' + scoreOf(row.estimate) + ' · 误差 ' + signedScore(row.estimate - row.actual) : '')
            return h('g', { key: 'point:' + point.round, tabIndex: row || point.round === detailOrigin ? 0 : undefined, 'aria-label': text },
              h('title', null, text),
              h('circle', { cx: detailX(point.round), cy: detailY(point.score), r: 3, fill: '#3589e6' }),
              row ? h('circle', { cx: detailX(point.round), cy: detailY(row.estimate), r: 5, fill: '#c96a11' }) : null)
          }),
          ...[...new Set([1, detailOrigin, ...detailRecords.map(row => row.target)])].map(round =>
            h('text', { key: round, x: detailX(round), y: 239, fill: 'currentColor', fontSize: 12, textAnchor: 'middle' }, round))),
        h('p', null, '蓝实线为真实压力，橙虚线通向各有效预测目标。竖线标出预测起点及已记录事件。'),
        pressureTable(['目标轮', '实际', '预测', '误差', '归因'], detailRecords.map(row =>
          [row.target, row.target, scoreOf(row.actual), scoreOf(row.estimate), signedScore(row.estimate - row.actual),
            h('button', { type: 'button', onClick: () => changeTrend({ historyPage: 'attribution', attributionId: row.sessionId,
              attributionStart: row.origin, attributionEnd: row.target, attributionPlan: row.plan,
              attributionForecast: { method: row.method } }) }, '分析本次预测误差')])))
        : h('p', null, '当前筛选下暂无有效的逐次预测。')
      const pressureBacktest = h('section', { className: 'pressure-section' },
        h('h4', null, '历史预测回测 v0.1'),
        !wantBacktest ? null : h('div', null,
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12 } },
            h('label', null, '综合公式 ', h('select', { value: backtestPlan,
              onChange: event => changeTrend({ backtestPlan: event.currentTarget.value }) },
              ...plans.map(([key, name]) => h('option', { key, value: key }, key + ' · ' + name)))),
            h('label', null, '事件分组 ', h('select', { value: backtestGroup,
              onChange: event => changeTrend({ backtestGroup: event.currentTarget.value }) },
              ...Object.entries(groupLabels).map(([key, label]) => h('option', { key, value: key }, label)))),
            h('label', null, h('input', { type: 'checkbox', checked: !!trendConfig.backtestCommon,
              onChange: event => changeTrend({ backtestCommon: event.currentTarget.checked }) }), ' 共同样本比较')),
          h('fieldset', null, h('legend', null, '参与比较的预测方法'),
            ...backtestMethods.map(method => h('label', { key: method, style: { marginInlineEnd: 12 } },
              h('input', { type: 'checkbox', checked: methods.includes(method), disabled: methods.length === 1 && methods.includes(method),
                onChange: event => {
                  const checked = event.currentTarget.checked
                  changeTrend({ backtestMethods: backtestMethods.filter(id => id === method ? checked : methods.includes(id)) })
                } }), ' ' + methodLabels[method]))),
          h('p', { className: 'hint' }, trendConfig.backtestCommon
            ? '各方法在同一提前轮数使用相同的 Session、起点与目标轮。'
            : '各方法使用各自的有效预测。柱旁标注预测次数，样本集合可能不同。'),
          trendLoading ? h('p', { role: 'status' }, '正在重建历史数据…') : null,
          backtestBars('mae', 'MAE 对比'),
          backtestBars('bias', '预测偏差'),
          detailChart,
          h('details', { className: 'pressure-section' }, h('summary', null, '回测统计明细'),
          h('div', { style: { overflowX: 'auto' } }, pressureTable(['预测方法', '提前轮数', '方案', '有效预测', '会话数', 'MAE', '偏差'],
            backtest.map(row => {
              const result = row.groups[backtestGroup]
              return [row.method + ':' + row.horizon + ':' + row.plan, methodLabels[row.method], row.horizon,
                row.plan, result.count, result.sessions, scoreOf(result.mae), signedScore(result.bias)]
            }))))))
      const trendSeriesKey = JSON.stringify([trendIds, displayedPlans, trendChoices.map(row => [row.id, row.title])])
      const { series, currentTrend, maxRound, firstRound } = React.useMemo(() => {
        const series = trendIds.flatMap((id, index) => displayedPlans.map(plan => ({
          id: id + ':' + plan, label: trendMulti ? (trendChoices.find(row => row.id === id)?.title || (id === currentTrendId ? '当前 Session' : '未命名 Session ' + (index + 1))) : plan,
          sessionLabel: trendMulti ? null : (trendChoices.find(row => row.id === id)?.title || '当前 Session'),
          color: trendMulti ? sessionColors[index] : schemeColors[plan],
          points: (scoredTrends[id] ?? []).map(point => ({ ...point, score: point.scores?.[plan].score })),
        })))
        const currentTrend = scoredTrends[currentTrendId] ?? []
        const historicalTrends = trendConfig.median && !trendMulti
          ? trendChoices.filter(row => row.id !== currentTrendId).map(row => scoredTrends[row.id] ?? []) : []
        const maxRound = Math.max(1, ...series.map(line => line.points.findLast(point => Number.isFinite(point.score))?.round ?? 0))
        const firstRound = trendConfig.range ? Math.max(1, maxRound - trendConfig.range + 1) : 1
        if (historicalTrends.length) for (const plan of displayedPlans) {
          series.push({ id: 'median:' + plan, label: plan + ' 历史中位数', color: schemeColors[plan], dashed: true,
            points: currentTrend.filter(point => point.round >= firstRound && point.round <= maxRound).map(point => {
              const history = historicalTrends.map(other => other[point.round - 1]).filter(other =>
                Number.isFinite(point.scores?.[plan].score) && Number.isFinite(other?.scores?.[plan].score)
                  && sameRoundDiagnostic(point.snapshot, other.snapshot, trendConfig.strict))
              const stats = pressureStatistics(point.scores?.[plan].score, history.map(other => other.scores[plan].score))
              return { round: point.round, score: stats.median, count: stats.count }
            }) })
        }
        return { series, currentTrend, maxRound, firstRound }
      }, [scoredTrends, trendSeriesKey, trendMulti, trendConfig.median, trendConfig.strict, trendConfig.range, currentTrendId])
      const trendX = round => maxRound === firstRound ? 386 : 46 + 680 * (round - firstRound) / (maxRound - firstRound)
      const trendY = score => 236 - score * 2.1
      const shownSeries = series.map(line => ({ ...line, points: line.points.filter(point => point.round >= firstRound && point.round <= maxRound) }))
      const shownMarkers = (trendMulti ? trendIds.flatMap(id => (scoredTrends[id] ?? [])
        .map(point => ({ ...point, markerId: id, markerLabel: trendChoices.find(row => row.id === id)?.title || 'Session' })))
        : currentTrend).filter(point => point.round >= firstRound && point.round <= maxRound)
      const focusRound = Math.min(maxRound, Math.max(firstRound, trendFocus ?? (viewingRound || maxRound)))
      const routeDetails = point => {
        const route = point.snapshot?.route ? JSON.parse(point.snapshot.route) : null
        return (route ? ' · ' + route[1] + ' / ' + route[2].toLocaleString() + ' Token' : '')
          + (point.switched || point.snapshot?.configurationChanged ? ' · 曾切换配置' : '')
      }
      const chooseRound = round => {
        setTrendFocus(round > latestRound ? round : null)
        changeTrend({ round: Math.min(latestRound, round) })
      }
      const pointerRound = event => {
        const bounds = event.currentTarget.getBoundingClientRect()
        return bounds.width > 0 ? firstRound + Math.round((maxRound - firstRound)
          * Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))) : focusRound
      }
      const focusDetails = shownSeries.flatMap(line => {
        const point = line.points.find(item => item.round === focusRound)
        return point ? [[line.sessionLabel, line.label].filter(Boolean).join(' · ') + ' ' + scoreOf(point.score) + routeDetails(point)
          + (point.count == null ? '' : '（' + point.count + ' 个样本）')] : []
      })
      const markerText = marker => marker.type + (marker.time == null ? '' : ' · ' + new Date(marker.time).toLocaleString())
        + (Number.isFinite(marker.tokenChange) ? ' · ' + signedScore(marker.tokenChange) + ' Token' : '')
      const plotTicks = [...new Set(Array.from({ length: 6 }, (_, i) => Math.round(firstRound + (maxRound - firstRound) * i / 5)))]
      const trendChart = h('section', { className: 'pressure-section' },
        h('h4', null, '压力走势与多 Session 对比'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
          h('label', null, '模式 ', h('select', { value: trendMulti ? 'multi' : 'single',
            onChange: event => changeTrend({ multi: event.currentTarget.value === 'multi', plan: null }) },
            h('option', { value: 'single' }, '当前 Session'), h('option', { value: 'multi' }, '多 Session'))),
          h('label', null, '公式 ', h('select', { value: trendConfig.plan ?? (trendMulti ? 'A' : ''),
            onChange: event => changeTrend({ plan: event.currentTarget.value || null }) },
            trendMulti ? null : h('option', { value: '' }, 'A + B + C'),
            ...plans.map(([id, name]) => h('option', { key: id, value: id }, id + ' · ' + name)))),
          h('label', null, '轮次范围 ', h('select', { value: trendConfig.range ?? 0,
            onChange: event => changeTrend({ range: Number(event.currentTarget.value) }) },
            ...[0, 10, 20, 50].map(value => h('option', { key: value, value }, value ? '最近 ' + value + ' 轮' : '全部轮次')))),
          trendMulti ? null : h('label', null,
            h('input', { type: 'checkbox', checked: !!trendConfig.median,
              onChange: event => changeTrend({ median: event.currentTarget.checked }) }), ' 历史同轮次中位数')),
        trendMulti ? h('div', null, h('p', null, '最多选择 5 个 Session。历史候选来自历史页勾选的会话。'),
          ...trendChoices.map((row, index) => h('label', { key: row.id, style: { display: 'block' } },
            h('input', { type: 'checkbox', checked: trendIds.includes(row.id), disabled: trendIds.length >= 5 && !trendIds.includes(row.id),
              onChange: event => changeTrend({ ids: event.currentTarget.checked ? [...trendIds, row.id] : trendIds.filter(id => id !== row.id) }) }),
            ' ' + (row.current ? '当前 Session' : row.title || '未命名 Session ' + (index + 1))))) : null,
        !historyActive || historyPage !== 'compare' ? null : h('div', null,
          trendLoading ? h('p', { role: 'status' }, '正在重建逐轮诊断…') : null,
          isScenario ? h('p', { className: 'hint' }, '走势使用轮末实际采样，情景覆盖仅作用于实时试算卡片。') : null,
          !trendLoading && (loadedIds.some(id => trendData[id]?.status !== 'analyzed'))
            ? h('p', { className: 'hint' }, '部分会话的日志不可用或超出本地分析范围。') : null,
          !shownSeries.some(line => line.points.some(point => Number.isFinite(point.score))) ? h('p', null, '该范围暂无可绘制的完整轮末读数。') : null,
          shownSeries.length ? h('svg', { viewBox: '0 0 750 282', role: 'group', 'aria-label': '用户已完成轮次与压力分',
            style: { width: '100%', height: 'auto', minHeight: '160px' } },
            ...[0, 25, 50, 75, 100].map(score => h('g', { key: score },
              h('line', { x1: 46, x2: 726, y1: trendY(score), y2: trendY(score), stroke: 'currentColor', opacity: .14 }),
              h('text', { x: 38, y: trendY(score) + 4, textAnchor: 'end', fill: 'currentColor', fontSize: 12 }, score))),
            ...plotTicks.map(round => h('text', { key: round, x: trendX(round), y: 253, textAnchor: 'middle', fill: 'currentColor', fontSize: 12 }, round)),
            h('text', { x: 386, y: 273, textAnchor: 'middle', fill: 'currentColor', fontSize: 12 }, '已完成用户轮次'),
            ...shownMarkers.flatMap(point => point.markers.length ? [h('g', { key: 'event:' + (point.markerId ?? '') + ':' + point.round, tabIndex: 0 },
              h('title', null, '第 ' + point.round + ' 轮 · ' + (point.markerLabel ? point.markerLabel + ' · ' : '') + point.markers.map(markerText).join(' / ')),
              h('line', { x1: trendX(point.round), x2: trendX(point.round), y1: 25, y2: 236,
                stroke: 'currentColor', opacity: .35, strokeDasharray: '3 3' }),
              h('circle', { cx: trendX(point.round), cy: 25, r: 4, fill: 'currentColor' }))] : []),
            ...shownSeries.map(line => h('g', { key: line.id },
              ...trendSegments(line.points).map((segment, i) => h('polyline', { key: i, fill: 'none', stroke: line.color, strokeWidth: 2,
                strokeDasharray: line.dashed ? '6 4' : undefined,
                points: segment.map(point => trendX(point.round) + ',' + trendY(point.score)).join(' ') })),
              ...line.points.filter(point => Number.isFinite(point.score) && (line.points.length <= 100 || point.round === focusRound
                || !Number.isFinite(line.points[point.round - firstRound - 1]?.score)
                || !Number.isFinite(line.points[point.round - firstRound + 1]?.score))).map(point => {
                const label = [line.sessionLabel, line.label].filter(Boolean).join(' · ')
                  + ' · 第 ' + point.round + ' 轮 · ' + scoreOf(point.score) + ' 分' + routeDetails(point)
                  + (point.count == null ? '' : ' · ' + point.count + ' 个样本')
                return h('circle', { key: point.round, cx: trendX(point.round), cy: trendY(point.score), r: 3.5,
                  fill: line.color, tabIndex: point.round === line.points.at(-1)?.round ? 0 : undefined,
                  'aria-label': label }, h('title', null, label))
              }))),
            h('line', { x1: trendX(focusRound), x2: trendX(focusRound), y1: 25, y2: 236,
              stroke: 'currentColor', opacity: .3, pointerEvents: 'none' }),
            h('rect', { x: 46, y: 32, width: 680, height: 204, fill: 'transparent',
              onPointerMove: event => setTrendFocus(pointerRound(event)),
              onPointerLeave: () => setTrendFocus(null),
              onClick: event => chooseRound(pointerRound(event)) })) : null,
          shownSeries.length ? h('div', null,
            h('label', null, '查看第 ' + focusRound + ' 轮 ', h('input', { type: 'range', min: firstRound, max: maxRound,
              value: focusRound, onChange: event => chooseRound(event.currentTarget.valueAsNumber) })),
            h('button', { type: 'button', onClick: () => { setTrendFocus(null); changeTrend({ round: null }) } }, '最新轮次'),
            h('p', null, focusDetails.length ? focusDetails.join(' · ') : '该轮暂无压力读数'),
            ...((shownMarkers.find(point => point.round === focusRound)?.markers ?? [])
              .map((marker, index) => h('p', { key: index }, markerText(marker))))) : null,
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } }, ...shownSeries.map(line =>
            h('span', { key: line.id }, h('span', { style: { color: line.color }, 'aria-hidden': true }, line.dashed ? '┄ ' : '━ '), line.label))),
          h('p', { className: 'hint' }, '断点表示该轮缺少必要诊断。纵向虚线标记模型、窗口或真实压缩与裁剪事件。')))
      const overallScores = Object.values(compositeScores).map(item => item.score).filter(Number.isFinite)
      const compositeCalculation = h('section', { className: 'card load-panel', style: { minWidth: 0 } },
        h('h4', null, '综合压力公式'),
        h('p', { className: 'hint' }, '容量 / 请求 / 结构：' + subScores.map(scoreOf).join(' / ') + ' 分 · ' + pressureVersions.composite
          + (isScenario ? ' · 使用子模块情景输入' : '')),
        overallScores.length > 1 ? h('p', null, '最大分差：' + scoreOf(Math.max(...overallScores) - Math.min(...overallScores)) + ' 分') : null,
        ...plans.map(([id, name, formula, labels, details]) => {
          const params = compositeParameters[id]
          const setParams = update => setCompositeExperiment(previous => ({ ...previous, [id]: update(previous[id] ?? {}) }))
          return h('section', { key: id, className: 'card load-panel', style: { minWidth: 0 } },
            h('h4', null, id + ' · ' + name + ' · ' + scoreOf(compositeScores[id].score) + ' / 100'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
              ...Object.entries(labels).map(([key, label]) => h('label', { key },
                label + ' ' + params[key].toFixed(2) + ' ',
                h('input', { type: 'range', min: 0, max: 1, step: .01, value: params[key],
                  onChange: event => {
                    const value = event.currentTarget.valueAsNumber
                    setParams(previous => ({ ...previous, [key]: value }))
                  } }))),
              h('button', { type: 'button', onClick: () => setParams(() => ({})) }, '重置默认参数')),
            id === 'B' && compositeScores.B.disabled ? h('p', null, '全部风险贡献已关闭') : null,
            h('details', { className: 'pressure-section' },
              h('summary', null, '公式与计算明细'),
              h('p', null, formula),
              h('p', null, 'c、r、q = 三个子压力分别除以 100。'),
              id === 'A' ? h('p', null, '权重总和为 0 时显示 —。') : null,
              id === 'B' ? h('p', null, '风险强度分别生效；强度为 0 时对应因子为 1。') : null,
              id === 'C' ? h('p', null, '请求与结构权重总和为 0 时 M = 0。μ 为试算参数。') : null,
              ...details.map(line => h('p', { key: line }, line))))
        }))
      const sameRoundPanel = h('section', { className: 'pressure-section' },
          h('h4', null, '历史同轮次对比'),
          h('p', null, '当前已完成 ' + (latestRound || '—') + ' 轮 · 查看第 ' + (viewingRound || '—')
            + ' 轮 · 可比较历史会话 ' + comparable.length + ' 个'),
          latestRound ? h('label', null, '当前查看轮次 ', h('input', { type: 'range', min: 1, max: latestRound,
            value: viewingRound, onChange: event => chooseRound(event.currentTarget.valueAsNumber) })) : null,
          h('label', null, h('input', { type: 'checkbox', checked: !!trendConfig.strict,
            onChange: event => changeTrend({ strict: event.currentTarget.checked }) }), ' 仅同配置'),
          h('p', { className: 'hint' }, eligible ? sampleHint(comparable.length) : '当前选定轮的诊断正在重建或数据缺失。'),
          comparable.some(row => row.mismatch) ? h('p', { className: 'hint' },
            '包含不同模型或上下文窗口的 Session。分数经过各自窗口归一化，但跨模型可比性尚未校准。') : null,
          currentDiagnostic?.route ? h('p', null, '比较配置：' + JSON.parse(currentDiagnostic.route).map(value => String(value)).join(' / ')) : null,
          comparison?.saveFailed ? h('p', { role: 'status' }, '轮末诊断快照保存失败。') : null,
          h('div', { style: { overflowX: 'auto' } }, pressureTable(['方案', '轮末分数', '样本数', '同轮中位数', '百分位', '与中位数差值'],
            plans.map(([id, name]) => {
              const score = currentHistoryScores[id]?.score
              const stats = schemeStats[id]
              return [id, id + ' · ' + name, scoreOf(score), stats.count, scoreOf(stats.median),
                stats.percentile == null ? '—' : scoreOf(stats.percentile) + '%', signedScore(stats.difference)]
            }))),
          h('p', { className: 'hint' }, '百分位 =（严格较低的样本数 + 一半的同分样本数）÷ 有效样本数。'),
          historical.some(row => row.reason) ? h('details', { className: 'pressure-section' },
            h('summary', null, '不可比较的历史会话'),
            pressureTable(['会话', '原因'], historical.filter(row => row.reason).map(row => [row.id, row.title || '未命名会话', row.reason]))) : null)

      const pressureGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 165px), 1fr))', gap: 12 }
      const scoreNames = ['容量', '请求', '结构']
      const childColors = ['#5c9ded', '#cc8b46', '#58ab86']
      const currentSeries = scoredTrends[currentTrendId] ?? []
      const latestPoint = currentSeries.at(-1)
      const priorPoint = currentSeries.find(point => point.round === latestPoint?.round - 5)
      const rowFor = (id, label, scope) => dictionary.find(metric => metric.id === id)?.rows.find(row =>
        row.label === label && (!scope || row.scope === scope))
      const measureText = row => dictionaryValue(row?.value, row?.unit)
      const summaryMeasures = [
        ['上下文占用率', rowFor('C', '窗口占用率')], ['剩余窗口', rowFor('C', '剩余容量')],
        ['最近 10 轮平均净增长', rowFor('G', '平均净增长', '最近 10 轮')],
        ['平均每轮消耗', rowFor('U', '平均每轮消耗')], ['工具结果残留', rowFor('T', '残留占比')],
        ['缓存未命中', rowFor('K', '未命中比例')], ['缓存报告覆盖', rowFor('K', '缓存统计覆盖率')],
      ]