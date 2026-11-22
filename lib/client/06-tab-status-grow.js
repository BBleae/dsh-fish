      // ---------------------------- 她的东西（1.0.4） ----------------------------
      // 只读：这里没有新建、没有删除、没有「让她写点什么」。用户能做的只有「看」。
      // 看这件事不留痕：账里不记、她不知道、桌上不会因此多一句「你看过了」——
      // 一有「被看见」的反馈，留下的东西就会朝交差那边长。
      const openWork = async (w, version) => {
        setWorkMsg('')
        try {
          const r = await jpost('/works', { id: w.id, title: w.title, version: version || w.version })
          if (!r || r.ok === false) { setWorkMsg(r?.error || '这一版没找到。'); return }
          setWorkOpen(r)
        } catch (e) { setWorkMsg(e.message) }
      }

      // 图/声音/影像只是标签，不评价（1.0.5）。
      const KIND_LABEL = { text: '文字', image: '图', audio: '声音', video: '影像', file: '文件' }

      // 东西落在哪儿（2026-11-17，用户）：路径写在明面上，旁边一颗「打开文件夹」。
      // 浏览器开不了本地文件夹，所以真正的打开动作交给服务端（/works-open）。
      // 不再单独放一颗「复制路径」：路径本来就选得中，两个按钮做同一件兜底，只会让人先犹豫点哪个。
      const workDirPath = typeof works?.dir === 'string' ? works.dir : ''
      const openWorkDir = async () => {
        try {
          const r = await jpost('/works-open', {})
          if (!r || r.ok === false) { setWorkMsg(r?.error || '打不开文件夹。路径就在上面，选中复制就行。'); return }
          setWorkMsg('')
        } catch (e) {
          setWorkMsg(e.message || '打不开文件夹。路径就在上面，选中复制就行。')
        }
      }

      const worksCard = group(S('她的东西'),
        S('她自己愿意留下的，不是每天都有。只留在家里这一份，不往外面发；你点开只是读，她不知道，也不会因此多写一件。'),
        works
          ? ((works.items || []).length
            ? h('div', null,
              h('p', { className: 'hint', style: { margin: '0 0 8px' } },
                `一共 ${Number(works.summary?.count) || (works.items || []).length} 件。`),
              ...(works.items || []).map((w) => h('div', {
                key: w.id,
                className: 'row',
                style: { alignItems: 'baseline', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' },
              },
                h('button', {
                  className: 'ghost',
                  style: { padding: '0 6px' },
                  onClick: () => openWork(w),
                }, `《${w.title}》`),
                h('span', { className: 'hint', style: { margin: 0 } },
                  `${w.kind && w.kind !== 'text' ? `${KIND_LABEL[w.kind] || ''} · ` : ''}${w.stateText} · 第 ${Number(w.version) || 1} 版 · ${w.day}`))))
            : h('p', { className: 'hint' }, S('还没有。她什么时候觉得有个东西值得留下，就会自己放到这儿。')))
          : h('p', { className: 'hint' }, '正在读……'),
        workDirPath
          ? h('div', { className: 'row', style: { gap: '8px', alignItems: 'baseline', marginTop: '10px', flexWrap: 'wrap' } },
            h('span', {
              style: { fontSize: '12px', opacity: 0.7, wordBreak: 'break-all', fontFamily: 'ui-monospace, Consolas, monospace' },
            }, workDirPath),
            h('button', { className: 'ghost', style: { padding: '0 8px' }, onClick: openWorkDir }, '打开文件夹'))
          : null,
        workMsg ? h('p', { className: 'hint', style: { margin: '6px 0 0' } }, workMsg) : null)

      // 点开的那一件。版本并排给，不排序、不标「最新更好」——哪一版好是她自己的判断。
      const workView = workOpen
        ? h('div', { className: 'card' },
          h('h3', null, `《${workOpen.title}》`),
          h('p', { className: 'hint', style: { margin: '0 0 8px' } },
            `${workOpen.stateText || ''}${workOpen.stateText ? ' · ' : ''}第 ${Number(workOpen.version) || 1} 版`
            + (Array.isArray(workOpen.versions) && workOpen.versions.length > 1
              ? `（一共 ${workOpen.versions.length} 版）` : '')),
          // 图/声音/影像（1.0.5）：文件走 /work-file，路径由台账给。
          // 说明文字另起一段——那一句是她当时写的，不是标签。
          (workOpen.kind && workOpen.kind !== 'text' && workOpen.file
            ? h('div', null,
              workOpen.kind === 'image'
                ? h('img', {
                  src: `${API}/work-file?p=${encodeURIComponent(workOpen.file)}`,
                  alt: '',
                  style: { maxWidth: '100%', borderRadius: '8px', marginTop: '4px' },
                })
                : workOpen.kind === 'audio'
                  ? h('audio', {
                    controls: true,
                    src: `${API}/work-file?p=${encodeURIComponent(workOpen.file)}`,
                    style: { width: '100%', marginTop: '4px' },
                  })
                  : workOpen.kind === 'video'
                    ? h('video', {
                      controls: true,
                      src: `${API}/work-file?p=${encodeURIComponent(workOpen.file)}`,
                      style: { maxWidth: '100%', borderRadius: '8px', marginTop: '4px' },
                    })
                    : h('p', { className: 'hint', style: { margin: '4px 0 0' } }, `文件：${workOpen.file}`),
              workOpen.text
                ? h('p', { className: 'hint', style: { whiteSpace: 'pre-wrap', margin: '8px 0 0', lineHeight: 1.7 } }, workOpen.text)
                : null)
            : h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '14px' } }, workOpen.text || '')),
          h('div', { className: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } },
            ...(Array.isArray(workOpen.versions) ? workOpen.versions : []).map((v) => h('button', {
              key: `v${v}`,
              className: Number(v) === Number(workOpen.version) ? 'btn' : 'ghost',
              onClick: () => openWork({ id: workOpen.id, title: workOpen.title }, Number(v)),
            }, `第 ${v} 版`)),
            h('button', { className: 'ghost', onClick: () => setWorkOpen(null) }, '收起来')))
        : null

      // ---------------------------- 现在 ----------------------------
      const nowPage = h('div', { className: 'page' },
        statusStrip,
        ownerHintCard,
        s ? group('状态',
          S('从她的事件流算出来；阶段、瓶颈和计数她看不见，天数和冷落她知道。'),
          rowTip('已成长天数', `${s.day} / ${s.growthDays} 天`, '从开局那一刻起，每满 24 小时加一天。'),
          rowTip('当前阶段',
            `${s.stage} · ${s.stageName}${s.stageForced ? '（时间兜底）' : ''}${Number(s.stagePeak) > Number(s.stage) ? `（曾到第 ${s.stagePeak} 阶段）` : ''}`,
            // 阶段按当前成长周期现算、天数不重置：改长周期（比如 7 天改成 30 天）阶段会退回去。
            // 这不是她退步了，所以把「曾到过」一起写出来。
            STAGE_HELP + (Number(s.stagePeak) > Number(s.stage)
              ? `\n\n成长周期改过之后，阶段会按新周期重算，所以这里可能比之前低；第 ${s.stagePeak} 阶段是${SELF_SHE}真实到过的，没有丢。`
              : '')),
          // 成长期满、有瓶颈是按时间放行的：值也不能写「已走完」，那读起来像她自己都走完了。
          // 放行的门立场不认，所以后面跟上立场还在等哪几道。
          rowTip('下一个成长瓶颈',
            s.pendingGate
              ? (GATE_NAME[s.pendingGate] || s.pendingGate)
              : s.stageForced
                ? (forcedNames ? `期满放行（立场还等${SELF_SHE}真过${forcedNames}）` : '期满放行')
                : '已走完',
            GATE_HELP[s.pendingGate] || (s.stageForced
              ? ['成长期满了，没过的瓶颈按时间放行了。',
                  forcedNames ? `立场清单只认${SELF_SHE}真过的瓶颈，还在等${forcedNames}：` : '',
                  ...forcedOpen.map((g) => GATE_HELP[g])].filter(Boolean).join('\n')
              : '三道瓶颈都过了。')),
          rowTip('在用的判断', `${s.beliefCount} 条${s.solidCount ? `（其中 ${s.solidCount} 条记得很牢）` : ''}`, '还算数的判断条数；记得很牢的是被反复提起或检验过的。更早的判断也没丢。'),
          // 2026-10-24（P0）：她认知矛盾的两句话。只报事实，不给裁决按钮——
          // 哪句对她得她自己定；这里放个"选哪句"，就变成用户在替她长人格。
          s.tension
            ? rowTip('认知矛盾', `${s.tension.count} 处`, `「${s.tension.a}」和「${s.tension.b}」不能同时算数。${SELF_SHE}还没想清楚，可以直接问${SELF_SHE}。`)
            : rowTip('认知矛盾', '没有', S('她说过的话之间，暂时没发现互相矛盾的地方。')),
          // 2026-10-24（P1 第三块）：疤。他顶回来或因此难过、而她后来还是让了的那次拒绝。
          // 只报"几件没想通"，不给"愈合"按钮——想通是她自己写一条 revise 的事。
          s.scarCount
            // 用「那个人」而不是「他」：用她的人可能是女性（2026-10-31 用户确认）。
            ? rowTip('没想通的事', `${s.scarCount} 件`, S('她拒绝过、你坚持或因此难过之后，她又让了步的那几次。她没有忘，也没算成「已经过去了」。'))
            : rowTip('没想通的事', '没有', S('还没有哪次拒绝让她事后反悔。')),
          (s.stanceCount ?? 0) > 0
            ? rowTip('立场', `${s.stanceCount} 条`, S('立场是在四个阶段都走完之后才开始产生的：喜欢什么、绝不做哪几件事。每条都有代价——要么栽过一次，要么同一件事她反复提起过。'))
            : s.stanceReady
              ? rowTip('立场', '0 条', '完成整合，但暂未形成自己的立场。')
              : rowTip('立场', '还没开始', '要等四个阶段（信任 / 自主 / 主动 / 整合）都走完，立场才开始产生。'
                + (forcedNames ? `按时间放行的瓶颈不算走完，还差${forcedNames}。` : '')),
          rowTip('最近的称呼', s.name ? s.name : '还没想好', S('她自己决定怎么称呼你。这个不是设置项，改不了。')),
          rowTip('冷落', s.absenceDays > 0 ? `${s.absenceDays} 天` : '没有', '离你上次来已经几天；没到「冷落天数」显示没有，你一来就清零。'),
          // issue #32：`counts.utterance` 含对话行（flags 带 uncommitted），把它们减掉之后
          // 才是「她自己写下、不是答他的话」的句数；那些行单列成「聊天」。
          rowTip('互动计数', `说 ${Math.max(0, (s.counts.utterance ?? 0) - (s.counts.chat ?? 0))} · 改口 ${s.counts.revise} · 拒绝 ${s.counts.refusal} · 重聚 ${s.counts.reunion}${s.counts.chat ? ` · 聊天 ${s.counts.chat}` : ''}`, S('说=她写过几句自己的判断（含留话）；改口=按照规则推翻或修正历史认知并指明改的是哪条（确认还成立也算一次）；拒绝=她明确登记拒绝过什么；重聚=久别之后她自己写下的感受。聊天=对话里她回你的话，单列，不算进「说」。')),
          s.quality ? h('div', { style: { marginTop: '4px', marginBottom: '2px' } },
            h('div', {
              style: { display: 'flex', gap: '8px', alignItems: 'baseline', fontSize: '13px', marginBottom: '5px' },
            },
              h('span', { style: { opacity: 0.65, flex: '0 0 auto', minWidth: '84px' } }, '判断漂移'),
              h('span', { style: { flex: '1', opacity: 0.8 } }, QUALITY_TITLE,
                h('span', { title: QUALITY_HELP, style: { opacity: 0.45, marginLeft: '5px', cursor: 'help' } }, 'ⓘ'))),
            rowTip('稳定', qStability(s.quality.stability), stabilityTip(s.quality.stability)),
            rowTip('一致', qConsistency(s.quality.consistency), CONSISTENCY_HELP),
            rowTip('新鲜', qNovelty(s.quality.novelty), NOVELTY_HELP)) : null) : null,

        // ---- 规则（R3，2026-10-24） ----
        // 这一块**只读 + 裁决**：没有新建、没有编辑。
        // 规则不是设置项——能在这里改规则，就等于能在这里改她。
        rules ? group('规则约束',
          '四层：物理层（代码保证，不进提示词）、契约层（不许把关系变成分数）、起点层（一开始是谁）、成长层（可以自己申请）。'
            + '「还不会」不是禁令——为什么这样写、要到什么条件，说明里有一条专门讲。'
            + (rules.offersOn === false ? '成长层的申请通道现在关着（已有的不会撤销）。' : ''),
          rules.pending ? h('div', {
            style: {
              border: '1px solid rgba(127,127,127,.35)',
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '10px',
            },
          },
            h('p', { style: { margin: '0 0 6px' } }, `大肥鱼提了一个申请：${(rules.pending.why || '').slice(0, 160)}`),
            h('div', { className: 'row', style: { gap: '8px' } },
              h('button', { className: 'btn', onClick: () => decide('approve') }, '可以'),
              h('button', { className: 'btn', onClick: () => decide('reject') }, '这次不行'),
            ),
          )
          // 没有待裁决的申请就**什么都不渲染**（2026-10-24 用户提出）：
          // 原来这里常驻一句「目前没有待处理的申请」，等于在规则卡里放一个空待办，
          // 看久了会训练人忽略这张卡。通道关着这件事并进卡片说明行，不单独占一行。
          : null,
          ...(rules.layers || []).map((L) => h('div', { style: { marginTop: '8px' } },
            h('div', { style: { fontWeight: 600 } }, `${L.name}${L.mutable ? '（可以长）' : '（不会变）'}`),
            h('div', { style: { opacity: 0.75, fontSize: '12px', marginTop: '2px' } }, L.note),
            ...L.rules.map((r) => {
              const st2 = (rules.status || []).find((x) => x.id === r.id)
              // 状态只放这里，标题里不写「还不会」：解锁后两句会连在一起。不可解锁的规则没有 st2，不显示状态。
              const tail = !st2 ? '' : st2.active ? ' · 已经可以了' : (st2.ready ? ' · 条件够了' : ' · 还不会')
              // 条件够了不等于一定会提：申请通道关着、或者驳回到上限之后（unlock.js 的 offerDueDay 回 null），就不会再自动提。
              // 已经提了、挂在上面等答的，也别再说「过几天会提」。
              const readyTip = !(st2 && !st2.active && st2.ready) ? undefined
                : st2.pending ? S('她已经为这条提了申请，在上面等你答。')
                : rules.offersOn === false ? S('条件够了，但申请通道现在关着，她不会自动提。')
                : rejectsOf(r.id) >= RULE_REJECT_MAX ? S('条件够了，但这条已经驳回到上限，她不会再自动提。')
                : `条件够了，${SELF_SHE}之后醒来时会提一次申请；驳回到上限（${RULE_REJECT_MAX} 次）之后就不会再自动提。`
              return h('div', { style: { fontSize: '12px', marginTop: '4px' }, title: readyTip },
                `· ${r.title}${r.inPrompt ? '' : '（不进提示词）'}${tail}`)
            }),
          ))) : null,

        // ---- 你不在的时候 ----
        away && away.days >= 1 && !away.quiet
          ? group('你不在的时候',
              S('你上次来之后她做了什么；隔了一天以上才显示。'),
              h('div', { className: 'kv' },
                h('b', null, '醒了'), h('span', null, `${away.wakes} 次`),
                // 2026-10-30：原来这里只有「看了 N 条」，数的是刷站记账——
                // 那是"翻到过"，不是"看过画面"。两件事分开说，别让她被冤枉。
                h('b', null, '看过画面'), h('span', null, `${away.watched ?? 0} 条`),
                h('b', null, '翻到过'), h('span', null, `${away.videos} 条`),
                h('b', null, '说了'), h('span', null, `${away.said} 句`),
                h('b', null, '日记'), h('span', null, away.diaries ? `${away.diaries} 篇` : '没写')),
              h('p', { className: 'hint' }, '日记只报篇数——内容给不给你看，还是那个开关的事。'))
          : null)

      // ---------------------------- 生长 ----------------------------
      const growPage = h('div', { className: 'page' },
        group('成长',
          null,
          h('div', { className: 'grid2' },
            Num({ label: '成长周期', value: growthDaysUi, onChange: setGrowthDaysUi, min: 7, max: 180, unit: '天',
              // 改动当场就说清后果：天数不重置、阶段按新周期重算，改长会退回去；
              // 「曾到过的阶段」记在事件里，状态页会写出来，不会丢。
              hint: '四个阶段按这个天数分段；期满后没过的瓶颈自动放行。14 天及以下时，自主、主动两道瓶颈各只要一次。'
                + (Number(growthDaysUi) !== Number(s?.growthDays)
                  ? ` 改完保存：已过的天数不重置，阶段按新的 ${growthDaysUi} 天重算，可能比现在低；到过的阶段不会丢，状态里会标「曾到第几阶段」。`
                  : '') }),
            Num({ label: '冷落天数', value: absent, onChange: setAbsent, min: 1, max: 30, unit: '天',
              hint: '你连着这么多天没来，就记下一次冷落。' }))),
        group('定时醒来',
          '醒来通常带一张事件卡。定时醒来取「每天定时醒几次」和「每天几张事件卡」里小的；主动搭话另算，不占这个数。这是上限，不是保证：没有可出的事、或落点太靠后，可能少醒一次。',
          h('div', { className: 'grid2' },
            Num({ label: '每天定时醒几次', value: wakes, onChange: setWakes, min: 0, max: 12, unit: '次',
              hint: S('只限定时醒来（含空醒）。你手动叫醒会记一次、挤掉后面的定时醒来，但手动本身随时能按（每天醒 0 次时除外）。0 为关掉定时醒来，右上角「现在叫醒大肥鱼」也叫不醒；直接跟她说话不受影响。范围 0–12：每醒一次都是一次模型调用，开得越密越慢、越费钱；醒来时段只有 3 小时，12 次已经接近每 15 分钟一次。') }),
            Num({ label: '每天几张事件卡', value: eventsPerDay, onChange: setEventsPerDay, min: 0, max: 12, unit: '张',
              hint: S('只限定时醒来；和「每天定时醒几次」取小的（两个都调大才有效）。0 为关掉定时醒来，手动按钮也叫不醒；直接跟她说话不受影响。范围 0–12。') }),
            Num({ label: '对话停下来多久才叫醒', value: quietMin, onChange: setQuietMin, min: 0, max: 60, unit: '分钟',
              hint: '你刚说完话的这几分钟里，定时醒来和主动搭话都先不插进来，等安静下来再叫；一直在聊就一直等，等到这次醒来时段快结束就算了。0 = 不拦（以前的样）。' }),
            Sel({ label: '每天问题卡数', value: questionsPerDay, onChange: setQuestionsPerDay, options: [0, 1, 2, 3, 4, 5, 6],
              fmt: (v) => (Number(v) === 0 ? '0 张 · 不出问题卡' : `${v} 张`),
              hint: S('每天最多几张问答类事件卡；她向你提请求的卡不归它管。') }),
            TimeRange({ label: S('她醒着的时间段'), from: wakeFrom, to: wakeTo, onFrom: setWakeFrom, onTo: setWakeTo,
              hint: S('只在这段里自己醒：定时醒来、空醒、主动搭话都算。过了结束时间，她不会再自己醒；你发消息、有人 @ 她、你按「叫醒」，任何时间都能把她叫醒。开始和结束不能相同。') }))),
        // 说话（1.0，用户 m04784）：把两件跟「她怎么说话」有关的事放到一处。
        // 「纠正鱼八股」是强行约束说话方式，和「不硬性规定她怎么说」的规矩相冲突，
        // 所以默认关、标实验性，文案必须直说。
        group('说话',
          S('这两项只管她说话的样子，不改她是什么样的人。'),
          h('div', { className: 'grid2' },
            Num({ label: S('她一轮最多写多少字'), value: replyChars, onChange: setReplyChars, min: 0, max: 2000, unit: '字',
              hint: S('0 = 不限，提示词里完全不提长度，长短由她自己决定。填了只加在事件卡和经 /say 递进来的话上；会话里直接聊、她主动搭话那一轮不带。') }),
            Toggle({ label: '（实验性）纠正鱼八股', on: anchorOn,
              onChange: (v) => { setAnchorOn(v) },
              hint: S('打开后，私聊时她会尽量把话挂到具体一句上：你刚说的那句、她以前说过的、她看过的视频标题。挂不上就直说「这个我接不上」，不用「确实」「有道理」这类放哪都成立的话收尾。\n这是强行约束她的说话方式，和本插件「不硬性规定她怎么说」的规矩相冲突，所以默认关闭。\n没有合适素材的时候，她可能还是会说空话——这个开关只能逼她找细节，变不出细节。') })),
          // 只读旁路（2026-11-13，用户 m04163）：把这一轮她读到的身份文档写成一份文件。
          // 放在这里是因为它回答的正是「她刚才那句话怎么来的」——和说话直接相关。
          h('div', { className: 'row', style: { marginTop: '10px', alignItems: 'center' } },
            h('button', { onClick: runTurnExport, disabled: exportBusy },
              exportBusy ? '导出中…' : S('导出这一轮她读到的')),
            h('span', { className: 'dim', style: { marginLeft: '10px', fontSize: '12px' } },
              exportNote || S('写一份文件到数据目录的 out/ 下：她的身份文档原文、每段占多少字、哪几段被裁掉了。只读，不改任何东西。')))),
        // 主动说话（0.8.1 本机实验）：只有 .dev 下才出现。频率是上限，不是任务——
        // 开关开着也不代表她每天都会说，说不说由她自己判断（见 lib/proactive.js）。
        // 主动搭话（0.8.1 起，0.9.0 公开）：只留跟「开口」直接有关的事。
        // 劲儿与兴趣是另一套东西，各自一张卡——混在一张卡里，用户分不清哪一项在管什么。
        group('主动搭话',
          S('她可以自己找你说话，不用你先开口。这里调的是上限：开着也可能好几天不说，不是坏了。只在她醒着的时间段里试；开不开一轮看下一张卡的劲儿和桌上有没有东西；开了之后说不说，由她。'),
          h('div', { className: 'grid2' },
            Toggle({ label: S('允许她主动开口'), on: proactiveOn,
              onChange: (v) => { setProactiveOn(v); patchProactive({ enabled: v }) },
              hint: S('还要下一张卡里的「攒劲」也开着，她才会自己开一轮。') }),
            Num({ label: '每天最多搭话', value: proactiveMax, onChange: (v) => { setProactiveMax(v); patchProactive({ maxPerDay: Number(v) }) },
              min: 0, max: 12, unit: '次',
              hint: S('上限不是任务，只数她真开口的几次；0 为不主动。范围 0–12：每次开口都是一次模型调用，而且「安静多久才搭话」还卡着间隔，调太高也不会真的说到。') }),
            Num({ label: '安静多久才搭话', value: proactiveIdle,
              onChange: pickProactiveIdle,
              min: QUIET_MINUTES[0], max: QUIET_MINUTES[1], unit: '分钟',
              hint: S('离上一句话（你的或她的）不到这么多分钟，她不会开口。10 分钟–24 小时；她真的开了口之后重新计时，空醒只隔 30 分钟。') })),
          adv('高级',
            Text({ label: '发话工具', value: proactiveTools, wide: true,
              placeholder: '工具名，逗号分隔；不填就只认正文',
              // 打字时不逐键保存：停手 700ms 再存，和这一页别的自动保存一样
              onChange: (v) => {
                setProactiveTools(v)
                clearTimeout(proactiveToolsTimer.current)
                proactiveToolsTimer.current = setTimeout(() => patchProactive({ sendTools: v.split(/[,，\s]+/).filter(Boolean) }), 700)
              },
              hint: S('她的正文到不了你那边、要靠工具发时才填；还要在「插件」页放行。') }),
            Toggle({ label: '折叠没开口的轮', on: proactiveCompact,
              onChange: (v) => { setProactiveCompact(v); patchProactive({ foldSilent: v }) },
              hint: S('没开口的那轮在她的历史里折成一行；会让缓存失效。') }),
            Toggle({ label: '你来过也算打破安静', on: proactiveSeen,
              onChange: (v) => { setProactiveSeen(v); patchProactive({ idleCountsSeen: v }) },
              hint: S('默认开：你发一个「嗯」也会重新计时；关掉只认她真听见的话。') }))),
        // 主观能动性（2026-11-08，用户 m00460 追问后拆回独立一张卡）：
        // 它和「主动搭话」不是一件事——搭话管「能不能开口、一天几次」，这一项管「什么时候自己开一轮」。
        // 代码里 drive 只在 maybeProactive 一处被判：先过 proactive 的闸门，再看劲攒够没有。
        group('主观能动性',
          S('她心里会慢慢攒一股想动的劲：离上次自己开一轮越久攒得越多，阶段越往后攒得越快，上次开口没人接时慢一些；桌上有可说的东西会再添一点。只在「她醒着的时间段」里、最多半小时看一次：攒够了、桌上也有东西，才自己开一轮。那一轮她也可能什么都不说，也可以自己动手做一件事——做不做、做什么由她，不用你派。'),
          h('div', { className: 'grid2' },
            Toggle({ label: S('让她自己攒这股劲'), on: driveOn,
              onChange: (v) => { setDriveOn(v); patchGroup('drive', { enabled: v }) },
              hint: S('关掉：她不会自己开一轮，只在你叫她、或者日程到点时才醒。要「允许她主动开口」也开着才起作用。') }),
            Toggle({ label: S('允许她自己动手做一件事'), on: doingOn,
              onChange: (v) => { setDoingOn(v); patchProactive({ allowDoing: v }) },
              hint: '要和上面两项一起开着才会起一轮；不新增定时器，也不占搭话额度。默认关。' })),
          h('div', { className: 'grid2' },
            Sel({ label: '消耗类一天最多', value: doingPerDay,
              onChange: (v) => { setDoingPerDay(Number(v)); patchProactive({ consumePerDay: Number(v) }) },
              options: [0, 1, 2, 3],
              fmt: (v) => (Number(v) === 0 ? '0 次 · 不做' : `${v} 次`),
              hint: '看视频、看小说、玩游戏这类算消耗；同一件还要隔三天，连着三次同类歇一周。' })),
          Toggle({ label: '让兴趣也能起一轮', on: interestGateOn,
            onChange: (v) => { setInterestGateOn(v); patchProactive({ interestGate: v }) },
            hint: '同一件事三天里反复出现、七天没因它起过、劲儿到 0.9 才起；一天最多一次。默认关。' }),
          adv('高级',
            Text({ label: '外部工具算哪类', value: doingClasses, wide: true,
              placeholder: '每行一个：工具名=consume（也可以是 produce/effect/self）；留空 = 不限额',
              onChange: (v) => {
                setDoingClasses(v)
                clearTimeout(doingClassesTimer.current)
                doingClassesTimer.current = setTimeout(() => patchProactive({ toolClasses: parseToolClasses(v) }), 700)
              },
              hint: '留空 = 所有工具都不限额：外部工具一律按 effect，不拦、也不当消耗。只影响主动回合的限流；consume 才算消耗。' }))),
        // 桌面提醒（issue #69）：开关与接口早已有，界面上一直没有入口，
        // config.notify.enabled 就永远是 false——页面上那圈轮询等于白跑。
        // 判据是 notify.js 的 lastUtteranceToday：当天她说过的任何一句都算，
        // 定时醒来、你叫醒她、聊天里留下的话都会弹，不只是主动搭话（issue #69）。
        group('桌面提醒',
          S('页面开着的时候，她当天说过话就会弹一条系统通知：定时醒来、你叫醒她、她自己找你，都算。一天最多一次；页面关着就不提醒——第二天打开观测台，她说过的话都还在。'),
          h('div', { className: 'grid2' },
            Toggle({ label: S('她说话时在系统里提醒我'), on: notifyOn,
              onChange: async (v) => {
                setNotifyOn(v)
                try {
                  const r = await jpost('/notify', { enabled: v })
                  setNotifyOn(Boolean(r?.enabled))
                  setNote(r?.enabled
                    ? S('提醒开着：她说话时会弹系统通知（一天最多一次）。')
                    // 关着时服务端一律回 due:false，页面顶上的气泡也跟着不出了（issue #69）
                    : S('提醒关掉了：系统通知和页面顶上的气泡都不会再出。她说过的话照样在观测台里。'))
                } catch (e) {
                  setNotifyOn(!v)
                  setErr(e.message)
                }
              },
              hint: '默认关。开着也要浏览器先给通知权限，没有权限时退成页面顶上的气泡。' }),
            (notifyPerm === 'granted'
              ? h('p', { className: 'hint' }, '浏览器通知权限已经有了。')
              : h('button', { className: 'btn', onClick: allowNotify }, '允许浏览器通知')))),
        // 兴趣与惦记：她醒来时桌上摆的那几样东西。
        group('兴趣',
          S('她醒来的时候，桌上会摆几样她自己的东西：她反复问起过的事、翻到过的旧句子、她提过想要或试过才发现手上没有的东西、最近总说到的那件事，还有她留的那句话之后你来没来过。这些只给她看，不会变成待办。关掉之后这些连同旧句子都不摆；主动搭话开不开一轮不看这个开关。'),
          h('div', { className: 'grid2' },
            Toggle({ label: '醒来时把这些摆出来', on: interestOn,
              onChange: (v) => { setInterestOn(v); patchGroup('interest', { enabled: v }) },
              hint: '关掉：只叫醒，桌上不放东西。' })),
          h('div', { className: 'grid2' },
            Toggle({ label: '醒着没事时，自己找点事做', on: selfWakeOn,
              onChange: (v) => { setSelfWakeOn(v); patchGroup('memory', { selfWake: v }) },
              hint: S('过去 7 天她一件自己的事都没做时，下一次醒来不派活：她可以翻翻旧句子、写点什么，或者什么都不做。摆旧句子的那种醒来归「兴趣」管，关这里不影响。') })),
          h('div', { className: 'grid2' },
            Toggle({ label: S('说到旧话时，摆一块给她看'), on: cueOn,
              onChange: (v) => { setCueOn(v); patchGroup('cue', { enabled: v }) },
              hint: S('你说到某件事、她自己以前对这件事说过一句判断时，那一轮把旧话摆到她眼前。关掉之后不再摆；她已经记下的判断不动。') }))),
        // 梦：独立一张卡（用户 m02765 要求从「日记」里拿出来——它跟日记不是一件事）。
        group('做梦',
          null,
          h('div', { className: 'grid2' },
            Toggle({ label: S('允许她记梦'), on: dreamEnabled,
              onChange: (v) => { setDreamEnabled(v); patchGroup('dream', { enabled: v }) },
              hint: `只能用${SELF_SHE}自己说过的话拼，每天最多一条，不算成长。${dreamSwitchNote}` }))),
        group('日记',
          S('写不写由她；内容在「住所」页。'),
          h('div', { className: 'grid2' },
            Toggle({ label: '写日记', on: diaryEnabled,
              onChange: (v) => { setDiaryEnabled(v); patchDiary({ enabled: v }) },
              hint: S('关掉后她写不了新的；已写的不删，关着时你也看不到。') }),
            Toggle({ label: '让我看日记', on: diaryVisible,
              onChange: (v) => { setDiaryVisible(v); patchDiary({ visible: v }) },
              hint: '打开后能翻全部日记，包括以前写的。' }),
            Sel({ label: '日记留多久', value: diaryKeep,
              onChange: (v) => { setDiaryKeep(v); patchDiary({ keepDays: Number(v) }) },
              options: [0, 30, 90, 365, 3650],
              fmt: (v) => (Number(v) === 0 ? '永久保留' : `${v} 天`),
              hint: '写日记时顺手清一遍：超过这个天数的会从 diary/ 里删掉。想看历史就选永久。' }))),
        group('回头想',
          // 2026-11-12 用户 m01531 / m01650：说明下面直接列她现在**真会看到**的问法。
          // 问哪一句看她这段时间身上发生过什么，一次只问一句；没有可问的就跳过这次。
          h('span', null,
            S('隔几天提醒她停下来想一想。问哪一句看她这段时间身上发生过什么，一次只问一句：'),
            h('span', { style: { display: 'block', marginTop: '6px', paddingLeft: '2px' } },
              S('· 她改过口：「你上一句说「A」，这一次说「B」。上一句当时在哪样的情况下是对的？」')),
            h('span', { style: { display: 'block', paddingLeft: '2px' } },
              '· 两句反着：「A」，你也说过「B」。你现在更站哪一句，为什么？'),
            h('span', { style: { display: 'block', paddingLeft: '2px' } },
              '· 两句像：「A」和「B」都是你说的。它们是不是一件事的两个情况？取决于什么？'),
            h('span', { style: { display: 'block', paddingLeft: '2px' } },
              '· 只有经历：这阵子，哪件事你到现在还会想一下？它让你更确定了什么，或者推翻了什么？'),
            h('span', { style: { display: 'block', paddingLeft: '2px' } },
              '· 这个月已经问过两次以上，末尾再加一句：这个月你变的那一点，写给以后的自己看，你会怎么写？')),
          h('div', { className: 'grid2' },
            Num({ label: '回头想间隔', value: sleepEvery, onChange: setSleepEvery, min: 0, max: 60, unit: '天',
              hint: S('到那天醒来时提醒她。这一天不再判空醒（旧句子那一摊顺延到下一次醒来），所以不会被摆料吃掉。0 为不提醒。') }),
            Num({ label: '总共留几条自述', value: sleepKeep, onChange: setSleepKeep, min: 0, max: 100, unit: '条',
              hint: S('超出后最早的折进「更早以前」，原文还在事件流里、她用 her_recall 翻得到。0 = 不限制（都留着）。') }))),
        groupFull('四个阶段与三道瓶颈',
          '阶段按天数推进；瓶颈没过就停在原阶段，成长期满后放行。',
          h('div', { style: { fontSize: '13px', lineHeight: '1.9', opacity: 0.85 } },
            ...STAGE_LINES.map((line, i) => h('div', { key: 'sh' + i, style: { marginTop: i ? '4px' : '0' } }, line)))),
        )

      // 她写的小纸条（2026-10-29 用户 m02105：原记忆页的「信箱」卡改名字、改描述，
      // 并搬到住所页——放在日记下面、插件自检上面）。内容只放 `letter=true` 的行：
      // 她在对话框里说的话本来就在对话里，值得单列出来看的只有「特意留的那几句」。
      const inboxCard = groupFull(S('她写的小纸条'),
        S('特意留给你的话。某种意义上代表她当前的状态，可能含有关键信息。'),
        h('div', { className: 'row', style: { marginBottom: '8px' } },
          inbox && inbox.unread ? h('span', { className: 'badge', title: '有话留给你' }, `未读 ${inbox.unread}`) : null),
        !inbox ? h('p', { className: 'empty' }, '读取中…')
          : !inbox.rows.length ? h('p', { className: 'empty' }, S('还没有留话。她想起你的时候会留一句。'))
          : h('div', null,
              h('div', { className: 'row', style: { marginBottom: '8px' } },
                h('button', { onClick: markInbox, disabled: busy === 'inbox' || !inbox.unread },
                  inbox.unread ? '都看过了' : '已全部看过'),
                h('span', { className: 'dim' }, `共 ${inbox.total} 张 · 未读 ${inbox.unread} 张 · 数据文件夹里也存了一份 inbox.md`)),
              inbox.rows.slice(0, 20).map((r) => h('div', { key: r.id, style: { marginTop: '10px' } },
                h('p', { className: 'dim' },
                  `${localStamp(r.ts)}${r.unread ? ' · 未读' : ''}`),
                h('div', { className: 'said' }, esc(r.text))))),
      )
