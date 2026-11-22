      function pressureLines(points, lines, endpoints = []) {
        const first = points[0]?.round ?? 1
        const last = points.at(-1)?.round ?? first
        const x = round => 43 + 617 * (round - first) / Math.max(1, last - first)
        const y = score => 189 - score * 1.65
        if (!points.some(point => lines.some(line => Number.isFinite(line.read(point))))) {
          return h('p', { className: 'hint' }, '暂无可绘制的轮末分数。')
        }
        return h('svg', { viewBox: '0 0 680 220', role: 'group', 'aria-label': '轮末压力走势（0–100）', style: { width: '100%' } },
          ...[0, 25, 50, 75, 100].map(value => h('g', { key: value },
            h('line', { x1: 43, x2: 660, y1: y(value), y2: y(value), stroke: 'currentColor', opacity: .16 }),
            h('text', { x: 35, y: y(value) + 4, fill: 'currentColor', fontSize: 12, textAnchor: 'end' }, value))),
          ...[...new Set([first, Math.floor((first + last) / 2), last])].map(round => h('text', {
            key: round, x: x(round), y: 209, fill: 'currentColor', fontSize: 12, textAnchor: 'middle',
          }, round)),
          ...endpoints.map((round, index) => h('line', { key: index, x1: x(round), x2: x(round), y1: 20, y2: 190,
            stroke: 'currentColor', strokeDasharray: '4 3', opacity: .6 })),
          ...lines.flatMap(line => trendSegments(points.map(point => ({ round: point.round, score: line.read(point) })))
            .map((segment, i) => h('polyline', { key: line.label + ':' + i, stroke: line.color, strokeWidth: 2,
              fill: 'none', points: segment.map(point => x(point.round) + ',' + y(point.score)).join(' ') }))),
          ...points.flatMap(point => {
            const values = lines.map(line => [line, line.read(point)]).filter(([, score]) => Number.isFinite(score))
            const label = ['第 ' + point.round + ' 轮', ...values.map(([line, score]) => line.label + ' ' + scoreOf(score) + ' 分'),
              routeDetails(point), ...point.markers.map(marker => marker.type)].filter(Boolean).join(' · ')
            return values.length || point.markers.length ? [h('g', { key: point.round, tabIndex: 0, 'aria-label': label },
              h('title', null, label),
              ...values.map(([line, score]) => h('circle', { key: line.label, cx: x(point.round), cy: y(score), r: 3, fill: line.color })),
              point.markers.length ? h('path', { d: 'M ' + x(point.round) + ' 13 l 4 4 -4 4 -4 -4 z', fill: 'currentColor' }) : null)] : []
          }))
      }
      function lineToggles(key, options) {
        const hidden = trendConfig[key] ?? []
        return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12 } }, ...options.map(item => h('label', { key: item.id },
          h('input', { type: 'checkbox', checked: !hidden.includes(item.id), onChange: event => changeTrend({
            [key]: event.currentTarget.checked ? hidden.filter(id => id !== item.id) : [...hidden, item.id],
          }) }), h('span', { style: { color: item.color } }, ' ' + item.label))))
      }
      const currentLines = plans.map(([id]) => ({ id, label: id, color: schemeColors[id], read: point => point.scores?.[id]?.score }))
      const currentRange = trendConfig.currentRange ?? 20
      const homePoints = currentRange ? currentSeries.slice(-currentRange) : currentSeries
      const recentChanges = currentSeries.slice(-10).flatMap((point, index, recent) => plans.flatMap(([id]) => {
        const previous = recent[index - 1]
        const before = previous?.scores?.[id]?.score
        const after = point.scores?.[id]?.score
        return previous?.round === point.round - 1 && Number.isFinite(before) && Number.isFinite(after) && before !== after
          ? [{ round: point.round, id, difference: after - before }] : []
      })).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)).slice(0, 3)
      const currentCards = h('div', { style: pressureGrid }, ...plans.map(([id, name], index) => {
        const stats = homeSchemeStats[id]
        const last = latestPoint?.scores?.[id]?.score
        const previous = priorPoint?.scores?.[id]?.score
        return h('section', { key: id, className: 'card', style: { minWidth: 0, borderBlockStart: '3px solid ' + schemeColors[id] } },
          h('h4', null, id + ' · ' + name),
          pressureMetric('当前实时压力', scoreOf(compositeScores[id].score) + ' / 100',
            ['综合均衡视角', '多维风险视角', '容量优先视角'][index]),
          h('div', { className: 'hint' }, '最近完成轮变化（5 轮） ' + (Number.isFinite(last) && Number.isFinite(previous) ? signedScore(last - previous) : '—')),
          h('div', { className: 'hint' }, '轮末历史同轮次 · 百分位 ' + (Number.isFinite(stats.percentile) ? scoreOf(stats.percentile) + '%' : '—')
            + ' · 中位数差 ' + signedScore(stats.difference)),
          h('div', { className: 'hint' }, stats.count ? stats.count + ' 个历史样本' : '暂无可比样本'))
      }))
      const advice = sessionCapacityAdvice(occupancy, observedGrowth)
      const capacityStatus = {
        continue: ['✓', '继续使用', '#58ab86', '当前窗口仍有余量，可以继续使用这个会话。'],
        watch: ['◉', '继续使用，留意变化', '#5c9ded', '可以继续使用，接下来留意上下文占用的变化。'],
        prepare: ['△', '建议准备新会话', '#cc8b46', '建议在下一段任务前准备新会话，给后续对话留出空间。'],
        switch: ['!', '强烈建议切换', '#db726b', '当前上下文已接近或达到有效窗口上限，建议在下一段任务前改用新会话。'],
        unknown: ['?', '数据不足，暂不能判断', '#8e99a7', '缺少有效窗口或当前请求输入，暂时无法判断容量余量。'],
      }[advice.level]
      const unstableTrend = growthWindows.some(window => window.rounds <= 10 && window.compacted)
        || currentSeries.slice(-10).some(point => point.markers.some(marker =>
          ['压缩成功', '裁剪', '模型切换', '窗口切换'].includes(marker.type)))
      const occupancyText = value => Number.isFinite(value) ? scoreOf(value) + '%' : '—'
      const tShare = structureData?.currentShare
      const evidence = [
        [Number.isFinite(occupancy) ? '当前窗口已使用 ' + occupancyText(occupancy) : '当前占用未知',
          '最新模型请求实报输入 ' + measureText(rowFor('C', '请求输入'))
            + '，有效窗口 ' + measureText(rowFor('C', '有效窗口'))
            + '，剩余 ' + measureText(rowFor('C', '剩余容量')) + '。占用率按本次请求的输入除以有效窗口计算。'],
        [advice.five == null ? '近期趋势未知' : observedGrowth < 0 ? '最近可比轮次的占用呈净下降'
          : advice.five >= 95 - 1e-10 ? '按近期趋势，5 轮后可能接近窗口上限'
            : advice.ten >= 85 - 1e-10 ? '按近期趋势，10 轮后可能达到较高占用'
              : '按近期趋势，10 轮内预计低于 85%',
          advice.five == null ? '缺少当前占用或可比的轮末增长采样。' : '当前加权净增长 '
            + signedScore(observedGrowth) + ' 个百分点/轮，复用 C + G 的近期窗口加权和容量推演。'
            + '预计占用以 0–100% 显示。'],
        ...(Number.isFinite(tShare) && tShare >= .5 ? [[
          '工具结果约占宿主可见请求的一半或更多',
          '同请求估算占比 ' + dictionaryValue(tShare, '%') + '。这描述工具内容占用，仅用于解释压力来源。',
        ]] : []),
      ]
      const adviceCard = h('section', { className: 'card', style: { borderInlineStart: '4px solid ' + capacityStatus[2] } },
        h('h4', { className: 'load-heading' }, h('span', null,
          h('span', { 'aria-hidden': true, style: { color: capacityStatus[2], marginInlineEnd: 8 } }, capacityStatus[0]), capacityStatus[1]),
        h('span', { className: 'hint' }, '实验规则 · 阈值尚未校准')),
        h('p', null, capacityStatus[3]),
        h('ul', null, ...evidence.map(([label]) => h('li', { key: label }, label))))
      const adviceDetails = h('section', { className: 'card' }, h('h4', null, '为什么这样判断'),
        h('div', { style: pressureGrid },
          ...[['当前占用', occupancy], ['预计 5 轮后', advice.five], ['预计 10 轮后', advice.ten]].map(([label, value]) =>
            h('div', { key: label }, pressureMetric(label, occupancyText(value))))),
        advice.five == null ? h('p', { className: 'hint' }, '趋势未知，现有建议仅依据可用的当前占用。')
          : h('p', { className: 'hint' }, '按当前增长趋势估算，不保证实际结果。'),
        unstableTrend ? h('p', { className: 'hint' }, '近期记录了压缩、裁剪或配置切换，趋势可能不稳定。') : null,
        h('details', { className: 'pressure-section' }, h('summary', null, '查看具体依据'),
          ...evidence.map(([label, detail]) => h('details', { key: label }, h('summary', null, label), h('p', null, detail))),
          h('p', { className: 'hint' }, '建议采用真实采样和固定的 5、10 轮窗口。公式试算、A/B/C 分数与累计用量用于分析，不参与建议分级。'),
          h('button', { type: 'button', onClick: () => setPressureTab('factors') }, '查看诊断指标')))
      const pressureCurrent = h('div', { className: 'load-panel' }, adviceCard, currentCards,
        isScenario ? h('p', { className: 'hint' }, 'A/B/C 使用当前情景参数试算。') : null,
        invalidStructure ? h('p', { role: 'alert' }, '工具残留数据异常，当前 T + E 和 A/B/C 分数无效。') : null,
        adviceDetails,
        h('section', { className: 'card' },
          h('h4', null, '压力走势'),
          h('label', null, '轮次范围 ', h('select', { value: currentRange,
            onChange: event => changeTrend({ currentRange: Number(event.currentTarget.value) }) },
            ...[10, 20, 50, 0].map(value => h('option', { key: value, value }, value ? '最近 ' + value + ' 轮' : '全部轮次')))),
          lineToggles('homeHidden', currentLines),
          pressureLines(homePoints, currentLines.filter(line => !(trendConfig.homeHidden ?? []).includes(line.id))),
          h('button', { type: 'button', onClick: () => { changeTrend({ historyPage: 'compare' }); setPressureTab('history') } }, '查看完整压力走势'),
          h('button', { type: 'button', onClick: () => { changeTrend({ historyPage: 'same', round: null }); setPressureTab('history') } }, '查看历史同轮次比较')),
        h('section', { className: 'card' },
          h('h4', null, '压力构成'),
          h('div', { style: pressureGrid }, ...['C + G · 容量压力', 'U + A + K · 请求负担', 'T + E · 结构与稳定性'].map((name, index) => {
            const last = latestPoint?.children?.[index]
            const previous = priorPoint?.children?.[index]
            return h('div', { key: name }, pressureMetric(name, scoreOf(subScores[index]) + ' / 100',
              '近 5 轮 ' + (Number.isFinite(last) && Number.isFinite(previous) ? signedScore(last - previous) : '—')),
              Number.isFinite(subScores[index]) ? h('progress', { max: 100, value: subScores[index], 'aria-label': name }) : null)
          })),
          h('button', { type: 'button', onClick: () => setPressureTab('calculation') }, '查看详细计算方式')),
        h('section', { className: 'card' }, h('h4', null, '关键诊断'),
          h('div', { style: pressureGrid }, ...summaryMeasures.map(([name, row]) => h('div', { key: name },
            pressureMetric(name, measureText(row), row?.confidence))),
            pressureMetric('最近失败与重试', latestUsage ? latestUsage.attempts + ' 次尝试失败 · ' + latestUsage.retries + ' 次已匹配重试' : '—'))),
        h('details', { className: 'pressure-section' }, h('summary', null, '近期变化与事件'),
          recentChanges.length ? h('ul', null, ...recentChanges.map(row => h('li', { key: row.round + ':' + row.id },
            '第 ' + row.round + ' 轮 · 方案 ' + row.id + ' ' + signedScore(row.difference) + ' 分'))) : null,
          eventTable(currentSeries.slice(-10))))
      const toolOrder = trendConfig.toolOrder ?? 'tokens'
      const currentTools = (pressure?.usage?.toolResults ?? []).slice().sort((a, b) => toolOrder === 'turn'
        ? b.turn - a.turn : toolOrder === 'age' ? a.turn - b.turn : b.tokens - a.tokens)
      const rawRecords = new Map((pressure?.usage?.roundDiagnostics ?? []).map(row => [row.turn, row]))
      const roundNumbers = [...new Set([...rows.map(row => row.turn), ...rawRecords.keys()])].sort((a, b) =>
        trendConfig.roundAscending ? a - b : b - a)
      const sampleByRound = new Map(rows.map(row => [row.turn, row]))
      const diagnosticsView = h('div', { className: 'load-panel' },
        h('div', { style: pressureGrid }, ...dictionary.map(metric => {
          const row = metric.rows.find(value => Number.isFinite(value.value))
          return h('div', { key: metric.id, className: 'card' }, pressureMetric(metric.id + ' · ' + metric.title,
            measureText(row), row ? row.scope + ' · ' + row.confidence : '缺少数据'))
        })),
        pressureFactors, contextDiagnostics,
        h('details', { className: 'pressure-section' }, h('summary', null, '工具结果分析'),
          h('label', null, '查看 ', h('select', { value: trendConfig.toolView ?? 'retained',
            onChange: event => changeTrend({ toolView: event.currentTarget.value }) },
            h('option', { value: 'retained' }, '当前残留'), h('option', { value: 'carry' }, '历史累计携带'))),
          trendConfig.toolView === 'carry'
            ? pressureTable(['工具', '采样调用数', '轮末采样 Token', '跨轮可见次数', '累计重复携带 Token（估算）'],
              [...new Set([...tools.map(row => row.name), ...burden.map(row => row.name)])].map(name => {
                const sample = tools.find(row => row.name === name)
                const carry = burden.find(row => row.name === name)
                return [name, name, formatPressure(sample?.calls), formatPressure(sample?.tokens),
                  formatPressure(carry?.exposures), formatPressure(carry?.tokensAcrossRequests)]
              }))
            : h('div', null,
              h('label', null, '排序 ', h('select', { value: toolOrder, onChange: event => changeTrend({ toolOrder: event.currentTarget.value }) },
                h('option', { value: 'tokens' }, 'Token'), h('option', { value: 'turn' }, '产生轮次'), h('option', { value: 'age' }, '年龄'))),
              pressureTable(['工具', '估算 Token', '产生轮次', '年龄（轮）', '后续携带次数', '仍可见'], currentTools.map(row =>
                [row.seq, row.name, formatPressure(row.tokens), row.turn,
                  formatPressure(Number.isFinite(latestUsage?.turn) ? latestUsage.turn - row.turn : null),
                  formatPressure(row.carried), row.retained == null ? '—' : row.retained ? '是' : '否'])))),
        h('details', { className: 'pressure-section' }, h('summary', null, '逐轮诊断记录'),
          h('button', { type: 'button', onClick: () => changeTrend({ roundAscending: !trendConfig.roundAscending }) },
            trendConfig.roundAscending ? '最新轮在前' : '最早轮在前'),
          h('label', null, '跳到轮次 ', h('input', { type: 'number', min: 1, value: trendConfig.diagnosticRound ?? '',
            onChange: event => changeTrend({ diagnosticRound: event.currentTarget.valueAsNumber || null }) })),
          ...roundNumbers.filter(round => !trendConfig.diagnosticRound || round === trendConfig.diagnosticRound).slice(0, 25).map(round => {
            const record = rawRecords.get(round)
            const meter = sampleByRound.get(round)
            return h('details', { key: round, className: 'pressure-section' }, h('summary', null, '第 ' + round + ' 轮'),
              pressureTable(['诊断', '读数'], [
                ['input', '请求输入', dictionaryValue(record?.input, 'Token')], ['output', '请求输出', dictionaryValue(record?.output, 'Token')],
                ['delta', '轮末净增长', dictionaryValue(meter?.delta, 'Token')], ['occupancy', '轮末窗口占用率', dictionaryValue(meter?.contextWindow > 0 ? meter.tokens / meter.contextWindow : null, '%')],
                ['requests', '请求次数', formatPressure(record?.requests)], ['tools', '工具残留', dictionaryValue(record?.retained, 'Token')],
                ['cache', '缓存未命中', dictionaryValue(record?.cache ? 1 - record.cache.ratio : null, '%')],
                ['events', '记录事件', meter?.compacted ? '压缩或裁剪' : '—'],
              ]))
          })))
      const pressureCalculation = h('div', { className: 'load-panel' },
        h('h4', null, '七项诊断 → 三个子压力 → A/B/C'),
        h('button', { type: 'button', onClick: () => {
          setCapacityExperiment({}); setRequestExperiment({}); setStructureExperiment({}); setCompositeExperiment({})
        } }, '恢复全部实验默认值'),
        [capacityExperiment, requestExperiment, structureExperiment, ...Object.values(compositeExperiment)]
          .some(values => Object.keys(values).length) ? h('p', { className: 'hint' }, '实验参数已修改') : null,
        ...[
          ['capacity', 'C + G · 容量压力', subScores[0], 'γ ' + gamma + ' · H ' + horizon + ' · λ ' + lambda, capacityCalculation],
          ['request', 'U + A + K · 请求负担', subScores[1], 'ρ ' + rho + ' · β ' + beta + ' · τ ' + tau, requestCalculation],
          ['structure', 'T + E · 结构与稳定性', subScores[2], 'wₜ ' + toolWeight + ' · ε ' + epsilon + ' · η ' + eta, structureCalculation],
        ].map(([id, label, value, params, content]) => h('details', { key: id, className: 'pressure-section',
          open: !!trendConfig['formula:' + id], onToggle: event => {
            const open = event.currentTarget.open
            if (!!trendConfig['formula:' + id] !== open) changeTrend({ ['formula:' + id]: open })
          } }, h('summary', null, label + ' · ' + scoreOf(value) + ' / 100 · ' + params
            + (Number.isFinite(value) ? '' : ' · 缺少采样')), content)),
        compositeCalculation)
      const headerModel = pressure?.lastRequest?.model ?? (comparison?.current?.route ? JSON.parse(comparison.current.route)[1] : null)
      const pressureHeader = h('div', { className: 'load-heading', style: { flexWrap: 'wrap' } },
        h('strong', null, trendChoices.find(row => row.current)?.title || '当前 Session'),
        h('span', { className: 'hint' }, [latestRound ? latestRound + ' 轮' : '— 轮', headerModel || '模型未知',
          pressure?.updatedAt ? new Date(pressure.updatedAt).toLocaleTimeString() : '—',
          pressure?.failed ? '读取失败' : pressure?.availability === 'analyzed' ? '已读取诊断' : '等待诊断'].join(' · ')))
      function eventTable(points) {
        const events = points.flatMap(point => point.markers.map((marker, index) => [point.round + ':' + index,
          point.round, marker.time == null ? '—' : new Date(marker.time).toLocaleString(), marker.type,
          Number.isFinite(marker.tokenChange) ? signedScore(marker.tokenChange) + ' Token' : '—',
          h('details', null, h('summary', null, '记录详情'),
            marker.seq != null ? '日志序号 ' + marker.seq + '。' : '',
            marker.from && marker.to ? marker.from.join(' / ') + ' → ' + marker.to.join(' / ') + '。' : '',
            marker.count ? '匹配重试 ' + marker.count + ' 次。' : '',
            Number.isFinite(marker.tokens) ? '归因耗用 ' + formatPressure(marker.tokens) + ' Token。' : '',
            Number.isFinite(marker.tokenChange) ? '有成对采样。' : '该事件无成对 Token 变化读数。')]))
        return events.length ? pressureTable(['轮次', '时间', '事件', 'Token 变化', '来源详情'], events)
          : h('p', { className: 'hint' }, '该区间暂无已记录的结构性事件。')
      }
      const attributionPoints = scoredTrends[attributionId] ?? []
      const endpoints = attributionPoints.filter(point => point.children?.length === 3 && point.children.every(Number.isFinite))
      const endpoint = (round, fallback) => endpoints.find(point => point.round === round) ?? fallback
      const startPoint = endpoint(trendConfig.attributionStart, endpoints[Math.max(0, endpoints.length - 6)])
      const endPoint = endpoint(trendConfig.attributionEnd, endpoints.at(-1))
      const attributionPlan = trendConfig.attributionPlan ?? 'A'
      const lowRound = Math.min(startPoint?.round ?? 0, endPoint?.round ?? 0)
      const highRound = Math.max(startPoint?.round ?? 0, endPoint?.round ?? 0)
      const interval = attributionPoints.filter(point => point.round >= lowRound && point.round <= highRound)
      const contribution = pressureContributions(startPoint?.children, endPoint?.children, attributionPlan, compositeParameters)
      const forecastLink = trendConfig.attributionForecast
      const errorRecord = forecastLink ? records.find(row => row.sessionId === attributionId && row.origin === startPoint?.round
        && row.target === endPoint?.round && row.plan === attributionPlan && row.method === forecastLink.method) : null
      const errorParts = errorRecord && pressureContributions(endPoint?.children, errorRecord.predictedChildren, attributionPlan, compositeParameters)
      const childLines = scoreNames.map((label, index) => ({ id: index, label, color: childColors[index], read: point => point.children?.[index] }))
      const delta = (start, end) => Number.isFinite(start) && Number.isFinite(end) ? signedScore(end - start) : '—'
      function contributionBars(values, name) {
        if (!values) return h('p', { className: 'hint' }, '该公式或端点缺少可分解的分数。')
        const scale = 208 / Math.max(1, ...values.map(Math.abs))
        return h('svg', { viewBox: '0 0 650 132', role: 'group', 'aria-label': name, style: { width: '100%' } },
          h('line', { x1: 320, x2: 320, y1: 6, y2: 116, stroke: 'currentColor', opacity: .6 }),
          ...values.map((value, index) => {
            const y = 15 + 35 * index
            const label = scoreNames[index] + '贡献 ' + signedScore(value) + ' 分'
            return h('g', { key: index, tabIndex: 0, 'aria-label': label },
              h('title', null, label), h('text', { x: 10, y: y + 13, fill: 'currentColor', fontSize: 14 }, scoreNames[index]),
              h('rect', { x: 320 + Math.min(0, value * scale), y, width: Math.abs(value * scale), height: 17, fill: childColors[index] }),
              h('text', { x: 555, y: y + 13, fill: 'currentColor', fontSize: 14 }, signedScore(value)))
          }))
      }
      const attributionPanel = !wantAttribution ? null : h('section', { className: 'load-panel' },
        h('h4', null, '压力变化归因 · v0.1'),
        h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
          h('label', null, 'Session ', h('select', { value: attributionId ?? '',
            onChange: event => changeTrend({ attributionId: event.currentTarget.value, attributionStart: null,
              attributionEnd: null, attributionForecast: null }) },
            ...trendChoices.map(row => h('option', { key: row.id, value: row.id }, row.title || '未命名 Session')))),
          ...[['attributionStart', '起始轮次', startPoint], ['attributionEnd', '结束轮次', endPoint]].map(([key, label, value]) =>
            h('label', { key }, label, ' ', h('select', { value: value?.round ?? '',
              onChange: event => changeTrend({ [key]: Number(event.currentTarget.value), attributionForecast: null }) },
              ...endpoints.map(point => h('option', { key: point.round, value: point.round }, point.round))))),
          h('label', null, '综合公式 ', h('select', { value: attributionPlan,
            onChange: event => changeTrend({ attributionPlan: event.currentTarget.value }) },
            ...plans.map(([id, name]) => h('option', { key: id, value: id }, id + ' · ' + name)))),
          startPoint && endPoint ? h('button', { type: 'button', onClick: () => changeTrend({
            attributionStart: endPoint.round, attributionEnd: startPoint.round, attributionForecast: null,
          }) }, '交换起止轮') : null),
        trendLoading ? h('p', { role: 'status' }, '正在读取逐轮诊断…') : null,
        forecastLink ? h('section', { className: 'card' }, h('h4', null, '预测误差归因'),
          errorRecord ? h('div', null,
            h('p', null, '第 ' + errorRecord.origin + ' → ' + errorRecord.target + ' 轮 · ' + methodLabels[errorRecord.method]
              + ' · 实际 ' + scoreOf(errorRecord.actual) + ' · 预测 ' + scoreOf(errorRecord.estimate)
              + ' · 误差 ' + signedScore(errorRecord.estimate - errorRecord.actual)),
            pressureTable(['子压力', '实际', '预测'], scoreNames.map((name, index) =>
              [index, name, scoreOf(endPoint.children[index]), scoreOf(errorRecord.predictedChildren[index])])),
            contributionBars(errorParts, '预测误差贡献'))
            : h('p', { className: 'hint' }, '当前端点或公式的该次预测无法可靠重建。')) : null,
        !startPoint || !endPoint ? h('p', { className: 'hint' }, '该会话暂无有效的归因端点。') : h('div', { className: 'load-panel' },
          interval.length < highRound - lowRound + 1 || interval.some(point => !point.children?.every(Number.isFinite))
            ? h('p', { className: 'hint' }, '区间诊断不完整。贡献依据有效端点，图中保留断点。') : null,
          h('section', { className: 'card' }, h('h4', null, '端点分数'),
            pressureTable(['压力项', '起点', '终点', '变化'], [
              ...scoreNames.map((name, i) => [name, name + '子压力', scoreOf(startPoint.children[i]), scoreOf(endPoint.children[i]),
                delta(startPoint.children[i], endPoint.children[i])]),
              ...plans.map(([id, name]) => [id, id + ' · ' + name, scoreOf(startPoint.scores?.[id]?.score),
                scoreOf(endPoint.scores?.[id]?.score), delta(startPoint.scores?.[id]?.score, endPoint.scores?.[id]?.score)]),
            ])),
          h('section', { className: 'card' }, h('h4', null, '三个子压力的变化'),
            lineToggles('attributionHidden', childLines),
            pressureLines(interval, childLines.filter(line => !(trendConfig.attributionHidden ?? []).includes(line.id)),
              [...new Set([startPoint.round, endPoint.round])])),
          h('section', { className: 'card' }, h('h4', null, '综合压力贡献'),
            contributionBars(contribution, '综合压力变化贡献'),
            h('p', { className: 'hint' }, '贡献表示评分公式中的数学影响，不代表现实因果关系。')),
          h('details', { className: 'pressure-section' }, h('summary', null, '七项诊断变化明细'),
            ...dictionary.map(metric => {
              const keys = row => JSON.stringify([row.label, row.scope, row.unit])
              const start = new Map((startPoint.diagnostics?.find(item => item.id === metric.id)?.rows ?? []).map(row => [keys(row), row]))
              const end = new Map((endPoint.diagnostics?.find(item => item.id === metric.id)?.rows ?? []).map(row => [keys(row), row]))
              return h('details', { key: metric.id, className: 'pressure-section' }, h('summary', null, metric.id + ' · ' + metric.title),
                pressureTable(['读数', '起点', '终点', '差值', '来源', '范围'], [...new Set([...start.keys(), ...end.keys()])].map(key => {
                  const a = start.get(key)
                  const b = end.get(key)
                  const row = a ?? b
                  const d = a && b ? b.value - a.value : null
                  const unit = row.unit === '%' || row.unit === '百分点' ? '百分点' : row.unit
                  return [key, row.label, measureText(a), measureText(b), dictionaryValue(d, unit), row.source, row.scope]
                })))
            })),
          h('details', { className: 'pressure-section' }, h('summary', null, '结构性事件时间线'), eventTable(interval))))
      const selectedSessionsSummary = h('details', { className: 'pressure-section' }, h('summary', null, 'Session 概览'),
        pressureTable(['Session', '实际轮数', '最后有效轮', '最后模型 / 窗口', '配置切换', '成功压缩', '有效轮'], trendIds.map(id => {
          const points = scoredTrends[id] ?? []
          const valid = points.filter(point => Number.isFinite(point.scores?.[displayedPlans[0]]?.score))
          return [id, trendChoices.find(row => row.id === id)?.title || '未命名 Session',
            points.length || '—', valid.at(-1)?.round ?? '—', routeDetails(points.at(-1) ?? {}) || '—',
            points.length ? points.some(point => point.switched) ? '有' : '无' : '—',
            points.length ? points.reduce((count, point) => count + point.markers.filter(marker => marker.type === '压缩成功').length, 0) : '—',
            points.length ? valid.length + ' / ' + points.length : '—']
        })))
      const historyView = h('div', { className: 'load-panel' }, pressureHistory,
        h('div', { className: 'tabs load-tabs', role: 'group', 'aria-label': '历史分析视图' },
          ...[['compare', 'Session 对比'], ['same', '同轮次比较'], ['backtest', '预测回测'], ['attribution', '变化归因']].map(([id, label]) =>
            h('button', { key: id, type: 'button', className: 'tab' + (id === historyPage ? ' on' : ''),
              'aria-pressed': id === historyPage, onClick: () => changeTrend({ historyPage: id }) }, label))),
        historyPage === 'compare' ? h('div', null, trendChart, selectedSessionsSummary)
          : historyPage === 'same' ? sameRoundPanel : historyPage === 'backtest' ? pressureBacktest : attributionPanel)

      const pressureCard = h('details', { className: 'card full',
        onToggle: event => setPressureOpen(event.currentTarget.open) },
        h('summary', null, h('strong', null, '会话压力')),
        pressureOpen ? h('div', null,
          pressure?.usage?.partial || pressure?.usage?.pendingCount > 0
            ? h('p', { className: 'hint', role: 'status' }, '部分结果 · 历史已分析 '
              + pressure.usage.analyzedCount + ' / ' + pressure.usage.selectedCount
              + ' · 待处理 ' + pressure.usage.pendingCount) : null,
          pressureHeader, loadTabBar,
          pressureTab === 'current' ? pressureCurrent : pressureTab === 'history' ? historyView : pressureTab === 'factors' ? diagnosticsView : pressureCalculation) : null)

      const tabBar = h('div', { className: 'tabs' },
        ...TABS.map(([id, name]) => h('button', {
          key: id,
          className: 'tab' + (tab === id ? ' on' : ''),
          title: TAB_HELP[id] || '',
          onClick: () => setTab(id),
        }, name)),
      )

      // 一页里的一组设置。title 之外还可以给 note（这一组整体的一句话）。
      const group = (title, note, ...items) => h('div', { className: 'card' },
        h('h3', null, title),
        note ? h('p', { className: 'hint', style: { marginBottom: '10px' } }, note) : null,
        ...items)
      // 长内容（清单、事件流、信箱）横跨整行：内容多、又窄又高，两列反而更难读。
      const groupFull = (title, note, ...items) => h('div', { className: 'card full' },
        h('h3', null, title),
        note ? h('p', { className: 'hint', style: { marginBottom: '10px' } }, note) : null,
        ...items)
      // 一行「名称 — 值」，tip 存在时在值后面挂一个可悬停的 ⓘ。
      // 用它代替纯 kv：那一版用户看到「下一道门」和「稳定 0.87」都不知道在说什么。
      const rowTip = (k, v, tip) => h('div', {
        style: { display: 'flex', gap: '8px', alignItems: 'baseline', fontSize: '13px', marginBottom: '5px' },
      },
        h('span', { style: { opacity: 0.65, flex: '0 0 auto', minWidth: '84px' } }, k),
        h('span', { style: { flex: '1' } }, v,
          tip ? h('span', { title: tip, style: { opacity: 0.45, marginLeft: '5px', cursor: 'help' } }, 'ⓘ') : null))

      // 2026-10-24（用户）：底部「保存改动」整组删掉。原来每个页签都挂一颗，
      // 让人以为必须先点；住所页根本没有设置项也挂着一颗。现在改完即存，
      // 没有设置的页签自然什么都不需要。

      // 数据文件夹路径一律由服务端 /paths 现算（用户 m03440）。
      // 原来这里按 workspace 目录名以 home 结尾去反推根目录、再用反斜杠拼子路径：
      // 目录一改名就推错，而且反斜杠是 Windows 假设。客户端不该重复实现服务端的事实。

      const copyPath = async (p) => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(p)
            setNote('已复制到剪贴板。粘到资源管理器地址栏回车就能打开。')
          } else {
            setNote('这个环境不让写剪贴板，复制失败。')
          }
        } catch {
          setNote('这个环境不让写剪贴板，复制失败。')
        }
      }

      // 导出报告：纯前端拼一个 markdown 文件下载，不新开任何服务端路由。
      const downloadReport = () => {
        const md = reports?.md || ''
        if (!md) { setNote('这一天的报告正文还没取到，没有可导出的。点一下上面那天的日期再取一次。'); return }
        if (typeof document === 'undefined' || typeof Blob === 'undefined') { setNote('这个环境不支持下载。'); return }
        try {
          const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `大肥鱼-报告-${reports.date || 'latest'}.md`
          a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 4000)
          setNote(`已导出 ${a.download}`)
        } catch (e) { setErr(e.message) }
      }

      // 2026-10-25：B 站登录提示卡。存好之后自己消失；也可以手动点「不用了」
      // （选择记进 config.ui.ownerHintDismissed，别再反复出现）。
      const ownerHintCard = (ow && !ow.hasCookie && !uiHintDismissed)
        ? h('div', { className: 'card', style: { borderColor: 'var(--dsw-alias-border-l2)' } },
          h('h3', null, '还没存 B 站登录'),
          h('div', { className: 'dim' },
            '发评论和回复要用到它；读热评、读回复不用它；看画面没有它也会试着取，但不一定取得到，有它更稳。存好之后这张卡会自己消失——不想存就点「不用了」，以后不再提示。'),
          h('div', { className: 'row', style: { gap: '8px', marginTop: '6px' } },
            // issue #12（TulleyT，2026-10-29）：这里原写 showTab('bili')，而 showTab 是
            // 「现在是不是这个页」的判据（返回布尔），真正的切换是 setTab。返回值被丢弃，
            // 所以点了既不跳页也不报错。从 0.6.1 起就这样，一直没人点到过。
            h('button', { onClick: () => setTab('bili') }, '去上网页存'),
            h('button', {
              className: 'ghost',
              onClick: async () => {
                try {
                  await jpost('/config', { ui: { ownerHintDismissed: true } })
                  setUiHintDismissed(true)
                } catch (e) { setErr(e.message) }
              },
            }, '不用了')))
        : null
