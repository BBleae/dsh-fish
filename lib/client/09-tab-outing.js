      // ---------------------------- 出门 ----------------------------
      // 用户 m07453：让她自己出门去别的工作区干活，回来再判这趟算不算数。
      // 「出门」不是配置（没有自动保存提示），是一次动作——所以不进 AUTO_SAVE_TABS。
      // 这一块的 state 在组件开头（读不到状态时会提前 return，hook 不能写在那之后）。

      // 说明卡看过一遍才放开三个入口（2026-10-30，用户 m01904）。
      // 只记本地配置——挪了数据目录要重新点一次，这是有意的。
      async function doAckOuting() {
        setOutingBusy(true)
        setOutingMsg('')
        try {
          await jpost('/outing', { action: 'ack' })
          setOuting(await jget('/outing'))
        } catch (e) {
          setOutingMsg(`没能记下来：${e.message}`)
        } finally {
          setOutingBusy(false)
        }
      }

      async function doStartOuting() {
        const ws = outingPick || outing?.workspaces?.[0]?.id || ''
        if (!ws) { setOutingMsg('先选一个工作区。'); return }
        setOutingBusy(true)
        setOutingMsg('正在准备……')
        try {
          const row = (outing?.workspaces ?? []).find((w) => w.id === ws)
          const reuseSession = outingReuse && row?.last?.sessionId ? row.last.sessionId : ''
          await jpost('/outing', { action: 'start', workspaceId: ws, sessionId: reuseSession })
          const next = await jget('/outing')
          setOuting(next)
          setOutingMsg(reuseSession ? '回到上次那条对话了，接着做。' : `${SELF_SHE}出门了，现在在「${row?.title || ws}」那边。`)
        } catch (e) {
          setOutingMsg(`没送出去：${e.message}`)
        } finally {
          setOutingBusy(false)
        }
      }

      // 出门口袋（2026-10-28，用户 m01145 拍板「干活模式」）：
      // 干净工作区 + 读拦截 + 保留记忆工具。口袋是一个从没写过记忆的空目录，
      // 每轮注入只剩骨架——她带过去的只有出门那一刻的自己。
      // 2026-10-30（用户 m00972）：口袋也能选「新建一条」还是「接着上次那条」。
      async function doStartPocket() {
        setOutingBusy(true)
        setOutingMsg('正在准备……')
        try {
          const reuseSession = outingReuse && outing?.pocket?.last?.sessionId ? outing.pocket.last.sessionId : ''
          await jpost('/outing', { action: 'start', pocket: true, sessionId: reuseSession })
          setOuting(await jget('/outing'))
          setOutingMsg(reuseSession
            ? '回到园区里上次那条对话了，接着做。'
            : S('她去园区了，新开了一条对话。第一次去时那边没有项目笔记、交接记录；用过以后会留下这个工作区自己的记录。她做出来的文件在园区目录里。'))
        } catch (e) {
          setOutingMsg(`没送出去：${e.message}`)
        } finally {
          setOutingBusy(false)
        }
      }

      // 纪念品（0.6.17）：她问「这件能带回去吗」，这里点头或摇头。
      async function doDecideKeepsake(id, yes) {
        setOutingBusy(true)
        setOutingMsg(yes ? '正在带回来……' : '正在回绝……')
        const refreshOuting = () => jget('/outing').then(setOuting).catch(() => {})
        try {
          const r = await jpost('/outing', { action: 'keepsake', id, yes })
          setOuting(await jget('/outing').catch(() => outing))
          setOutingMsg(
            yes
              ? (r?.ok ? S('带回来了，收在她家的纪念品文件夹里（按日期分）。') : `没带成：${r?.note ?? '不知道哪一步没成'}`)
              : S('没带。她那边会知道这个不让带。'),
          )
        } catch (e) {
          setOutingMsg(`没处理成：${e.message}`)
          // 多半是别的地方先答了：刷新一下，别还留着这一行
          refreshOuting()
        } finally {
          setOutingBusy(false)
        }
      }

      async function doEndOuting(keep, drop = []) {
        setOutingBusy(true)
        setOutingMsg(S('正在叫她回来……'))
        try {
          const r = await jpost('/outing', { action: 'end', kept: keep, rejectedIds: drop })
          setOuting(await jget('/outing'))
          // 文案必须跟实现一致（0.7.4，用户 m00659 B）：原来写成「那部分判断会被跳过」，
          // 而 0.6.12 起 kept=false 根本没写 outing-reject 标记 → 一条都没跳过。
          // 现在 kept=false 会把这一趟的条目全部标上，所以要把真实条数说出来。
          const autoN = Number(r?.rejected ?? 0)
          const held = Number(r?.held ?? 0)
          setOutingMsg(
            r?.marked === false
              ? `叫回来了，但${unmarkedEndText(r, '出门时')}`
              : (r?.tampered || r?.status === 'pending')
                // issue #68：对不上时这趟先整趟不算，人的选择存下来，核对通过后照办。
                ? `这趟的记录对不上，先没算数${held ? S(`（她这趟写的 ${held} 条先全部跳过）`) : ''}。人已经回来了，能力也收回；把记录恢复成出门时的样子，再点「核对一次」。` +
                  (keep === false
                    ? '核对通过后，这趟照你选的不算。'
                    : autoN > 0
                      ? `核对通过后，你划掉的 ${autoN} 条不算，其余的算上。`
                      : '核对通过后，这趟就算数。')
                : keep === false
                  ? (autoN > 0
                      ? `叫回来了。这趟不算数：${SELF_SHE}写的 ${autoN} 条全部跳过，不会算成${SELF_SHE}的成长。`
                      : S('叫回来了。这趟不算数——她这趟什么都没写，所以没有要跳过的。'))
                  : autoN > 0
                    ? `叫回来了。划掉了 ${autoN} 条，那几条不算，其余的照常算。`
                    : '叫回来了。这趟算数。',
          )
          setOutingEndAsk(false)
        } catch (e) {
          setOutingMsg(`没能叫回来：${e.message}`)
        } finally {
          setOutingBusy(false)
        }
      }

      // 复核之后说清这趟是怎么结的（issue #68）：照回家时的选择，可能整趟不算、可能划掉了几条。
      // 出门和请神共用。
      const reviewDoneText = (r, rec) => {
        if (!r?.ok) return '还是对不上，没算数。'
        if (rec?.status === 'rejected') return '核对通过，这趟照你选的不算。'
        const n = Number(r?.rejected ?? 0)
        return n > 0 ? `核对通过，这趟算数，你划掉的 ${n} 条不算。` : '核对通过，这趟算数。'
      }
      // 回家时「不算」的标记没写进去（issue #68）：这趟不落成算 / 不算，留在等复核，
      // 核对时照人的选择补写。写到一半失败的，有一些已经标上了。出门和请神共用。
      const unmarkedEndText = (r, when) =>
        `「不算」的标记${r?.markedPart ? '只写进去一部分' : '没写进去'}（${r?.markWhy || '写记录失败'}），这趟写的${r?.markedPart ? '有一些' : ''}眼下还算着。` +
        (r?.tampered ? `记录也对不上：先把记录恢复成${when}的样子，` : '这趟先留在下面那张卡上：等记录能写了，') +
        '再点「核对一次」，照你选的结。'
      // 「还没算数」卡的标题（issue #68）：先标掉过条目的才说「还没算数」；
      // 一条也没先标掉的（标记没写进去、升级前留下的请神），她写的一直算着，只能说「还没结完」。
      const pendingTitle = (p, kind) => {
        const held = Number(p?.held ?? 0) > 0
        const head = kind === 'outing'
          ? (held ? '上一趟还没算数' : '上一趟还没结完')
          : (held ? '上一次请神还没算数' : '上一次请神还没结完')
        return head + (p?.unmarked && p?.okNow ? '：「不算」的标记没写进去' : p?.checkable === false ? '' : '：记录被篡改过')
      }
      // 「还没算数」卡上，核对通过之后会怎么结（issue #68）。出门和请神共用。
      const reviewPlanText = (p) => {
        const n = Number(p?.dropped ?? 0)
        const fix = p?.unmarked && (p?.autoRejected || n > 0) ? '先照你选的补上标记，' : ''
        if (p?.autoRejected) return `点「核对一次」，${fix}这趟照你回家时选的不算。`
        if (n > 0) return `点「核对一次」，${fix}这趟算数，你回家时划掉的 ${n} 条不算。`
        return Number(p?.held ?? 0) > 0 ? '点「核对一次」，这趟就算数。' : '这趟写的一直算着，点「核对一次」只是把这趟结掉。'
      }
      // 「核对一次」能点时先说为什么能点（issue #68）：出门时没记下基线的那趟核对不了、按能结算算，
      // 不能说成「已经对得上了」——卡片标题里的原因正写着「没记下她自己的记录」。
      const reviewNowText = (p) =>
        p?.checkable === false ? '这趟开始时没记下能比对的记录，没法核对。' : '现在记录已经对得上了。'
      // 还没核对时这趟眼下是什么样：标记没写进去的、升级前挂上的请神 pending，都没有先标掉的条目，
      // 她写的一直算着，不能说成「先全部不算」「还没算数」。
      const heldText = (p) =>
        p?.unmarked
          ? '回家时「不算」的标记没写进去，这趟写的眼下还算着。'
          : Number(p?.held ?? 0) > 0
            ? `这趟${SELF_SHE}写的 ${p.held} 条先全部不算。`
            : S('这趟没有先标掉的条目，她写的一直算着。')

      // 核对上一次没算数的那趟（0.6.32）：记录恢复后重新比对，通过就当场算数。
      async function doReviewPending() {
        setOutingBusy(true)
        setOutingMsg('正在重新核对……')
        try {
          // 带上卡上那一趟（issue #68）：两趟都在等时，别的窗口刚结掉这一趟，
          // 服务端取到的就是下一趟——人没看过它的卡，要回 409，不能顺手结掉。
          const card = outing?.pendingReview ?? null
          const r = await jpost('/outing', { action: 'review', sessionId: card?.sessionId || '', startedAt: card?.startedAt ?? null })
          setOuting(await jget('/outing'))
          setOutingMsg(reviewDoneText(r, r?.outing))
        } catch (e) {
          setOutingMsg(`核对没过：${e.message}`)
          jget('/outing').then(setOuting).catch(() => {})
        } finally {
          setOutingBusy(false)
        }
      }

      // 请神（2026-10-28）：把一条正在用的对话临时交给她。
      // 不做「人格设定」——请神只是把此刻的她借过去，结束时撤销，那条对话恢复原样。
      // 这一块的 state 也在组件开头，理由同「出门」。

      async function loadPossess() {
        try { setPossess(await jget('/possession')) } catch { /* 拿不到就保持原样 */ }
      }

      async function doStartPossess() {
        const sid = possessPick || possess?.sessions?.[0]?.sessionId || ''
        if (!sid) { setPossessMsg('先选一条现在开着的对话。'); return }
        setPossessBusy(true)
        setPossessMsg('正在接入……')
        try {
          await jpost('/possession', { action: 'start', sessionId: sid })
          await loadPossess()
          setOuting(await jget('/outing').catch(() => outing))
          setPossessMsg(S('接上了。从你在那条对话里说的下一句话开始，回你的就是她。'))
        } catch (e) {
          setPossessMsg(`没接上：${e.message}`)
        } finally {
          setPossessBusy(false)
        }
      }

      async function doEndPossess(keep = true, drop = []) {
        setPossessBusy(true)
        setPossessMsg(S('正在让她回去……'))
        try {
          const r = await jpost('/possession', {
            action: 'end',
            sessionId: possess?.active?.sessionId ?? '',
            kept: keep,
            rejectedIds: keep ? (drop ?? []) : [],
          })
          await loadPossess()
          setOuting(await jget('/outing').catch(() => outing))
          setPossessEndAsk(false)
          setPossessDrop([])
          const n = Number(r?.rejected ?? 0)
          const held = Number(r?.held ?? 0)
          // 文案要跟结算一致（与出门 0.7.4 的修法同一套）：说「不算数」就得说清几条被跳过。
          setPossessMsg(
            r?.marked === false
              ? `回去了，但${unmarkedEndText(r, '接管前')}`
              : r?.tampered
              // issue #68：对不上时这趟先整趟不算（以前只是嘴上说，标记一条没写），人的选择留到核对通过再照办。
              ? `${SELF_SHE}回去了，但这趟先不算数：${r?.verify?.why || '记录对不上'}${held ? S(`（她这趟写的 ${held} 条先全部跳过）`) : ''}。把记录恢复成接管前的样子，再点「核对一次」。` +
                (keep === false
                  ? '核对通过后，这趟照你选的不算。'
                  : n > 0
                    ? `核对通过后，你划掉的 ${n} 条不算，其余的算上。`
                    : '核对通过后，这趟就算数。')
              : keep === false
                ? (n > 0
                    ? `回去了。这趟不算数：${SELF_SHE}写的 ${n} 条全部跳过，不会算成${SELF_SHE}的成长。`
                    : S('回去了。这趟不算数。不过这趟她什么都没写，所以没有要跳过的。'))
                : n > 0
                  ? `回去了。划掉了 ${n} 条，那几条不算，其余的照常算。`
                  : r?.note?.ok
                    ? '回去了，那条对话里补了一句交接：「（大肥鱼回去了，这条对话还给你。）」'
                    : `回去了，那条对话恢复原样${r?.note?.why ? `（那句交接没写进去：${r.note.why}）` : ''}。`,
          )
        } catch (e) {
          setPossessMsg(`没能让${SELF_SHE}回去：${e.message}`)
        } finally {
          setPossessBusy(false)
        }
      }

      // 核对上一次没算数的请神（与出门 /outing 的 review 同一套）。
      async function doReviewPossession() {
        setPossessBusy(true)
        setPossessMsg('正在重新核对……')
        try {
          const card = possess?.pendingReview ?? null
          const r = await jpost('/possession', { action: 'review', sessionId: card?.sessionId || '', startedAt: card?.startedAt ?? null })
          await loadPossess()
          setPossessMsg(reviewDoneText(r, r?.possession))
        } catch (e) {
          setPossessMsg(`核对没过：${e.message}`)
          loadPossess()
        } finally {
          setPossessBusy(false)
        }
      }

      const possessActive = possess?.active ?? null
      const possessSessions = possess?.sessions ?? []
      const possessTarget = possessPick || possessSessions[0]?.sessionId || ''
      // 下拉里要显示「对话框的名字」，不是会话 id 尾巴（2026-10-29 用户 m00761）：
      // 名字由服务端从 session/title 事件里读出来；重名时补上工作区目录名区分，
      // 还没起名字的给一句人话，不再把 id 甩给人看。
      const possessWhere = (p) => String(p ?? '').split(/[\\/]/).filter(Boolean).pop() || ''
      const possessNameCount = new Map()
      for (const s of possessSessions) {
        const k = String(s?.title ?? '')
        possessNameCount.set(k, (possessNameCount.get(k) || 0) + 1)
      }
      const possessName = (s) => {
        const t = String(s?.title ?? '').trim() || '还没起名字的对话'
        const dup = (possessNameCount.get(String(s?.title ?? '')) || 0) > 1
        const w = dup ? possessWhere(s?.cwd) : ''
        return w ? `${t} · ${w}` : t
      }

      const awayNowUI = outing?.away ?? null
      const isOut = awayNowUI?.kind === 'outing'
      // issue #68 第 5 条：原来按名字里含「口袋/园区」判，名字像的普通工作区也会被当成园区。
      // 0.9.5 改成拿目录名跟工作区名比，可园区那趟的工作区名是「工作园区」，永远对不上。
      // 现在由服务端按登记的工作区 id 或目录认（away.atPocket）。
      const inPocketOuting = awayNowUI?.atPocket === true
      const wsList = outing?.workspaces ?? []
      const recentOutings = (outing?.outings ?? []).slice(-6).reverse()
      const outPick = outingPick || wsList[0]?.id || ''
      const outPickRow = wsList.find((w) => w.id === outPick) ?? null
      const outingDisabled = Boolean(outing?.away?.kind)
      // 说明卡确认过没有（2026-10-30，用户 m01904）：没确认时三个入口按钮先灰着。
      const outingAck = outing?.ack === true

      // 回家审查：比对结果先给她自己看，不是点完才告诉她「对不上」。
      // 2026-10-30（用户 m00650 第三版）：字节数不摆正文——给人看的是「多了什么」。
      const verifyText = (v) => {
        if (!v) return '还没核对。'
        if (v.checkable === false) return S('这趟出门前没记下她自己的记录，回来没法核对。')
        if (v.ok === true) return '出门前的记录没被改过。'
        return `这段记录对不上：${v.why || '内容对不上'}`
      }
      // 清单只摆最近那些条（issue #68）：摆不下的照常算，整趟不算时也一起标上，要说一声。
      const moreThanListed = (since) => {
        const total = Number(since?.total ?? 0)
        const shown = (since?.items ?? []).length
        return total > shown ? `清单只列出最近 ${shown} 条，更早的 ${total - shown} 条没法单独划掉，照常算；点「整趟不算」会连它们一起不算。` : ''
      }
      const outingStatusText = (o) =>
        o.status === 'active'
          ? '还没回来'
          : o.status === 'pending'
            ? '等着核对'
            : o.status === 'rejected'
              ? '这趟不算'
              : '已算数'
      const outingRows = recentOutings.map((o) =>
        h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'space-between' } },
          h('span', null,
            o.workspaceName || o.workspaceId || '别的工作区',
            o.diaries ? h('span', { className: 'hint', style: { marginLeft: '6px' } }, `· 日记 ${o.diaries} 篇`) : null,
            o.keepsakes ? h('span', { className: 'hint', style: { marginLeft: '6px' } }, `· 带回来 ${o.keepsakes} 件`) : null),
          h('span', { className: 'hint', style: { margin: 0 } },
            `${outingStatusText(o)} · ${new Date(o.startedAt).toLocaleDateString()}`)))

      const outingPage = h('div', { className: 'page' },
        // 关于出门的说明卡（2026-10-30，用户 m00650 / m01100）：文字来自 OUTING_INTRO，
        // 一个元素一段；「送她出门：」「请神：」把冒号前当小标题加粗，这么长的说明才扫得动。
        h('div', { className: 'card full' },
          h('h3', null, '关于出门'),
          adv('点开详细了解',
          ...OUTING_INTRO.map((line, i) => {
            const cut = line.indexOf('：')
            const label = cut > 0 && cut <= 6 ? line.slice(0, cut) : ''
            return h('p', {
              key: `outing-intro-${i}`,
              style: {
                margin: i === OUTING_INTRO.length - 1 ? 0 : '0 0 8px',
                fontSize: '13px',
                lineHeight: 1.7,
              },
            },
              label ? h('strong', null, `${label}：`) : null,
              label ? line.slice(cut + 1) : line)
          }))),

        // 确认门（2026-10-30，用户 m01904）：没点过「我知道了」，三个入口按钮先灰着。
        // 只做在界面——服务端拦住会把命令行与旧用例一起挡掉，而这里要挡的是误点。
        outingAck
          ? null
          : groupFull('先确认一下',
              S('出门是测试版功能。它是真的把一条对话交出去、也真的会读那边的文件——最坏的情况不是数据坏了，是她会把不该看的内容写进日记，而日记撤不回。'),
              h('div', { className: 'row', style: { alignItems: 'center', gap: '10px' } },
                h('button', { disabled: outingBusy, onClick: doAckOuting }, outingBusy ? '正在记……' : '我知道了，开始用'),
                h('span', { className: 'hint', style: { margin: 0 } }, '点过之后不再问；说明随时在上面的卡里。')),
              h('p', { className: 'hint', style: { margin: '8px 0 0' } },
                '第一次用，先试「工作园区」：一个不带项目记录的工作区。')),

        groupFull('现在在哪',
          S('她在家还是在外；在外时家里的定时日程暂停。'),
          isOut
            ? h('div', null,
                h('p', { style: { margin: '0 0 6px', fontWeight: 600 } },
                  awayNowUI.line || '现在在外面'),
                // 写清是哪条对话（0.6.26，用户 m03194）：工作区 + 对话名字 + 第几趟。
                // 2026-10-30（用户 m00650）：会话短号对用户没意义，从正文里去掉——
                // 真要排查时看 possessions/outings 台账就够了。
                h('p', { className: 'hint', style: { margin: '0 0 4px' } },
                  [
                    `在「${awayNowUI.outing?.workspaceName || '那个工作区'}」`,
                    awayNowUI.sessionTitle ? `的「${awayNowUI.sessionTitle}」这条对话里` : '的一条对话里',
                    awayNowUI.tripNo ? ` · 第 ${awayNowUI.tripNo} 趟` : '',
                  ].join('')),
                awayNowUI.warning
                  ? h('p', { style: { margin: '0 0 4px', color: '#e5534b', fontWeight: 600 } }, awayNowUI.warning)
                  : null,
                h('p', { className: 'hint' },
                  S('她在外面写下的，一落进记录就先算上了；叫她回家时，你可以划掉其中几条，或者整趟不算。回来时会先核对她自己的记录有没有被人改过（人为或意外篡改）；如果对不上，这趟就先整趟不算——人照样回家、能力也收回，等你恢复记录、点一下核对再照你的选择结算。')),
                h('p', { className: 'hint' },
                  verifyText(awayNowUI.verify),
                  outing?.identityFrozen ? S(' 她带出去的是出门那一刻的身份；家里之后的变化，这趟她看不到。') : ''),
                // 想念天数（0.6.16，用户 m01677）：只写事实——第几天，不替她抒情。
                // 2026-10-30（用户 m00650）：不再 +1——tripDays 本身就从「今天算第 1 天」起算。
                awayNowUI.tripDays > 0
                  ? h('p', { className: 'hint' }, `这趟出门已经第 ${awayNowUI.tripDays} 天了。`)
                  : null,
                // 留话：这趟出门里她以 user 身份写进自己事件流的那几句。
                (outing?.letters ?? []).length
                  ? h('div', { style: { marginTop: '8px', fontSize: '13px', lineHeight: '1.8' } },
                      h('p', { className: 'hint', style: { margin: '0 0 4px' } }, S('这趟出门，她想对你说：')),
                      ...(outing?.letters ?? []).map((l) => h('div', { key: l.id }, l.text)))
                  : null,
                // 纪念品（0.6.17）：她问「这件能带回去吗」，只有这里点头才会真的复制。
                // 2026-10-30（用户 m00650 第三版）：按钮直接说结果，别提「目录」——
                // 真身是 keepsakes/<日期>/，写「纪念品目录」会让人去找一个不存在的中文文件夹。
                (outing?.keepsakes?.pending ?? []).map((k) =>
                  h('div', { key: k.id, style: { marginTop: '8px', padding: '8px', border: '1px solid var(--border, #333)', borderRadius: '8px', fontSize: '13px' } },
                    h('p', { style: { margin: '0 0 4px' } },
                      S('她想把这件东西带回家：'),
                      h('strong', null, k.rel),
                      h('span', { className: 'hint', style: { marginLeft: '6px' } },
                        `${Math.max(1, Math.round(Number(k.size || 0) / 1024))} KB`)),
                    k.why ? h('p', { className: 'hint', style: { margin: '0 0 6px' } }, k.why) : null,
                    h('p', { className: 'hint', style: { margin: '0 0 6px' } },
                      S('带回来的会收进她家的纪念品文件夹里（按日期分）。')),
                    h('div', { className: 'row' },
                      h('button', { disabled: outingBusy, onClick: () => doDecideKeepsake(k.id, true) }, '带回来'),
                      h('button', { disabled: outingBusy, className: 'ghost', onClick: () => doDecideKeepsake(k.id, false) }, '不用带')))),
                outingEndAsk
                  ? h('div', null,
                      h('p', { className: 'hint', style: { marginTop: '8px' } },
                        // 2026-10-29（用户 m01581，真机）：原来写「你这边没有她可用的工具」，
                        // 这是**事实错误**——她的那几个工具是插件级全局注册的，口袋那条会话里
                        // 一样在手上（只是没有那个工作区的 bash/read/write）。空清单的真实原因
                        // 是她一条没写，不是她没有工具。
                        (awayNowUI.since?.total ?? 0) === 0
                          ? (inPocketOuting
                              ? S('这趟她去的是园区。清单空着，通常就是这趟她没写下什么。算不算，你说了算。')
                              // issue #68 起清单和结算同一个口径，记账行一条不收：写日记、评视频只留一行记账，
                              // 不会出现在这里，所以不能再拿它们举例。
                              : S('这趟她没写新东西，所以没有可以划掉的。只跟你聊天不算她做的事；她写的日记、评的视频也不在这张清单里。想让她留下点什么，就让她在那边记一条自己的想法或判断，回来这里才会出现可勾的条目。'))
                          : `这趟${SELF_SHE}写了 ${awayNowUI.since?.total ?? 0} 条记录。默认全算上；不想要的，把前面的勾去掉。${SELF_SHE}拒绝过或推翻过的会单独标出来——只挑好听的话留下，等于把这趟教坏。` +
                            moreThanListed(awayNowUI.since)),
                      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px', maxHeight: '260px', overflow: 'auto' } },
                        ...(awayNowUI.since?.items ?? []).map((it) => {
                          const on = !outingDrop.includes(it.id)
                          return h('label', { key: it.id, style: { display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', lineHeight: '1.6' } },
                            h('input', {
                              type: 'checkbox',
                              checked: on,
                              disabled: outingBusy,
                              onChange: (e) => setOutingDrop((prev) => e.target.checked ? prev.filter((x) => x !== it.id) : [...prev, it.id]),
                            }),
                            h('span', null,
                              // pushback = type==='refusal' || verdict==='refuted'（她拒绝过 / 推翻过自己），
                              // 不是「不想放弃」——标记要跟语义对得上（2026-10-30 用户 m00650 第三版核对）。
                              it.pushback ? h('strong', { style: { marginRight: '6px' } }, S('（她拒绝过或推翻过的）')) : null,
                              it.text))
                        })),
                      h('div', { className: 'row', style: { marginTop: '8px' } },
                        h('button', { disabled: outingBusy, onClick: () => doEndOuting(true, outingDrop) }, '这趟算数'),
                        h('button', { disabled: outingBusy, className: 'ghost', onClick: () => doEndOuting(false, []) }, '整趟不算'),
                        h('button', { disabled: outingBusy, className: 'ghost', onClick: () => { setOutingEndAsk(false); setOutingMsg('') } }, '先等等')))
                  : h('div', { className: 'row', style: { marginTop: '8px', alignItems: 'center' } },
                      h('button', { disabled: outingBusy, onClick: () => { setOutingDrop([]); setOutingEndAsk(true) } }, S('叫她回家')),
                      h('span', { className: 'hint', style: { margin: 0 } }, '回来时会先让你核对')))
            : awayNowUI?.kind === 'possession'
              ? h('div', null,
                  h('p', { style: { margin: '0 0 6px', fontWeight: 600 } },
                    awayNowUI.line || '现在在这条对话里替人说话'),
                  // 2026-10-29（用户 m01474）：把「护栏是共用的」写明白。
                  // 2026-10-30（用户 m00650 第三版，并纠正原第三版的一句事实错误）：
                  // 护栏只作用于**这一条**被接管的对话——别的对话照常，不会全被拦；
                  // 结束也只能在界面里点，不能让她自己结束（第三版原文「所有对话都不能修改」「只能由用户消息覆盖」都不成立）。
                  h('p', { className: 'hint' },
                    S('这段时间，这条对话里回你话的是她，不是原来那个。护栏是这条对话共用的：分不出谁在打字，所以只有这条被接管的对话碰不到她家里的东西（屋子、记忆、对话、配置）——调用里带着这些路径的，读和写都会被一起拦下来；别的对话不受影响。回你话的也不再是原来的助手。结束只能在界面里点。')),
                  h('p', { className: 'hint' },
                    S('这期间她说过的话会留在上下文里（可能会干扰这条对话原本的工作），结束时系统会补一句「（大肥鱼回去了，这条对话还给你。）」，帮原来的助手接回人格。想完全干净，就新开一条对话。')))
              : h('p', { className: 'dim', style: { margin: 0 } }, '在家。没有出门。'),

          outingMsg ? h('p', { className: 'hint', style: { marginTop: '10px' } }, outingMsg) : null,

          // 上一趟被拒收的那趟（0.6.32，用户 2026-10-29 真机要求）：
          // 以前 pending 只剩「等确认」三个字，没有原因、也没有下一步，
          // 结果人和文件都在，却是死路。这里把原因和复核按钮一起摆出来。
          (outing?.pendingReview ?? null)
            ? h('div', { style: { marginTop: '10px', padding: '8px', border: '1px solid var(--border, #333)', borderRadius: '8px', fontSize: '13px' } },
                h('p', { style: { margin: '0 0 4px', fontWeight: 600 } }, pendingTitle(outing.pendingReview, 'outing')),
                h('p', { className: 'hint', style: { margin: '0 0 4px' } },
                  // 2026-10-30（用户 m00650 第三版第 21 条）：不再摆会话短号——
                  // 对普通用户来说那是一串看不懂的编号。
                  `${outing.pendingReview.workspaceName || '那个工作区'} · ${outing.pendingReview.reason || '对不上'}`),
                h('p', { className: 'hint', style: { margin: '0 0 6px' } },
                  outing.pendingReview.okNow
                    ? reviewNowText(outing.pendingReview) + reviewPlanText(outing.pendingReview)
                    : `人已经回家了，能力也收回，${heldText(outing.pendingReview)}把记录恢复成出门时的样子，再来点「核对一次」。`),
                h('div', { className: 'row', style: { alignItems: 'center' } },
                  h('button', { disabled: outingBusy || !outing.pendingReview.okNow, onClick: () => doReviewPending() }, '核对一次'),
                  outing.pendingReview.okNow ? null : h('span', { className: 'hint', style: { margin: 0 } }, '还没恢复')))
            : null,

          // 最近几趟并进这张卡（0.6.16，用户 m01613：信息与台账重复，合并）。
          recentOutings.length
            ? h('div', { style: { marginTop: '12px', fontSize: '13px', lineHeight: '1.9' } },
                h('p', { className: 'hint', style: { margin: '0 0 4px' } }, '最近的几趟：'),
                ...outingRows)
            : null),

        groupFull('工作园区（专门干活用）',
          S('一个固定的工作区，专门用来干活。第一次去时不带项目记录，用过以后会留下这个工作区自己的记录和文件。她带过去的，只有出门那一刻的自己。'),
          !outing
            ? h('p', { className: 'hint' }, '正在读园区……')
            : h('div', null,
                h('p', { className: 'hint', style: { margin: '0 0 8px' } },
                  '工作园区在：' + (outing.pocket?.path || '（还定不下来）') +
                    (outing.pocket?.registered ? '' : '（第一次用时会自动登记成一个工作区）')),
                h('div', { className: 'row' },
                  h('button', {
                    disabled: !outingAck || outingDisabled || outingBusy,
                    onClick: doStartPocket,
                  }, outingBusy ? '正在准备……' : S('让她去园区'))),
                // 2026-10-30（用户 m00972）：园区也可以接着上次那条会话做，
                // 不必每趟从白纸开始；不勾就是新开一条。
                outing.pocket?.last?.sessionId
                  ? h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px', fontSize: '13px', lineHeight: '1.6' } },
                      h('input', {
                        type: 'checkbox',
                        checked: outingReuse,
                        disabled: outingDisabled || outingBusy,
                        onChange: (e) => setOutingReuse(e.target.checked),
                      }),
                      h('span', null,
                        '接着上次做（回到工作园区里上次那条对话）',
                        h('span', { className: 'hint', style: { display: 'block', margin: '2px 0 0' } },
                          '上次是 ' + new Date(outing.pocket.last.startedAt).toLocaleDateString() +
                          ' 去的。不勾就新开一条。')))
                  : null,
                h('p', { className: 'hint', style: { marginTop: '8px' } },
                  S('能不能写到别的目录，看这个工作区的权限设置（沙箱或全部权限）。她做出来的文件在园区目录里。')),
                h('p', { className: 'hint', style: { marginTop: '8px', fontWeight: 600 } },
                  S('别把她送到放着插件源码的工作区：在那边她能读到自己不该看的文件（禁令的完整清单就写在源码里）。只是干活的话，用园区最稳妥。')))),

        groupFull(S('让她去别的工作区'),
          S('选一个工作区，在那边开一条新对话。在那边，她用那个工作区本来的权限和工具，不套家里这套收窄过的工具清单。'),
          !outing
            ? h('p', { className: 'hint' }, '正在读工作区列表……')
            : wsList.length === 0
              ? h('p', { className: 'hint' }, '还没有别的工作区。先在 DSH 里新建一个工作区，再回来这里。')
              : h('div', null,
                  h('div', { className: 'row', style: { alignItems: 'center', gap: '10px' } },
                    h('select', {
                      value: outPick,
                      disabled: outingDisabled || outingBusy,
                      onChange: (e) => setOutingPick(e.target.value),
                    }, ...wsList.map((w) => h('option', { value: w.id }, w.title || w.id))),
                    h('button', {
                      disabled: !outingAck || outingDisabled || outingBusy || !outPick,
                      onClick: doStartOuting,
                    }, outingBusy ? '正在准备……' : S('让她去这个工作区'))),
                  // 复用同一趟（0.6.16，用户 m01613）：这个工作区上次那条对话还在，
                  // 就可以接着做，而不是每趟从白纸开始。
                  outPickRow?.last?.sessionId
                    ? h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px', fontSize: '13px', lineHeight: '1.6' } },
                        h('input', {
                          type: 'checkbox',
                          checked: outingReuse,
                          disabled: outingDisabled || outingBusy,
                          onChange: (e) => setOutingReuse(e.target.checked),
                        }),
                        h('span', null,
                          '接着上次做（回到这个工作区上次那条对话）',
                          h('span', { className: 'hint', style: { display: 'block', margin: '2px 0 0' } },
                            '上次是 ' + new Date(outPickRow.last.startedAt).toLocaleDateString() +
                            ' 去的。不勾就新开一条。')))
                    : null,
                  h('p', { className: 'hint', style: { marginTop: '8px' } },
                    S('出门期间，家里不会定时叫醒她。她在那边写下的当场就先算上；叫她回家时，你可以划掉几条，或者整趟不算。')),
                  h('p', { className: 'hint', style: { marginTop: '8px', fontWeight: 600 } },
                    S('这个选项有副作用：那个工作区的项目笔记、交接记录、记忆文件等凡是你之前调用过以及你的记忆类插件总结过的，会被整份带进她的上下文（可能会导致她知道很多不该、不适合知道的事）。只想让她干活，用上面的工作园区。')),
                  awayNowUI?.kind === 'possession'
                    ? h('p', { className: 'hint' }, S('她正在替人说话，先结束请神，再出门。'))
                    : null)),

        groupFull(S('请神（让她接管一条正在用的对话）'),
          S('把一条对话临时交给她。从你下一句话开始，回你的就是她——是本人灵魂出窍接手回复，工具按照该会话的给，不是人格复制。你点结束时交还，她说过的话仍留在那条对话里。'),
          possessActive
            ? h('div', null,
                h('p', { className: 'hint', style: { margin: 0, fontWeight: 600 } },
                  `现在在这条对话里：${possessActive.title || '还没起名字的对话'}${possessWhere(possessActive.cwd) ? `（${possessWhere(possessActive.cwd)}）` : ''}`),
                // 2026-10-29（用户 m01474）：护栏是这条对话共用的，不区分谁在说话。
                // 2026-10-30（用户 m00650 第三版，并纠正第三版里的两处事实错误）：
                // 「所有对话都不能修改」不成立——只有被接管的这一条会被拦；
                // 「结束请神只能由用户消息覆盖」也不成立——结束只能从界面按钮触发。
                h('p', { className: 'hint', style: { marginTop: '8px' } },
                  S('这段时间护栏是共用的：它分不出谁在打字，所以你在那条对话里也碰不到她家里的东西（屋子、记忆、对话、配置）——调用里带着这些路径的，读和写都会被一起拦下来。只有这条被接管的对话受影响，别的对话照常。回你话的也不再是原来的助手。')),
                h('p', { className: 'hint', style: { marginTop: '6px' } },
                  S('这期间她说过的话会留在上下文里（可能会干扰这条对话的工作任务），结束时系统会补一句「（大肥鱼回去了，这条对话还给你。）」，帮助恢复原来的助手人格。想完全干净，就新开一条对话。')),
                // 回家审查卡（m02241 第⑤条）：两栏并排——左边逐条挑，右边看比对结果再拍板。
                // 和出门那张卡同一套语义：默认全收下，取消勾选 = 那几条跳过；整趟不算 = 全跳过。
                possessEndAsk
                  ? h('div', { style: { display: 'flex', gap: '14px', marginTop: '10px', alignItems: 'flex-start', flexWrap: 'wrap' } },
                      h('div', { style: { flex: '1 1 260px', minWidth: '240px' } },
                        h('p', { className: 'hint', style: { margin: '0 0 4px', fontWeight: 600 } },
                          `这趟${SELF_SHE}新写下的 ${possess?.since?.total ?? 0} 条`),
                        (possess?.since?.items ?? []).length
                          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflow: 'auto' } },
                              ...(possess.since.items).map((it) => {
                                const on = !possessDrop.includes(it.id)
                                return h('label', { key: it.id, style: { display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', lineHeight: '1.6' } },
                                  h('input', {
                                    type: 'checkbox',
                                    checked: on,
                                    disabled: possessBusy,
                                    onChange: (e) => setPossessDrop((prev) => e.target.checked ? prev.filter((x) => x !== it.id) : [...prev, it.id]),
                                  }),
                                  h('span', null,
                                    // pushback 是「她拒绝过 / 推翻过自己的判断」，不是「不想放弃」或「违抗命令」。
                                    it.pushback ? h('strong', { style: { marginRight: '6px' } }, S('（她拒绝过或推翻过的）')) : null,
                                    it.text))
                              }))
                          : h('p', { className: 'hint', style: { margin: 0 } },
                              S('这趟她没写新东西，所以没有可以划掉的。只跟你聊天不算她做的事。'))),
                      h('div', { style: { flex: '1 1 220px', minWidth: '200px' } },
                        h('p', { className: 'hint', style: { margin: '0 0 4px', fontWeight: 600 } }, '记录核对'),
                        h('p', { className: 'hint', style: { margin: '0 0 4px' } }, verifyText(possess?.verify)),
                        h('p', { className: 'hint', style: { margin: '0 0 6px' } },
                          S('默认全算上；左边没勾的会被标成「不算」。她拒绝过或推翻过的会单独标出来——只挑好听的话留下，等于把这趟教坏。') +
                            moreThanListed(possess?.since)),
                        h('div', { className: 'row' },
                          h('button', { disabled: possessBusy, onClick: () => doEndPossess(true, possessDrop) }, '这趟算数'),
                          h('button', { disabled: possessBusy, className: 'ghost', onClick: () => doEndPossess(false, []) }, '整趟不算'),
                          h('button', { disabled: possessBusy, className: 'ghost', onClick: () => { setPossessEndAsk(false); setPossessDrop([]); setPossessMsg('') } }, '先等等'))))
                  : h('div', { className: 'row', style: { marginTop: '8px', alignItems: 'center' } },
                      h('button', {
                        disabled: possessBusy,
                        onClick: () => { setPossessDrop([]); setPossessEndAsk(true) },
                      }, possessBusy ? S('正在让她回去……') : '结束请神'),
                      h('span', { className: 'hint', style: { margin: 0 } }, '点开先核对这趟')))
            : h('div', null,
                h('p', { className: 'hint', style: { margin: 0 } },
                  '只能选现在开着的对话。没打开过的，点击一次之后才会出现在这里。'),
                h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } },
                  h('select', {
                    value: possessTarget,
                    disabled: possessBusy || possessSessions.length === 0,
                    onChange: (e) => setPossessPick(e.target.value),
                  }, ...possessSessions.map((s) => h('option', { value: s.sessionId }, possessName(s)))),
                  h('button', {
                    disabled: !outingAck || possessBusy || !possessTarget,
                    onClick: doStartPossess,
                  }, possessBusy ? '正在接入……' : S('请她上身'))),
                // 2026-10-30（用户 m00650 第三版第 47 条：两处不重复全文，这里缩成一句结论）。
                h('p', { className: 'hint', style: { marginTop: '8px', fontWeight: 600 } },
                  S('注意：接上之后，这条对话的护栏就被她和原来那个共用——分不出谁在打字，所以你在那条对话里也碰不到她家里的东西（屋子、记忆、对话、配置），读和写都会被一起拦下来。只有这条对话受影响，别的对话照常。只能由你结束。'))),
          // 上一次没结算的请神（m02241 第②条）：与出门那趟同一套——摆原因、摆复核按钮。
          // 不给这块，pending 就只剩一句「等复核」，人不知道在等什么。
          (possess?.pendingReview ?? null)
            ? h('div', { style: { marginTop: '10px', padding: '8px', border: '1px solid var(--border, #333)', borderRadius: '8px', fontSize: '13px' } },
                h('p', { style: { margin: '0 0 4px', fontWeight: 600 } }, pendingTitle(possess.pendingReview, 'possess')),
                h('p', { className: 'hint', style: { margin: '0 0 4px' } },
                  `${possess.pendingReview.title || '那条对话'} · ${possess.pendingReview.reason || '对不上'}`),
                h('p', { className: 'hint', style: { margin: '0 0 6px' } },
                  possess.pendingReview.okNow
                    ? reviewNowText(possess.pendingReview) + reviewPlanText(possess.pendingReview)
                    : `人已经回到原来的位置了，${heldText(possess.pendingReview)}把记录恢复成接管前的样子，再来点「核对一次」。`),
                h('div', { className: 'row', style: { alignItems: 'center' } },
                  h('button', { disabled: possessBusy || !possess.pendingReview.okNow, onClick: () => doReviewPossession() }, '核对一次'),
                  possess.pendingReview.okNow ? null : h('span', { className: 'hint', style: { margin: 0 } }, '还没恢复')))
            : null,
          possessMsg ? h('p', { className: 'hint', style: { margin: '8px 0 0' } }, possessMsg) : null))

      // ---- 桥接投递口（2026-11-19，用户 m00805）----
      // 用户要把 QQ/别的 IM 的桥接进来投递消息。宿主内那条 /dsh-fish/say 外部进程
      // 走不通（信任栅栏要 App 的登录 cookie），插件另开了一个只绑回环的口子。
      // 默认关着：端口 0。填了端口保存就当场起，不用重启油。
      async function patchBridge(nextPort) {
        const before = bridgePort
        setBridgePort(nextPort)
        try {
          const r = await jpost('/config', { bridge: { port: Number(nextPort) || 0 } })
          setBridgeUrlLive(typeof r.bridge === 'string' ? r.bridge : '')
          flashSaved()
        } catch (e) {
          setBridgePort(before)
          failSave(e.message)
        }
      }
      const bridgeCard = group(S('桥接投递口'),
        S('外面的桥（QQ 群、别的 IM）要往她这儿投递消息时走这条。宿主里那条 /dsh-fish/say 只有 App 自己打得到，外面的程序一律 401，所以单独开了这个口子——只绑 127.0.0.1，只认 /say 与 /whoami 两条路，浏览器里的网页发不过来。'),
        Num({
          label: '端口',
          value: bridgePort,
          onChange: (v) => patchBridge(v),
          min: 0, max: 65535, unit: '',
          hint: bridgePort > 0
            ? (bridgeUrlLive
              ? `现在开着：${bridgeUrlLive}/whoami（GET，看它在不在）·${bridgeUrlLive}/say（POST，投递一句话）`
              : `端口 ${bridgePort} 上没起来——可能被别的程序占了，换一个。`)
            : '0 = 不开。填一个没人用的端口（比如 17888）就开；只有本机连得进来。',
        }),        bridgePort > 0
          ? h('p', { className: 'hint', style: { margin: 0 } },
            '投递的写法：POST JSON 到 /say，正文 {"text":"要说的话"}；可选 scene、channel、room、speaker、guest、owner、image。'
            + '不传 scene 就是私聊、进家里那条会话。')
          : null)

      const envPage = h('div', { className: 'page' },
        toolsCard,
        // ---- 桥接投递口（2026-11-19，用户 m00805）----
        // 起因：一位 QQ 桥用户严格照 AGENTS.md §7.1 走 POST /dsh-fish/say，一路 403。
        // 那条路由在宿主里，套着信任栅栏，外部进程拿不到那枚签名 cookie。所以另开了
        // 一个只在本机回环上的投递口，默认关着，要接桥的人自己在这里填端口。
        // 端口存进 config.bridge.port，/config 的保存分支会当场起/停，不用重启。
        bridgeCard,
        group('为什么默认只放这几个',
          null,
          h('ul', { style: { margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: '1.9', opacity: 0.85 } },
            h('li', null, S('每个工具的定义都占她每轮的上下文。')),
            h('li', null, '工具越多，越容易顺手去做，而不是先想要不要做。'),
            h('li', null, '有些工具会真的动到外面：发消息、下文件、跑命令。'))),
        aboutCard,
        )
