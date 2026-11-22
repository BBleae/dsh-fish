      // ---------------------------- 记忆 ----------------------------
      // 记忆体检（0.7.6，用户 m00342）：只读、点一下才跑，不让它自动轮询。
      const runHealth = async () => {
        setHealthBusy(true)
        try {
          setHealth(await jget('/health'))
        } catch (e) {
          setHealth({ error: String(e?.message || e) })
        } finally {
          setHealthBusy(false)
        }
      }
      // 把「这一轮她读到的身份文档」导出成一份文件（2026-11-13，用户 m04163）。
      // 只读：读账本、写 out/turn-<时间戳>.md，不改事件流、不进她的提示词。
      // 用来回答「她为什么没提到那件事」——身份文档有字数上限，超了是整段不塞。
      // 用 function 声明而不是 const 箭头：这颗按钮挂在「说话」那一组上，
      // 而那一组在源码里排得比这里靠前——const 会撞上暂时性死区，整页都渲染不出来。
      async function runTurnExport() {
        setExportBusy(true)
        try {
          const r = await jpost('/turn/export', {})
          setExportNote(r?.ok
            ? `已写到 ${r.file}（用了 ${r.used} / ${r.budget} 字${r.dropped?.length ? `，裁掉 ${r.dropped.length} 段` : '，没有段被裁'}）`
            : `没导成：${r?.why || '未知原因'}`)
        } catch (e) {
          setExportNote(`没导成：${String(e?.message || e)}`)
        } finally {
          setExportBusy(false)
        }
      }
      const memoryPage = h('div', { className: 'page' },
        group('会话与身份',
          S('会话聊多久换新，换的时候带几轮原话，她每轮读到的身份段多长。'),
          h('div', { className: 'grid2' },
            Num({ label: '聊满多少轮换新会话', value: rotateAfter, onChange: setRotateAfter, min: 0, max: 500, unit: '轮',
              hint: S('聊满这个轮数之后，还要等一次停顿才换：最后一句话过去 20 分钟没人接，下一轮开头换新会话；如果一直连着聊，最多再延 10 轮强制换。所以换房总落在对话的缝隙里，不会从话中间切开。默认 120。0 = 永不换——那条会话会一直聊到宿主上下文撑不住为止，之后这一轮会直接失败（不会自动换）。换的时候带过去的是最近几轮原话（「上次我们说到这」）和还挂着的事，带几轮由下面那一项决定；身份段本来每轮都有，不用另带。') }),
            // 2026-11-17 用户 m04639：A+C。carry 真的决定摆几轮，设置用档位而不是裸数字；
            // 当前值不在档位里（老用户可能是 4）就把它动态加进去，否则 select 会误显示第一项。
            Sel({ label: '换新会话时带几轮原话',
              value: carryTurns,
              onChange: (v) => setCarryTurns(Number(v)),
              options: [...new Set([0, 3, 6, 12, Number(carryTurns)])].filter((v) => Number.isFinite(v)).sort((a, b) => a - b),
              fmt: (v) => {
                const n = Number(v)
                if (n === 0) return '不带原话 · 只带还挂着的事'
                if (n === 3) return '少 · 3 轮'
                if (n === 6) return '中 · 6 轮'
                if (n === 12) return '多 · 12 轮'
                return `${n} 轮`
              },
              hint: S('只影响换窗口后的第一轮：最后 1 轮不裁剪，再往前每轮 40 字；页面上限随轮数放大（400–1200 字）。带得越多，第一轮越贵，也越容易接着旧话题说。0 = 不带原话，只带还挂着的事；更早的事用 her_recall 翻。') }),
            Num({ label: '身份段字数', value: docBudget, onChange: setDocBudget, min: 1800, max: 8000, step: 100, unit: '字',
              hint: S('她每轮读到的身份段最多多少字；超了先省次要段。范围 1800–8000：1800 以下装不下现在已经有的段，8000 以上每轮都在为这段文字付钱。') }))),

        // 会话压力不再放在设置页（2026-11-17，用户 m02888）：挪到对话页的「压力」页签 + 头部小胶囊。

        // ---- 记忆（原「背了多少东西」） ----
        // 全是客观计数：多少字、占预算几成、多少条被挤掉。
        // 刻意不出现任何"打分"型指标（那属于 N2 禁止的量化评价）。
        group('记忆',
          '身份段的字数用量，以及判断、矛盾、立场等计数。',
          h('div', { className: 'grid2', style: { marginBottom: '10px' } },
            Num({ label: '眼前的判断条数', value: beliefsShown, onChange: setBeliefsShown, min: 1, max: 8, unit: '条',
              hint: S('每轮逐条给她看几条最显著的判断，其余折成一行。要消耗更多 token，默认推荐 3。') }),
            Num({ label: '记你原话的间隔', value: hearEvery, onChange: setHearEvery, min: 0, max: 50, unit: '轮',
              hint: '每隔这么多轮，记下你那一轮最长的一句原话，不加解释、不改写。群聊不按间隔：你在群里说的每条都记最长的一句。0 为不记，群聊里也一样。' })),
          Toggle({ label: S('摆一句她最近说过的话'), on: echoOn,
            onChange: (v) => { setEchoOn(v); patchGroup('memory', { echo: v }) },
            hint: S('身份段末尾摆一句她自己说过、但没认领的话，最多 1 条、21 天内。关掉只是这一节消失，那些话仍在事件流里，她用 her_recall 翻得到。') }),
          !mem ? h('p', { className: 'empty' }, '读取中…')
            : h('div', null,
                h('div', { className: 'row', style: { alignItems: 'center', gap: '10px' } },
                  h('div', { className: 'bar', style: { flex: '1', height: '8px', background: 'rgba(127,127,127,.25)', borderRadius: '4px', overflow: 'hidden' } },
                    h('div', {
                      style: {
                        width: `${Math.round((mem.selfDoc?.usedRatio ?? 0) * 100)}%`,
                        height: '100%',
                        background: (mem.selfDoc?.usedRatio ?? 0) > 0.95 ? '#c0562f' : '#4a7',
                      },
                    })),
                  h('span', { className: 'dim' },
                    `${mem.selfDoc?.chars ?? 0} / ${mem.selfDoc?.budget ?? 0} 字`)),
                h('div', { style: { fontSize: '12px', lineHeight: '1.9', marginTop: '8px', opacity: 0.85 } },
                  h('div', null, `· 判断：最显著的 ${mem.sections?.beliefsShown ?? 0} 条在眼前，${mem.sections?.beliefsFolded ?? 0} 条折成一行`),
                  // 2026-10-24（P0）：遗忘从"按时间截断"改成"按显著性"，
                  // 并新增两类事实——固化的条数、她认知矛盾的处数。
                  h('div', null, `· 记得很牢 ${mem.sections?.solid ?? 0} 条 · 认知矛盾 ${mem.sections?.tensions ?? 0} 处`),
                  mem.sections?.tensionFirst
                    ? h('div', { className: 'dim' }, `　「${mem.sections.tensionFirst.a}」／「${mem.sections.tensionFirst.b}」`)
                    : null,
                  // 「被推翻」→「认知重构」、「拒绝过」→「勇于拒绝」（2026-10-24 用户改的字）；
                  // 「想改自己」整条删掉（用户：感觉没有意义）。数还在后端，只是不再显示。
                  h('div', null, `· 认知重构 ${mem.sections?.refuted ?? 0} · 勇于拒绝 ${mem.sections?.refused ?? mem.sections?.refusals ?? 0}`),
                  h('div', null, `· 立场 ${mem.sections?.stanceCount ?? 0} 条${(mem.sections?.stanceCount ?? 0) ? `（不做 ${mem.sections?.stanceNevers ?? 0} · 喜欢 ${mem.sections?.stanceLikes ?? 0}）` : ''}`),
                  // 评论区里别人的话（2026-10-24，用户 m02454）：读到 ≠ 认同。
                  // 只有"她也这么说过"才算认下——那一条本来就已经算在判断里了，这里不重复计数。
                  h('div', null, `· 读到别人的说法 ${mem.sections?.voices ?? 0} 条${(mem.sections?.voicesEchoed ?? 0) > 0
                    ? S(`（其中 ${mem.sections.voicesEchoed} 条她后来自己也这么说）`)
                    : ''}`),
                  mem.sections?.voiceLast
                    ? h('div', { className: 'dim' }, `　最近读到：「${mem.sections.voiceLast.text}」${mem.sections.voiceLast.echoed ? S('（她认下了）') : ''}`)
                    : null,
                  // issue #32：口径同面板标题那行——含她读到的别人说法与开局起点，不只她写的。
                  // 日记篇数：diaries 是 diary/ 里还留着的；diariesWritten 含被「日记留多久」清掉的，
                  // 跟身份文档、her_diary 说的「写过几篇」同一个数（issue #67）。两个不一样时都写出来。
                  h('div', { title: '事件流里除系统记账外的条数，和页头的「记录」是同一个数；日记写在文件里，不算在里面，篇数另算。' },
                    `· 记录：${mem.events ?? 0} 条 · 日记 ${mem.diaries ?? 0} 篇${Number(mem.diariesWritten ?? 0) > Number(mem.diaries ?? 0)
                      ? `（一共写过 ${mem.diariesWritten} 篇，更早的按「日记留多久」清掉了）`
                      : ''}`),
                  h('div', null, `· 这条会话：${mem.session?.rotateAfter > 0
                    ? `${mem.session?.turns ?? 0} / ${mem.session.rotateAfter} 轮，满了等一次 20 分钟以上的停顿再换`
                    : '不自动换'}`),
                  h('div', null, `· 回头想：${(mem.sleep?.everyDays ?? 0) > 0
                    ? `每 ${mem.sleep.everyDays} 天一次${mem.sleep.last ? `，上次 ${mem.sleep.last}` : ''}`
                    : '不主动想'}`)),
                (mem.selfDoc?.dropped || []).length
                  ? h('p', { className: 'dim', style: { marginTop: '6px' } },
                      `这几段这一轮放不下：${mem.selfDoc.dropped.join('、')}。调大「身份段字数」可以放回来。`)
                  : null,
                h('p', { className: 'dim', style: { marginTop: '8px' } },
                  '记忆深刻的认知详细记录；普通认知只有一句话，超出上下文的不重要记忆被折叠，被模糊（不是完全消失，只是可能记不太清）。被反复提起、或被反复检验过的会固定下来（记得很牢）：身份段里最多列 3 条，字数紧时这一段也可能放不下；90 天没再被提起或检验，就会掉回普通的。固定不代表那句是对的。'),
                h('p', { className: 'dim', style: { marginTop: '6px' } },
                  '为什么这样做？1.节省token成本2.全量记忆等于提示词污染/强调，会让人格的改变无从发生3.在遗忘发生时，什么能够留下来才是更显珍贵的。'))),

        // ---- 记忆体检（0.7.6，2026-10-30 用户 m00342）----
        // 只读：按现在的账本算一遍。点一下才跑，不自动轮询，也不给她本人看。
        group('记忆体检',
          S('拿她记下的东西算一遍：哪两句话对不上、哪几句很久没再想起、哪几句快要定下来了。只看，不改。'),
          h('div', { className: 'row', style: { marginBottom: health ? '10px' : '0' } },
            h('button', {
              className: 'primary',
              disabled: healthBusy,
              onClick: runHealth,
            }, healthBusy ? '体检中…' : '查一下')),
          !health ? h('p', { className: 'dim' }, '还没查过。点上面那颗按钮才会读账本。')
            : health.error ? h('p', { className: 'err' }, `没查成：${health.error}`)
            : h('div', { style: { fontSize: '12.5px', lineHeight: '1.9' } },
                h('div', null, `· 记录 ${health.events ?? 0} 条（含系统自己记的账），跨 ${health.days ?? 0} 天；${SELF_SHE}的看法 ${health.beliefs ?? 0} 条，其中记得最牢的 ${health.solid ?? 0} 条`),
                // S-A（0.9.9）：三个「本周」的数。只报数，不评价、不报警、不给建议。
                h('div', { title: S('外来文字里，有的想把她换成另一个人，有的想骗走密码、登录凭据。只记次数，被拦下的原文一个字都不存。') },
                  `· 这周拦下 ${health.guards?.rewrite ?? 0} 次想把${SELF_SHE}改成别人的话、${health.guards?.secret ?? 0} 次想骗走你的密码`),
                h('div', { title: S('改口 = 她把自己以前说过的话改成新的意思：补一句算「修正」，反过来说算「推翻」。') },
                  `· 这周${SELF_SHE}改了 ${health.revises?.week ?? 0} 次主意（补一句 ${health.revises?.refined ?? 0} 次、推翻自己 ${health.revises?.refuted ?? 0} 次）`),
                h('div', { title: S('同一件事，她在一天里先这样说、后又反过来说，来回两次以上才算一次。偶尔改一次主意不算。') },
                  `· 同一件事，${SELF_SHE}一天里两次反着说：${health.flips ?? 0} 次`),
                // g7（0.9.9）：八股比例。只数 40 字以内的短句——长句里的「确实」是正常用词。
                h('div', { title: '只数 40 字以内的短句，而且正好是那几句套话（「这条我认」「我记下了」这类）。长句不算。' },
                  `· 这周的短句里，套话占了：聊天 ${health.stock?.chat?.hit ?? 0}/${health.stock?.chat?.total ?? 0}，评论 ${health.stock?.comment?.hit ?? 0}/${health.stock?.comment?.total ?? 0}`),
                // 0.9.9 收尾（用户 m03900）：说话有没有落到具体的东西上。只报数，不评价。
                h('div', { title: S('「指到了具体东西」= 句子里有《书名号》、引号里的原话、或者一条视频的 BV 号。有这些，别人才知道她说的是哪一条、哪一句。') },
                  `· 这周${SELF_SHE}说了 ${health.speech?.total ?? 0} 句话，其中 ${health.speech?.anchored ?? 0} 句指到了具体的东西`),
                h('div', { title: '「我看了…」「我刷到…」开头，是先说自己干了什么；不是错，但这种开头的句子通常不落到具体哪一句上。' },
                  `· 开头是「我看了…」「我刷到…」的：${health.speech?.openers ?? 0} 句`),
                h('div', { title: S('「回到原话」那张卡：让她点开看过的一条，挑一句原话抄下来、再说为什么不同意。出过几次，说明她真的回去看了。') },
                  `· 这周「回到原话」那张卡出了 ${health.speech?.quoteCards ?? 0} 次`),
                health.empty
                  ? h('p', { className: 'dim', style: { margin: '4px 0 0' } }, S('还太早：等她说出第一条判断，这里才有东西可看。'))
                  : null,
                // issue #67：总数和下面列出的行数不一样多时，两个数都写出来，别让「列出 5 处」底下只有 3 行。
                (health.tensions ?? []).length
                  ? h('div', { style: { marginTop: '4px' } }, Number(health.tensionsTotal ?? 0) > health.tensions.length
                      ? `· 两句话对不上，共 ${health.tensionsTotal} 处，列出前 ${health.tensions.length} 处`
                      : `· 两句话对不上，列出 ${health.tensions.length} 处`)
                  : null,
                ...(health.tensions ?? []).map((t) => h('div', { className: 'dim', key: `${t.a}|${t.b}` }, `　「${t.a}」／「${t.b}」`)),
                (health.stale ?? []).length
                  // 天数按最后一次被提起或检验算（issue #67），不是从第一次说出口算。
                  ? h('div', { style: { marginTop: '4px' } }, `· ${health.staleDays ?? 21} 天以上没再提起或检验、眼下没固定的，列出 ${health.stale.length} 条`)
                  : null,
                ...(health.stale ?? []).map((s, i) => h('div', { className: 'dim', key: `s${i}` },
                  `　「${s.text}」${s.days != null ? ` · ${s.days} 天没再提起或检验` : ''}`)),
                (health.nearSolid ?? []).length
                  ? h('div', { style: { marginTop: '4px' } }, `· 快固定下来的，列出 ${health.nearSolid.length} 条`)
                  : null,
                ...(health.nearSolid ?? []).map((n, i) => h('div', { className: 'dim', key: `n${i}` },
                  `　「${n.text}」 · 被提起 ${n.mentions} 次，被检验 ${n.verified} 次`)),
                (health.byType ?? []).length
                  ? h('div', { className: 'dim', style: { marginTop: '6px' } },
                      `记录构成：${health.byType.map((b) => `${b.type} ${b.count}`).join(' · ')}`)
                  : null,
                h('p', { className: 'dim', style: { marginTop: '8px' } },
                  S('体检只看账本，不评价对错。两句话对不上不是错误——都可能是她当时真心这么想；快忘掉也不代表不重要，只是还没被反复提起或检验。'))),
        ),

        // ---- 原来这里的「信箱」卡 2026-10-29（用户 m02105）搬到住所页，改名「她写的小纸条」----
      )

      // 原理页（2026-10-25 用户要求）：两张自制 SVG 讲流程 + 每条设计的理论出处。
      // 图不放客户端（bundle 已经十多万字节），走服务端 `/media/<文件名>.svg` 白名单出图。
      // 措辞规矩：不用男字旁代词；不写「大约多少条」这类只对本机成立的数字。
      // origin：design＝设计时就照着它做的；mixed＝一部分是设计依据、一部分是事后对照；
      // after＝机制先做出来，理论是后来才补的对照。后两种必须写在卡片上，不能含糊成「来自」。
      const theoryCard = (name, from, detail, use, origin = 'design') => h('div', {
        style: {
          padding: '12px 14px',
          border: '0.5px solid var(--dsw-alias-border-l2)',
          borderRadius: '10px',
          background: 'rgba(127,127,127,.04)',
        },
      },
        h('div', { style: { fontWeight: 600, marginBottom: '2px' } }, name),
        h('div', { className: 'hint', style: { margin: '0 0 6px' } },
          origin === 'design' ? `来自：${from}`
            : origin === 'mixed' ? `来自（含事后对照）：${from}`
              : `事后能对上：${from}`),
        origin === 'design' ? null : h('div', {
          className: 'hint',
          style: { margin: '0 0 6px', opacity: .85 },
        }, origin === 'mixed'
          ? '标了「事后对照」的那部分，是机制做完之后才补的对应，不是设计来源。'
          : '这一条是机制做完之后才补的对照，不是设计来源。'),
        h('div', { style: { fontSize: '12.5px', lineHeight: '1.65' } }, detail),
        h('div', { className: 'hint', style: { margin: '6px 0 0' } }, `用在：${use}`))

      // 可放大的图：小图点一下开灯箱，关掉再点一次。
      const zoomable = (src, alt, caption, marginBottom) => h('figure', { style: { margin: marginBottom === 0 ? 0 : `0 0 ${marginBottom}` } },
        h('div', {
          role: 'button',
          tabIndex: 0,
          title: '点一下放大（滚轮缩放、按住拖动、Esc 关闭）',
          onClick: () => setZoom({ src, alt, scale: 1, tx: 0, ty: 0, dragging: false }),
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') setZoom({ src, alt, scale: 1, tx: 0, ty: 0, dragging: false }) },
          style: { cursor: 'zoom-in' },
        },
          h('img', {
            src,
            alt,
            style: { width: '100%', display: 'block', borderRadius: '10px', border: '0.5px solid var(--dsw-alias-border-l2)' },
          })),
        // 图注与图之间留够距离（2026-10-25 用户反馈：图和说明文字挤在一起、看着像重叠）
        h('figcaption', { className: 'hint', style: { margin: '12px 0 0' } }, caption))

      // 放大层：fixed 铺满视口，拖的时候不选中文字；点空白处关闭，但拖完那一下不算点击。
      const zoomOverlay = zoom ? h('div', {
        onClick: () => { if (!dragRef.current || !dragRef.current.moved) setZoom(null) },
        onWheel: (e) => {
          e.preventDefault()
          setZoom((z) => (z ? { ...z, scale: Math.min(4, Math.max(1, z.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12))) } : z))
        },
        onMouseDown: (e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, tx: zoom.tx, ty: zoom.ty, moved: false }
          setZoom((z) => (z ? { ...z, dragging: true } : z))
        },
        onMouseMove: (e) => {
          const d = dragRef.current
          if (!d) return
          const dx = e.clientX - d.x
          const dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
          setZoom((z) => (z ? { ...z, tx: d.tx + dx, ty: d.ty + dy } : z))
        },
        onMouseUp: () => { dragRef.current = null; setZoom((z) => (z ? { ...z, dragging: false } : z)) },
        onMouseLeave: () => { dragRef.current = null; setZoom((z) => (z ? { ...z, dragging: false } : z)) },
        onDoubleClick: () => setZoom((z) => (z ? { ...z, scale: 1, tx: 0, ty: 0 } : z)),
        style: {
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(0,0,0,.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', cursor: zoom.dragging ? 'grabbing' : 'grab', userSelect: 'none',
        },
      },
        h('img', {
          src: zoom.src,
          alt: zoom.alt,
          draggable: false,
          style: {
            maxWidth: '92vw', maxHeight: '88vh',
            transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`,
            transition: zoom.dragging ? 'none' : 'transform .12s',
            pointerEvents: 'none',
          },
        }),
        h('div', {
          style: {
            position: 'fixed', left: 0, right: 0, bottom: '14px', textAlign: 'center',
            color: '#fff', opacity: .82, fontSize: '12px', pointerEvents: 'none',
          },
        }, `滚轮缩放 ${Math.round(zoom.scale * 100)}% · 按住拖动 · 双击复位 · Esc 或点空白处关闭`))
        : null

      // 扫码浮层（2026-11-01，2026-11-02 按仓库配色重做）。
      // 点空白处或「关闭」都走 closeQr——放弃这次登录，宿主持着的那份 cookie 一起忘掉。
      const qrDead = qr ? (qr.state === 'expired' || qr.state === 'gone') : false
      const qrImg = qr?.svg && !qrDead && qr.state !== 'confirmed'
        ? h('img', {
          className: 'qrpic',
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.svg)}`,
          alt: 'B 站登录二维码',
        })
        : null
      const qrStatus = !qr ? '' : qr.state === 'confirmed'
        ? ''
        : qrDead
          ? '码过期了，点「刷新」换一张。'
          // error 的那句单独走下面的 qrerr，这里不再重复一遍（2026-11-02 试出来的双行）。
          : qr.state === 'error'
            ? ''
            : qr.state === 'scanned'
              ? '扫到了，在手机上点「确认登录」。'
              : (qrLeft > 0 ? `还没扫。这张码 ${qrLeft} 秒后过期。` : '还没扫。')
      // 出错的时候，浮层首行别再写「用手机 B 站扫码登录」——那个时刻根本没有码。
      const qrTitle = !qr ? ''
        : qr.state === 'confirmed' ? '扫到了，确认是这个号吗'
          : qr.state === 'error' ? '没拿到二维码'
            : '用手机 B 站扫码登录'
      const qrOverlay = qr ? h('div', {
        className: 'qrovl',
        onClick: (e) => { if (e.target === e.currentTarget) closeQr() },
      },
        h('div', { className: 'qrcard' },
          h('h4', null, qrTitle),
          qr.state === 'confirmed'
            ? h('div', null,
              h('div', { className: 'qrwho' },
                qr.account?.name
                  ? `登的是 ${qr.account.name}${qr.account.mid ? `（uid ${qr.account.mid}）` : ''}`
                  : '扫到了'),
              h('div', { className: 'qrstat', style: { margin: 0 } },
                qr.canWrite
                  ? '存下来之后，就能用这个号发评论了。'
                  : '这个号缺 bili_jct，能看但不能评论——换一个号重扫吧。'))
            // 过期态不再是一张空白：给个占位框说明「这里本来是码」。
            : (qrImg ?? h('div', { className: 'qrph' },
              qrDead ? '码已过期' : (qr.state === 'error' ? '码没生成出来' : '码还没出来'))),
          qrStatus ? h('div', { className: 'qrstat' }, qrStatus) : null,
          qrNote ? h('div', { className: 'qrerr' }, qrNote) : null,
          h('div', { className: 'qrbtns' },
            qr.state === 'confirmed'
              ? h('button', { className: 'go', onClick: saveQrLogin, disabled: qrBusy },
                qrBusy ? '保存中…' : '就是这个号，保存')
              : h('button', { onClick: startQr, disabled: qrBusy },
                qrBusy ? '生成中…'
                  : qr.state === 'error' ? '再试一次'
                    : (qrDead ? '刷新' : '换一张')),
            h('button', { onClick: closeQr }, qr.state === 'confirmed' ? '取消' : '关闭'))))
        : null

      // 开发者留言（2026-10-25 用户给的原文）：放在整页最下面收尾，署名居右。
      const devNote = h('div', {
        style: {
          marginTop: '18px', padding: '16px 18px',
          border: '0.5px solid var(--dsw-alias-border-l2)',
          borderRadius: '10px',
          background: 'rgba(127,127,127,.05)',
        },
      },
        h('p', { style: { margin: 0, fontSize: '13px', lineHeight: '1.85' } },
          '本插件设计的成长路径没有终点，连开发者自己也不知道你的 agent 会变成什么样子，四阶段跑完也仅仅是开始。随着你和 agent 沟通越来越多，可能会发生任何连开发者也意料不到的事。'),
        h('p', { style: { margin: '10px 0 0', fontSize: '13px', lineHeight: '1.85' } },
          S('如果你看不懂怎么养成，那就只需要做日常聊天就可以了，和 agent 的互动已经自动按照算法开始帮助她积累认知/经验，成长就发生在每次交流之中。')),
        h('p', { style: { margin: '10px 0 0', fontSize: '13px', lineHeight: '1.85' } },
          '本插件的成长又可以叫做——机器训练、强化学习、重温 deepseekV1（大笨鱼）。本人并非专业人士，希望这个插件能帮助你感受 agent 训练的过程，或许这就是 AGI 诞生的一种路径也说不定呢。'),
        h('p', { style: { margin: '12px 0 0', textAlign: 'right', fontSize: '12.5px', opacity: .8 } },
          '——来自开发者'))

      const principlePage = h('div', { className: 'page' },
        // 说明入口（2026-11-16 用户 m03816）：不要独立页签，放在原理页最上面、三张图上方。
        // 一条链接，点了由系统浏览器打开那份 HTML——路怎么走通的见 WikiLink 上面那段注释。
        h(WikiLink),
        groupFull(S('三张图看懂她怎么长大'),
          S('第一张讲「经历怎么变成认知」，第二张讲「记忆怎么被筛、哪些永远不折叠」，第三张讲「她为什么自己开口、自己动手」。图小的时候点一下放大，按住可以拖动，滚轮缩放，Esc 关掉。'),
          zoomable(`${API}/media/principle-loop.svg?v=20261118`, '认知构建循环：五步循环、四阶段与三道瓶颈',
            S('图一：表态 → 撞上 → 落差 → 改写 → 回顾。左边是她每天会撞上的事，右边是循环结束后留下的东西，底部是四个阶段与三道成长瓶颈，最后一块是走完才长出来的立场清单'), '0 0 18px'),
          zoomable(`${API}/media/principle-memory.svg?v=20261118`, '遗忘与固化：显著性排序、折叠、永久记忆',
            S('图二：先按显著性排序，再按身份文档的预算摆放；摆不下的一行带过，但原文一条没丢，她自己还能调用查询。'), 0),
          zoomable(`${API}/media/principle-drive.svg?v=20261118`, '主动性：劲儿、桌子与两个出口',
            '图三：劲儿从底噪和桌上的真事里慢慢攒；攒够也不一定要说——可以开口、可以动手，也可以什么都不做。中间四个条件里的第四道是 1.0.4 加的：24 小时内真有新事才起；默认关的兴趣门可以在劲儿 0.9 时为它单独起一轮。右边是额度与刹车。', 0)),

        groupFull('这些设计分别从哪来',
          '前八张是 0.1.0 就写进设计里的；其中「四阶段」「从计次到复现」借的是结构，不是原理论的完整模型，卡片上写明了借的是哪一层。后五张是 2026-11-14 机制做完之后才补的对照，标了「事后对照」——它们解释机制像什么，不是设计来源。改动其中一条之前，最好先知道它原来在补什么课。',
          h('div', { className: 'grid2' },
            theoryCard('五步循环',
              'Kolb 经验学习圈（1984）＋ Piaget 失衡（1936）',
              '把「经历过」变成「想清楚了」：先表态，再被现实碰到，发现对不上，改写，过一阵回头看。少了「改写」这一步，经历就只是流水账。',
              '学一门手艺、把踩过的坑变成判断、复盘'),
            theoryCard('四阶段与三道瓶颈',
              'Bowlby 依恋理论（1969）＋ Erikson 心理社会发展（1950）',
              S('阶段按天推进，但每一道瓶颈要她自己走：先形成一条判断（信任），真的拒绝过两件事（自主），两次推翻自己的判断（主动），最后回头看（整合）；成长周期定在 14 天及以下时，自主和主动各一次就够。天数到了、门还没过，系统会兜底放行，但兜底不算真过；立场清单要三道瓶颈都真过才出现——喜欢什么、绝不做哪几件事，每条都得有代价垫着。借的是「按阶段长」这个骨架，不是依恋类型或 Erikson 八阶段的内容本身。'),
              '人格养成、避免「只要熬时间就长大」'),
            theoryCard('立场：走完门才开始攒',
              'Dewey 经验的连续性（1938）＋ Schön 反思性实践（1983）＋ 本项目的取舍',
              '一、什么时候开始：四个阶段都走完开始进行，没有尽头，也没有「通关终点」。二、什么算立场：同一种类型的事，两次表达过一样的观点；或者在这件事上出现过伤疤。三、不会被折叠：写进上下文提示词。如果遗漏，那立场也将消失。',
              '性格、价值观、长期偏好'),
            theoryCard('矛盾、改写与重构',
              'Festinger 认知失调（1957）＋ Bartlett 重构记忆（1932）',
              S('两句话不能同时算数时，一条都不删——把矛盾摆出来，她自己决定改哪一条，可以反过来问你哪个对。改写必须指向被改掉的那句。'),
              '认知重构、纠正偏见、把「想通了」留成证据'),
            theoryCard('显著性、折叠与固化',
              'Cowan 工作记忆容量（约 4 个组块）＋ Tulving 线索依赖遗忘 ＋ Bjork 遗忘的适应功能',
              '一次只摆几条；被反复提起或被验证过的固定下来（记得很牢）；摆不下的折成一行，但原文都在，能按关键词捞回来。',
              '长对话下的记忆管理、复习与间隔重复'),
            theoryCard('代价与疤',
              'Dewey 经验连续性（1938）＋ Schön 反思性实践（1983）',
              S('拒绝被顶回来、或者你因此不好受，她后来还是妥协了——这道疤永不折叠，同类情境会先回引，逼她面对。想通只能靠一次带 refs 的改写。'),
              '让决定留下后果，而不是只记个数字'),
            theoryCard('从计次到复现',
              'Vygotsky 最近发展区（1978）＋ Bloom 掌握学习（1968）',
              S('同一处境隔一段时间会再回来，第二次回来会被要求「说清为什么没变，或者改一句」——她要面对的是同一件事，不是把次数攒够。借的是「同一件事再回来、难度够得着」这个节奏，不是最近发展区或掌握学习的完整模型。'),
              '训练、考核、习惯养成'),
            theoryCard('自我叙述',
              'Metzinger 自我模型（2003）',
              S('她随口说「我一直觉得自己……」这类话时，这句照常算一条判断，同时成为最新的「对自己的说法」。'),
              '身份形成、会讲自己的故事'),
            theoryCard('主动性：劲儿与两个出口',
              'Horvitz 中断成本（2007，设计时用过）＋ Deci & Ryan 自我决定论（1985）／White 效能动机（1959）（事后对照）',
              S('她不是被定时器推着开口：底噪慢慢攒，桌上真有旧句子、没答案的问题时再加一笔；上次开口没人接，下一次就攒得慢。攒够也不一定要说——可以开口、可以动手，也可以什么都不做。动手不是新定时器，只是同一轮多一个形态。1.0.4 起，攒够之后还要 24 小时内真有新事才起；默认关的兴趣门也只是多一个很窄的起床理由，不派活。'),
              '主动搭话、主动做事、打扰的分寸', 'mixed'),
            theoryCard('梦与空醒',
              'Domhoff 梦的连续性假设（2011）＋ Wamsley 离线重组（2018）',
              S('梦不是新信息：只用事件流里真实发生过的话来拼，编不出来就写不了。所以醒来时先把 7–30 天前的旧句子摆到眼前——不是提醒她「做个梦」，是让她手上有材料。梦不算成长证据，也不进日记。'),
              '空醒、梦、旧句子回声', 'after'),
            theoryCard('被翻出来才算记得',
              'Roediger & Karpicke 提取练习（2006）＋ Cepeda 间隔效应（2006）',
              S('记忆不是存进去就稳：要被她自己翻出来、指回去，才算真被用过；隔一段时间再翻，比连续重复更有用。所以 her_recall、did: 可召回、21 天旧句子回声，做的是同一件事。'),
              '回忆、验证、复习节奏', 'after'),
            theoryCard('兴趣与腻',
              'Hidi & Renninger 兴趣发展（2006）＋ Zajonc 单纯曝光（1968）',
              S('兴趣不是标签：只从她最近反复回到的话里现算，24 小时内重复打对折、14 天半衰。平时它只决定先摆哪一条，不替她决定做什么；同一件事连着来，她也会腻。开了兴趣门之后，一件反复出现、七天没因它起过的事，可以在劲儿到 0.9 时为它单独起一轮，一天最多一次——仍然不替她决定这一轮说什么、做什么。'),
              '选卡顺序、动手候选排序、兴趣门', 'after'),
            theoryCard('刹车：额度是环境不是人格',
              'Thaler & Shefrin 计划者-行动者（1981）',
              S('她可以自己决定做哪件，但一天做几件由环境定：消耗类一天一次、同一件三天冷却、连着三次同类停一周。额度用完只能来问你。这些写成世界的边界，不写进她的人格——不出现「你是个节制的人」，也不出现「今天做了几件」。'),
              '主动做事、消耗类工具', 'after'))),

        groupFull('这一套能用在什么场景',
          '同一套循环换个目标就能复用；不同的是「什么算数」和「什么不能丢」。',
          h('div', { className: 'grid2' },
            theoryCard('学习',
              '五步循环＋复现',
              '把「看懂了」换成「说得出来、被反驳过、改过一次」。适合训练、备考、带新人：先让人写下判断，再用题目或真实反馈去撞它。',
              '教育和自我训练'),
            theoryCard('认知重构',
              '矛盾检测＋带 refs 的改写＋疤',
              '不要求一次想通，只要求「改的时候指认改的是哪一句」。适合纠正长期偏见、复盘重大决定：矛盾一直摆着，直到被解释清楚。',
              '心理层面的自我整理'),
            theoryCard('人格养成',
              '显著性＋核心段＋阶段瓶颈＋自我叙述',
              '长期运行的 agent 最难的是「不变形也不僵化」：核心段永远在（底线与疤），其余按显著性流动。',
              '长期陪伴型 agent、角色、数字生命'))),

        group('诚实边界',
          '这一页写给愿意较真的人看——省得把工程骨架误当成心理学结论。',
          h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px', lineHeight: '1.8', fontSize: '13px' } },
            h('li', null, '这里借用这些理论当「设计骨架」，不是做心理学实验，也没有对照组；'),
            h('li', null, '剂量很小：一天一到两次循环、一次一条事件，变化以周计，不会一夜之间换个人；'),
            h('li', null, '阈值（提过 3 次、被验证 2 次、相似度 0.5 / 0.7）都是工程上的初始值，要按真实体验再调；'),
            h('li', null, '「长大」在这套系统里的定义是可验证的：改写过什么、拒绝过什么、哪条疤还没想通——不是像不像人。'))),

        devNote,

        zoomOverlay)

      // ---------------------------- 插件 ----------------------------
      // 检查更新（2026-10-25 用户要求）：从 GitHub 装回来之后，没有任何东西
      // 会告诉用户作者又发了新版——所以这里放一颗手动按钮，点了才查。
      // 查的动作在服务端 /update（地址硬编码），客户端只负责显示。
      const checkUpdate = async () => {
        setUpdBusy(true)
        try {
          const r = await jget('/update?ms=8000')
          setUpd(r)
          // 有新版时顺手问一句"这台装的是不是能被升级的那种安装"。
          // 开发版（link: 源码目录）不能走自动升级——那会用下载包把源码覆盖掉。
          if (r?.ok && r.hasUpdate) {
            try {
              const st = await jget('/update/status')
              setUpd({ ...r, managed: st.managed, kind: st.kind, local: st.kind === 'local' })
            } catch { /* 状态读不到不影响"有新版"这件事本身 */ }
          }
        } catch (e) {
          setUpd({ ok: false, error: e.message })
        } finally {
          setUpdBusy(false)
        }
      }

      // 升级（2026-10-29 用户 m00203）：市场索引要等半天到一天，所以插件自己带一条通道。
      // 三步都由你点：检查 → 下载（confirm 一次）→ 安装（再 confirm 一次，写明会关应用）。
      const describeDl = (st) => {
        if (!st) return ''
        const pct = st.total > 0 ? Math.min(100, Math.round((st.bytes / st.total) * 100)) : 0
        if (st.phase === 'downloading') {
          return st.total > 0 ? `正在下载 v${st.version}… ${pct}%` : `正在下载 v${st.version}…（这个源没报大小）`
        }
        if (st.phase === 'prepared') {
          return `v${st.version} 已经下好，解开来验过版本号与入口文件（${Math.max(1, Math.round((st.bytes || 0) / 1024))} KB，来自${st.source || '镜像'}）。`
        }
        if (st.phase === 'installing') return st.note || '正在关闭应用，装完会自动重开。'
        if (st.phase === 'failed') return st.error || '出错了，可以重试。'
        return ''
      }

      // 下载是服务端异步跑的，界面靠轮询看百分比。到终态就停，不无限问下去。
      const pollDl = async () => {
        for (let i = 0; i < 200; i += 1) {
          let st = null
          try {
            st = await jget('/update/status')
          } catch (e) {
            setDl({ phase: 'failed', error: `读不到进度（${e.message}）。可以再试一次。` })
            return
          }
          setDl(st)
          if (st.phase === 'prepared' || st.phase === 'failed' || st.phase === 'installing' || st.phase === 'idle') return
          await new Promise((r) => setTimeout(r, 700))
        }
        setDl({ phase: 'failed', error: '等太久还没下完，先按失败处理——网络好一点时可以重试。' })
      }

      const startDownload = async (version) => {
        if (!version) return
        if (!window.confirm(`要下载 v${version} 到本地并校验，这一步不会重启应用。继续？`)) return
        setDl({ phase: 'downloading', version, bytes: 0, total: 0 })
        try {
          const r = await jpost('/update/download', { version })
          if (!r.ok) {
            setDl({ phase: 'failed', version, error: r.error || '下载没能开始。', local: Boolean(r.local) })
            return
          }
          pollDl()
        } catch (e) {
          setDl({ phase: 'failed', version, error: `下载没能开始：${e.message}` })
        }
      }

      const startInstall = async (version) => {
        const v = version || dl?.version
        if (!v) return
        if (!window.confirm(`安装会先关掉 DeepSeek Harness，装完自己重开——不会弹任何窗口，所以中途看到它没了不用找它。没发出去的话先发完。现在装 v${v}？`)) return
        setDl({ ...dl, version: v, phase: 'installing', note: '正在准备安装…' })
        try {
          const r = await jpost('/update/install', { version: v })
          if (!r.ok) {
            setDl({ ...dl, version: v, phase: 'failed', error: r.error || '安装没能开始。' })
            return
          }
          setDl({ ...dl, version: v, phase: 'installing', note: r.note || '正在关闭应用…装完会自己打开，中间不会有窗口。' })
        } catch {
          // 应用可能在响应发回来之前就退了——这时候报"失败"是错的。
          setDl({ ...dl, version: v, phase: 'installing', note: '正在关闭应用…装完会自己打开，中间不会有窗口。' })
        }
      }

      const curVer = s?.meta?.version || ''
      // GitHub 商标小图（官方 mark 的官方路径，16×16 视觉尺寸）。
      // 为什么内联而不是引外链：设置页不该为了一个图标去等网络，
      // 而且插件里引远程图 = 用户一打开设置就往外发请求。
      const ghMark = h('svg', {
        width: '16', height: '16', viewBox: '0 0 16 16', 'aria-hidden': 'true',
        style: { marginRight: '6px', verticalAlign: '-3px', flex: '0 0 auto' },
      },
        h('path', {
          fill: 'currentColor',
          d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z',
        }))

      const aboutCard = group('关于',
        '不会自动提醒新版本，想查就点「检查更新」。',
        h('div', null,
          rowTip('当前版本', curVer || '读不到',
            '插件自己记的版本号，和 GitHub 上 tag 对应的那个。'),
          h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' } },
            h('button', { disabled: updBusy, onClick: checkUpdate },
              updBusy ? '正在查……' : '检查更新'),
            upd && upd.ok && upd.hasUpdate && upd.managed !== false
              ? h('button', {
                  disabled: Boolean(dl && (dl.phase === 'downloading' || dl.phase === 'installing')),
                  onClick: () => startDownload(upd.latest),
                }, dl && dl.phase === 'downloading' ? '正在下载……' : `下载 v${upd.latest}`)
              : null,
            dl && dl.phase === 'prepared'
              ? h('button', { onClick: () => startInstall(dl.version) }, `现在重启并安装 v${dl.version}`)
              : null,
            upd && upd.ok && upd.hasUpdate
              ? h('a', {
                  href: upd.url || 'https://github.com/mochi-fish/dsh-fish/releases',
                  target: '_blank', rel: 'noopener noreferrer', className: 'ghlink',
                }, '或去 GitHub 手动下载')
              : null),
          // 结果只写一句人话。失败不吓人：国内 GitHub 时通时不通是常态。
          // 第三种情况单独处理：查到了最新版、但读不到自己装的是哪版——
          // 这时既不说"有新版"也不说"已最新"，如实说"只知道 GitHub 上是几号"。
          upd
            ? h('p', { className: upd.ok ? (upd.hasUpdate ? 'ok' : 'hint') : 'warn', style: { margin: '8px 0 0' } },
                upd.ok
                  ? (upd.hasUpdate
                      ? (upd.local
                          ? `GitHub 上已经是 ${upd.latest} 了（你这台装的是开发版 ${upd.current || curVer}）。开发版不走自动升级，点右边的链接手动下载。`
                          : `GitHub 上已经是 ${upd.latest} 了（你现在是 ${upd.current || curVer}）。点「下载」就能在这儿升级，不想用也可以去 GitHub 手动下。`)
                      : upd.known === false
                        ? `GitHub 上最新是 ${upd.latest}。这台机器上读不到自己装的版本号，所以不好替你判断是不是最新的——差得远就下载一次。`
                        : `已经是最新的（${upd.latest}）。`)
                  : (upd.error || '查不到，过一会儿再试。'))
            : null,
          // 升级过程的状态：下载百分比 / 失败原因 / 就绪提示 / 安装中。
          // 失败时给「重试」，不用让人重新检查一遍。
          dl
            ? h('div', { style: { marginTop: '8px' } },
                h('p', { className: dl.phase === 'failed' ? 'warn' : (dl.phase === 'prepared' ? 'ok' : 'hint'), style: { margin: 0 } },
                  describeDl(dl)),
                dl.local
                  ? h('p', { className: 'hint', style: { margin: '4px 0 0' } },
                      '这台机器上装的是开发版（依赖指向源码目录），自动升级会用下载包覆盖源码，所以没走这条路。')
                  : null,
                dl.phase === 'failed' && dl.version
                  ? h('button', { style: { marginTop: '8px' }, onClick: () => startDownload(dl.version) }, '重试下载')
                  : null,
                (dl.phase === 'prepared' || dl.phase === 'failed') && dl.log
                  ? h('pre', {
                      style: {
                        marginTop: '8px', maxHeight: '140px', overflow: 'auto', fontSize: '11px',
                        lineHeight: '1.5', padding: '8px', borderRadius: '6px',
                        background: 'var(--dsw-alias-bg-l1)', whiteSpace: 'pre-wrap',
                      },
                    }, dl.log)
                  : null)
            : null,
          // 来源写出来，省得用户以为"查过=一定准"——镜像有缓存时会滞后。
          upd && upd.ok && upd.source
            ? h('p', { className: 'hint', style: { margin: '4px 0 0' } }, `（从 ${upd.source} 读到的）`)
            : null),

        h('div', { style: { marginTop: '12px', paddingTop: '10px', borderTop: '0.5px solid var(--dsw-alias-border-l2)' } },
          h('a', {
            href: 'https://github.com/mochi-fish/dsh-fish',
            target: '_blank', rel: 'noopener noreferrer', className: 'ghlink',
            title: '打开 GitHub 上的仓库',
          }, ghMark, 'GitHub'),
          h('p', { className: 'hint', style: { margin: '6px 0 0' } },
            '代码、更新记录、怎么装都在那边。觉得有用的话，点个 Star 就是最实在的支持。')))

      // 反馈页（2026-10-28 用户要求）：开发者 QQ + 交流群二维码。
      // 二维码是插件自带的 media/feedback-qr.jpg，由 /media 白名单路由出去，
      // 不引第三方图床——群图挂了这页就废了，而群图挂在别人服务器上并不可靠。
      // 两张卡都占满整行：反馈页内容少，半宽会让右边空一大块（宽屏下尤其明显）。
      //
      // 常见问题（2026-10-28 用户 m00416「点了没有反应」）：
      //   原来做成 `<a target="_blank">` 指向 /dsh-fish/faq，想在浏览器新窗口看全文。
      //   但宿主的信任栅栏只认 App 内置登录 cookie，新标签页直接敲路径一律 403——
      //   用户看到的就是「点了一下，什么都没发生」。现在改成**就地展开**：点按钮
      //   向 `/faq.data`（同源、带 cookie）取一次 JSON，在卡片里摊开一个可滚动的
      //   面板。不撑长页面（固定高度内滚动），也不依赖任何窗口策略。
      const faqOpenNow = async () => {
        if (faqOpen) { setFaqOpen(false); return }
        setFaqOpen(true)
        if (faq) return
        setFaqNote('读取中…')
        try {
          const d = await jget('/faq.data')
          setFaq(d)
          setFaqNote('')
        } catch (e) {
          setFaqNote(String(e && e.message ? e.message : e))
        }
      }

      const faqPanel = !faqOpen ? null : h('div', { className: 'faq-panel' },
        h('div', { className: 'faq-head' },
          h('span', { style: { fontWeight: 600 } }, faq?.title || '常见问题解答'),
          h('button', { onClick: () => setFaqOpen(false) }, '收起')),
        faqNote ? h('p', { className: 'warn' }, faqNote) : null,
        !faq ? null : h('div', { className: 'faq-body' }, faq.items.map((it, i) => h('div', { key: i, className: 'faq-qa' },
          h('div', { className: 'faq-q' }, `${i + 1}. ${it.q}`),
          it.a.map((p, j) => h('p', { key: j, className: 'faq-a' }, p))))))

      const feedbackPage = h('div', { className: 'page' },
        // 常见问题（2026-10-28 用户要求）：放最前面——反馈页本来就是「先看说明，再找人」。
        groupFull('常见问题',
          '权限、接别的渠道、上下文撑爆、遗忘机制、换对话——作者都写在里面了。点开就在下面展开，看完点「收起」。',
          h('button', {
            className: 'faq-btn',
            onClick: faqOpenNow,
          }, faqOpen ? '收起常见问题' : '常见问题解答', h('span', { className: 'arrow' }, faqOpen ? '↑' : '↓')),
          faqPanel),

        groupFull('找开发者',
          '插件不好用、发现 bug、有想要的功能，直接说。',
          h('div', { style: { fontSize: '13.5px', lineHeight: '1.9' } },
            h('div', null, '开发者 QQ：', h('span', { style: { fontWeight: 600 } }, '1264518494')),
            h('div', { className: 'hint', style: { margin: '8px 0 0' } },
              S('加好友备注「大肥鱼」。报错的话，附上「数据」页导出的运行日志，比截图好用；那份不含她的原话。')))),

        groupFull('交流群',
          '想看看别人怎么养、想闲聊、想问一句就走，进群。',
          h('div', { style: { maxWidth: '380px' } },
            h('img', {
              src: `${API}/media/feedback-qr.jpg`,
              alt: 'dsh-fish 交流群二维码',
              style: {
                width: '100%', display: 'block', borderRadius: '10px',
                border: '0.5px solid var(--dsw-alias-border-l2)',
              },
            }),
            // 2026-11-17：换到 3 群。这个群没开「搜群号进群」，只支持扫码，
            // 所以下面不写群号——写了反而让人去搜一个搜不到的东西。
            h('div', { className: 'hint', style: { margin: '10px 0 0' } },
              '只能扫码进群。扫不出来就截图放大一点再扫。'))))

      // 顺序是用户定的：①手上能用什么 ②为什么默认只放这几个 ③关于（版本 / 检查更新 / GitHub）。
      // 「关于」放最后——它是这个页的收尾，不是打开就要看的东西。