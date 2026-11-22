      // ---------------------------- 住所 ----------------------------
      // 这一页回答的是「东西都在哪」，不是「怎么调她」。
      // 请求事件：在住所页补答（弹卡超时之后仍能答；答过的不再改）。
      // 2026-11-21（用户 m03230）：以前只按位置传 verdict，第三个选项（「我来改」这种）
      // 一律落成 later，原文又不传，账上就只剩一句「以后再说」，事后没法查。
      // 现在把点中的那句原文一起当 reason 传上去；「以后再说」那颗仍然只有 later、不带 reason。
      async function answerAsk(id, verdict, reason = '') {
        try {
          const r = await jpost('/ask', { action: 'answer', askId: id, verdict, reason: String(reason || '') })
          setAsks(await jget('/ask'))
          if (r?.ok) setAskMsg('答好了。')
          else setAskMsg(String(r?.why || '没答上。'))
        } catch (e) {
          setAskMsg(`没答上：${e.message}`)
          // 多半是别的地方先答了：把列表刷新一下，别还留着这张卡
          jget('/ask').then(setAsks).catch(() => {})
        }
      }

      // 「这事已经过去了」（2026-11-20）：只加一条 ask-done 记账，不改当时的答复。
      // 那张卡问的东西后来自己到手了、或者已经不需要了，用这一颗给它一个后来的结局。
      // 用户 m00849 定的：先摆一个确认框说清这一笔记什么、记完之后她会怎样，点确定才写。
      async function doneAsk(id) {
        try {
          const r = await jpost('/ask', { action: 'done', askId: id })
          setAsks(await jget('/ask'))
          if (r?.ok) setAskMsg('记成过去了。这张卡不会再挂着。')
          else setAskMsg(String(r?.why || '没记上。'))
        } catch (e) {
          setAskMsg(`没记上：${e.message}`)
          jget('/ask').then(setAsks).catch(() => {})
        }
      }

      const homePage = h('div', { className: 'page' },
        group('大肥鱼住在哪',
          S('她在侧栏里的工作区和会话。'),
          !home ? h('p', { className: 'empty' }, '读取中…')
            : h('div', null,
                rowTip('工作区', home.workspace?.ok ? '已建好' : '没建起来',
                  '插件建的那个工作区，默认叫「大肥鱼的家」。'),
                rowTip('会话', home.session?.ok ? '「跟大肥鱼说话」那条' : '没建起来，下面有备用框',
                  S('你和她说话的那条；聊满轮数自动换新，旧的留档。')),
                rowTip('身份文件', home.selfDoc?.exists ? `${home.selfDoc.bytes} 字节` : '还没有',
                  S('她每轮读的身份文本在磁盘上的副本，不进对话记录。')),
                home.session?.ok ? null : group('备用说话入口',
                  S('她的会话还没建起来时，用这里跟她说话。'),
                  h('div', { className: 'form' },
                    h('textarea', {
                      value: sayText,
                      placeholder: '说点什么。大肥鱼会按自己的方式回——也可能不回。',
                      onChange: (e) => setSayText(e.target.value),
                      onKeyDown: (e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() }
                      },
                    }),
                    h('div', { className: 'row' },
                      h('button', { onClick: send, disabled: busy === 'say' || !sayText.trim() },
                        busy === 'say' ? '等大肥鱼想…' : '说给大肥鱼'),
                      h('span', { className: 'dim' }, 'Ctrl+Enter 发送。'))),
                  said.length
                    ? h('div', { style: { marginTop: '10px' } },
                        h('p', { className: 'dim' }, '大肥鱼刚刚说的'),
                        ...said.map((x) => h('div', { className: 'said', key: x.id }, esc(x.text))))
                    : null))),

        group(S('她的请求'),
          S('她有事想征求你同意的时候，会弹一张卡。这里能看到问过什么、你怎么答的；没答的可以在这里补答；放了 24 小时没人答的会自动记成「以后再说」，之后就补答不了。一天最多一次，一周最多三次。'),
          !asks ? h('p', { className: 'empty' }, '读取中…')
            : (() => {
                const pend = Array.isArray(asks.pending) ? asks.pending : []
                const items = (Array.isArray(asks.items) ? asks.items : []).slice().reverse()
                const wordOf = (a) => {
                  if (a.done) return '已经过去'
                  if (a.pending) return '还没答'
                  if (a.verdict === 'approve') return '可以'
                  if (a.verdict === 'reject') return '这次不行'
                  if (a.verdict === 'later') return a.reason ? String(a.reason) : '以后再说'
                  return ''
                }
                return h('div', null,
                  askMsg ? h('p', { className: 'hint' }, askMsg) : null,
                  pend.length
                    ? h('div', null,
                        h('p', { className: 'dim' }, '还没答的'),
                        ...pend.map((a) => h('div', { className: 'said', key: a.id },
                          esc(a.question),
                          h('div', { className: 'row', style: { marginTop: '6px' } },
                            ...(a.options?.length ? a.options : ['可以', '这次不行']).map((label, i) =>
                              h('button', {
                                key: `${a.id}-${i}`,
                                onClick: () => answerAsk(
                                  a.id,
                                  i === 0 ? 'approve' : i === 1 ? 'reject' : 'later',
                                  i >= 2 ? String(label) : '',
                                ),
                              }, label)),
                            h('button', { className: 'ghost', onClick: () => answerAsk(a.id, 'later') }, '以后再说')))))
                    : h('p', { className: 'empty' }, '现在没有等你答的。'),
                  items.length
                    ? h('div', { style: { marginTop: '12px' } },
                        h('p', { className: 'dim' }, '最近的'),
                        ...items.slice(0, 8).map((a) => h('div', { className: 'said', key: a.id },
                          esc(a.question),
                          '　',
                          h('span', { className: 'tag' }, wordOf(a)),
                          a.done ? null : (askDoneAsk === a.id
                            // 二次确认（2026-11-20 用户 m00849）。这一笔写了撤不回来，
                            // 所以先把「它记的是什么」和「记下去之后她会怎样」念一遍，再让人按确定。
                            ? h('div', {
                                style: {
                                  marginTop: '8px', padding: '8px 10px', borderRadius: '6px',
                                  border: '1px solid #d8c9a8', background: 'rgba(0,0,0,0.02)',
                                },
                              },
                                h('div', { className: 'dim' },
                                  S('这一笔记的是「后来的结局」：她当时问的那件事，你这边已经真的替她办好了，或者已经不需要了。')),
                                h('div', { className: 'dim', style: { marginTop: '4px' } },
                                  S('记下去以后，她那边不再挂着这张卡，也不会再念「你问过…（以后再说）」；'
                                    + '当时那天的答复不改，这一笔也撤不回来。')),
                                h('div', { className: 'dim', style: { marginTop: '4px' } },
                                  S('确定这件事已经为她解决了吗？')),
                                h('div', { className: 'row', style: { marginTop: '6px' } },
                                  h('button', {
                                    onClick: () => { setAskDoneAsk(''); doneAsk(a.id) },
                                  }, '确定，这事已经过去了'),
                                  h('button', {
                                    className: 'ghost',
                                    onClick: () => setAskDoneAsk(''),
                                  }, '算了')))
                            : h('button', {
                                className: 'ghost',
                                style: { marginLeft: '8px' },
                                onClick: () => { setAskDoneAsk(a.id); setAskMsg('') },
                              }, '这事已经过去了')))))
                    : null)
              })()),

        group('日记',
          '在「成长」页打开「让我看日记」后显示，一天一页。',
          !diary ? h('p', { className: 'empty' }, '读取中…')
            : !diary.enabled ? h('p', { className: 'empty' }, '没在写日记。')
            : !diary.visible ? h('p', { className: 'empty' },
                `已写 ${(diary.lockedDates || []).length} 天，但设置里是不给你看。`)
            : !diaryDates.length ? h('p', { className: 'empty' }, '还没写')
            : h('div', null,
                diaryDates.length > 1
                  ? h('div', { className: 'row pager' },
                      h('button', {
                        className: 'ghost',
                        disabled: diaryIdx >= diaryDates.length - 1,
                        onClick: () => setDiaryDay(diaryIdx + 1),
                      }, '← 更早'),
                      h('span', { className: 'dim' }, `${diaryCur}　${diaryIdx + 1} / ${diaryDates.length}`),
                      h('button', {
                        className: 'ghost',
                        disabled: diaryIdx <= 0,
                        onClick: () => setDiaryDay(diaryIdx - 1),
                      }, '更晚 →'))
                  : h('p', { className: 'dim' }, diaryCur),
                diaryCache.current[diaryCur] === undefined
                  ? h('p', { className: 'empty' }, '读取中…')
                  : h('pre', null, esc(diaryCache.current[diaryCur])))),

        // ---- 她的东西（1.0.4，2026-11-16；2026-11-16 用户要求从状态页搬到住所页，放在日记下面）----
        // 和日记、梦、小纸条归在一起：都是「她在家里留下的、可以翻看的东西」，
        // 不是设置项，也不是可以裁决的规则。只读——没有新建、没有删除。
        worksCard,
        workView,

        // ---- 梦（2026-10-30 m02837；0.9.0 起对所有人显示；2026-11-05 用户 m03247 搬到住所页，和日记、小纸条放一起）----
        // 0.9.0 拆了 .dev 门：her_dream 对所有人注册，`/dream` 也不再 404，所以这张卡不再按 dev 藏。
        // 2026-11-05：改成「昨夜」一张卡——梦不是她的成长数据，是一句给她自己和给你看的话。
        // 卡片右下角把她引用的那几行原文摆出来，让你一眼看见这句梦是从哪儿长出来的。
        group(S('她做过的梦'),
          S('她用自己说过的话拼成的梦；不算成长，不进她的判断。'),
          !dreams ? h('p', { className: 'dim' }, '还没读到。')
            : !(dreams.items ?? []).length ? h('p', { className: 'dim' }, S('她还没记过梦。'))
            : (() => {
                const list = dreams.items ?? []
                const latest = list[list.length - 1]
                const older = list.slice(0, -1).reverse().slice(0, 5)
                const when = (ts) => {
                  const d = new Date(ts)
                  if (!Number.isFinite(d.getTime())) return ''
                  const hours = (Date.now() - d.getTime()) / 3_600_000
                  return hours >= 0 && hours <= 30 ? '昨夜' : `${d.getMonth() + 1} 月 ${d.getDate()} 日`
                }
                return h('div', null,
                  h('div', { className: 'hint', style: { margin: '0 0 4px' } }, when(latest.ts)),
                  h('div', { style: { fontSize: '15px', lineHeight: 1.8 } }, latest.text),
                  (latest.sources ?? []).length
                    ? h('div', { style: { marginTop: '10px' } },
                        h('div', { className: 'dim', style: { margin: '0 0 3px' } }, '这句话是从这几行长出来的'),
                        ...latest.sources.map((s) => h('div', { className: 'dim', key: s.id },
                          s.text ? `「${s.text}」` : `（这条已经翻不到了：${s.id}）`)))
                    : null,
                  older.length
                    ? h('div', { style: { marginTop: '12px' } },
                        h('div', { className: 'dim' }, `更早的 ${list.length - 1} 条`),
                        ...older.map((d) => h('div', { key: d.id, style: { marginTop: '6px' } },
                          h('div', { className: 'hint', style: { margin: '0 0 2px' } }, `${d.day} · 引用了 ${(d.refs ?? []).length} 件`),
                          h('div', null, d.text))))
                    : null)
        })),

        inboxCard,

        group('本插件工作自检',
          '查状态库、登录、宿主接口、工具，以及 B 站连不连得上。',
          risk && risk.cooling
            ? h('p', { className: 'warn' },
                `B 站那边正在冷却，还有约 ${risk.remainMin} 分钟。冷却期${SELF_SHE}不刷站，但照常醒来说话。`)
            : risk?.memory?.readMs > 0
              ? h('p', { className: 'dim' },
                  `刚才被 B 站拦过一次，${SELF_SHE}自己歇一会儿（还有约 ${Math.ceil(risk.memory.readMs / 1000)} 秒）。这层只是进程内的，重启就清空。`)
              : null,
          h('div', { className: 'row' },
            h('button', {
              disabled: checking,
              onClick: () => {
                setChecking(true)
                jget('/selfcheck?net=1').then(setChecks).catch(() => {}).finally(() => setChecking(false))
              },
            }, checking ? '正在查…' : '检查一下')),
          checks
            ? h('div', { style: { marginTop: '10px' } },
                h('p', { className: 'hint' }, `${checks.summary || ''}（${localStamp(checks.checkedAt)}）`),
                h('ul', null, (checks.items || []).map((c) => h('li', { key: c.id },
                  `${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`,
                  // 修法单独占一行：以前塞在 .tag 胶囊里，一句话还行；
                  // 2026-10-28 加的「看画面」修法有三步，胶囊会被撑成挤在一起的长条。
                  !c.ok && c.fix
                    ? h('div', { className: 'hint', style: { marginTop: '3px' } }, c.fix)
                    : null))))
            : null),
        )

      // ---------------------------- 上网 ----------------------------
      // 视频观看历史分页（2026-10-28 用户 m00416；当晚按用户反馈改成「随量自适应」）：
      // 0.6.6 之前是「按天分组、每页三天」——一天刷 10 条、查 3 天就是 30 条挤在一屏。
      // 现在**按条翻页**，并且每页条数不是一个死数字，而是按「一天实际刷几条」分档：
      //   一共 ≤ 8 条 → 一页全放下，连翻页条都不出（别让人看到「第 1 / 1 页」这种噪音）；
      //   日均 > 20 条 → 6 条/页；> 10 → 8 条；> 5 → 10 条；其余 12 条。
      // 也就是刷得越密、每页越短：重度用户一屏不会顶到十几条，轻度用户又不用为翻页而翻页。
      const HIST_PAGE_MAX = 12
      const histFlat = (hist?.groups || []).flatMap((g) =>
        (g.items || []).map((it) => ({ ...it, date: g.date })))
      const histDayCount = (hist?.groups || []).length
      // 当前选的天数没读到（histErr）：手上那份不是这个天数的，翻页条也不出（列表本身见下面的 histErr）
      const histTotal = histErr ? 0 : histFlat.length
      const histPerDay = histDayCount ? histTotal / histDayCount : 0
      const histPageSize = histTotal === 0 ? HIST_PAGE_MAX
        : histTotal <= 8 ? histTotal
          : histPerDay > 20 ? 6
            : histPerDay > 10 ? 8
              : histPerDay > 5 ? 10
                : HIST_PAGE_MAX
      const histPages = Math.max(1, Math.ceil(histTotal / histPageSize))
      const histAt = Math.min(histPage, histPages - 1)
      const histSlice = histFlat.slice(histAt * histPageSize, histAt * histPageSize + histPageSize)
      const histPager = histPages > 1
        ? h('div', { className: 'row' },
          h('button', { disabled: histAt <= 0, onClick: () => setHistPage(histAt - 1) }, '较新'),
          h('span', { className: 'dim' }, `第 ${histAt + 1} / ${histPages} 页 · 一页 ${histPageSize} 条`),
          h('button', { disabled: histAt >= histPages - 1, onClick: () => setHistPage(histAt + 1) }, '更早'))
        : null

      const biliPage = h('div', { className: 'page' },
        // 第二个参数是这一组的说明（note），控件从第三个起。0.9.5 把装控件的 grid2 填进了 note 位，
        // 两个控件被包进了 <p class="hint">。
        group('上网', null,
          h('div', { className: 'grid2' },
            Toggle({ label: S('允许她上网（B 站）'), on: biliOn, onChange: setBiliOn,
              hint: S('关掉后她自己翻视频、看画面、发评论都用不了。') }),
            TimeRange({ label: '上网时间段（未成年人模式）', from: browseFrom, to: browseTo, onFrom: setBrowseFrom, onTo: setBrowseTo,
              hint: S('默认跟着「几点醒」走。她睡着的时候不会出门翻视频，醒来那一刻才现去翻（她自己临时去看不受这条限制）。') })),
          Toggle({ label: S('按时间自动替她逛一圈'), on: browseOn, onChange: setBrowseOn,
            hint: S('到点自己出去走一趟：只看、只记，不叫醒她，也不会把视频标题塞进每一轮。她下次醒来只会看到一行「今天又翻到了哪几条」。') }),
          h('div', { className: 'row', style: { marginTop: '8px' } },
            h('button', {
              className: 'ghost',
              onClick: browseNow,
              disabled: busy === 'browse-now' || !biliOn,
              title: S('整理已经刷到、还没给她看的视频；没有积压时只提示，不会叫醒她。'),
            }, busy === 'browse-now' ? '正在翻…' : '现在去看积压的视频')),
          h('p', { className: 'hint', style: { marginTop: '6px' } },
            S('有积压时会在她那边开一轮，让她自己挑；没有积压时只提示，不会叫醒她。'))),
        group('翻视频',
          // 「每天最多刷几次」只有自动逛读；她自己翻（bili_look）不受它限制，其余几项两边都用。
          S('她翻首页、搜索、相关推荐或点开一条时用这几项；「每天最多刷几次」除外，它只管自动逛。'),
          h('div', { className: 'grid2' },
            Num({ label: '每天最多刷几次', value: browsePerDay, onChange: setBrowsePerDay, min: 0, max: 10, unit: '次',
              hint: S('自动逛一天最多走几趟；一趟 = 逛一圈首页/排行，挑几条看。她自己去翻不算在里面；0 为不自动逛。范围 0–10：每趟都是一串 B 站接口请求，调太高容易被风控。') }),
            Num({ label: '每次翻几条', value: browseTopN, onChange: setBrowseTopN, min: 1, max: 20, unit: '条',
              hint: S('一次最多挑几条给她；挑中的每条都整条取来，简介、标签和热评一起给她。') }),
            Num({ label: '每条读几条热评', value: browseDeepRead, onChange: setBrowseDeepRead, min: 0, max: 20, unit: '条',
              hint: '超过 20 按 20 算；0 为不读热评。' }),
            Num({ label: '每条读几条弹幕', value: browseDanmaku, onChange: setBrowseDanmaku, min: 0, max: 30, unit: '条',
              hint: S('按时间均匀抽，最多给她看 8 条（从头到尾等距挑）；0 为不抽。') })),
          // 评论区里别人的话（2026-10-24，用户 m02454）：改的不是刷几次，而是她的认知来源里要不要算上陌生人。
          // 2026-11-08（用户 m00460）：并入「翻视频」一张卡，文案不动。
          // #59 后续：开关只管记不记那一句（voices.js 的 recordVoice），热评照样拼进她读到的正文（browse.js），
          // 原名「把评论区的话也给她读」让人以为关掉就读不到，所以改名；说明也补上记下的那句会用在哪。
          Toggle({ label: S('允许她读字幕'), on: subOn, onChange: setSubOn,
            hint: S('打开后她能按句查某条视频里说了什么：一次给一页或整篇（见下一项）、带时间点。\n关掉只是这一项用不了，已经查过的记录也不删。') }),
          // 一次读多少（2026-11-21，用户 m01746 / issue #155）：两档，不是人格旋钮——
          // 它决定的是「这台机器一次愿意为她付多少上下文」，和上面那颗开关同级。
          Sel({ label: S('她一次读多少字幕'), value: subRead, onChange: setSubRead,
            options: ['page', 'whole'],
            fmt: (v) => (v === 'whole' ? '一次读完（单条上限 3 万字）' : '一页 2800 字（默认）'),
            hint: S('一页 2800 字：先给这一页，想往后读就把页尾那句的时间填进 from；一小时的视频约 10 页。\n一次读完：整条字幕一次给她，单条上限 3 万字，超过就退回一页页读。\n读得越多，翻页的往返和 B 站请求越少，但整篇会一次占掉几万 token。') }),
          Toggle({ label: '记下评论区的一句话', on: browseVoices, onChange: setBrowseVoices,
            hint: S('每次浏览最多记 1 条：优先跨视频重复出现的那句，其次高赞短句，最后才 25% 随机抽；同一句 30 天内不再记。7 天内记下的、她还没自己说过的最近一句，会摆进她的自我描述，也可能出一张事件卡问她怎么看。\n关掉就不再记新的；已经记下的那句最多再摆 7 天，之后这两样就都没有了。热评照样跟着视频给她读，不想让她读热评，把「每条读几条热评」设成 0。') })),
        group('看视频画面',
          S('她点名一条视频，抽几帧拼成一张图来看。这一组只管视频抽帧，跟她读你发的图片、本机图片没有关系。'),
          h('div', { className: 'grid2' },
            Toggle({ label: '允许看视频画面', on: videoOn, onChange: setVideoOn,
              hint: S('需要本机有 ffmpeg，且「允许她上网」开着。') }),
            Num({ label: '每天看几条视频画面', value: videoPerDay, onChange: setVideoPerDay, min: 0, max: 6, unit: '条',
              hint: S('看成功一条算一条；每条抽几帧拼成一张图。0 为不看。它只管 bili_watch（视频抽帧），不影响她读你发的图或本机图片。') }),
            Num({ label: '每条取几帧', value: videoFrames, onChange: setVideoFrames, min: 4, max: 30, unit: '帧',
              hint: S('她没指定时刻时均匀抽这么多帧，再拼成一张图给她看。9 帧是 3×3 的正方形；其他数量按行列自动排。范围 4–30：每帧都要单独取一次，30 帧会明显变慢，拼出来的图也会被压小。') }))),
        // 请求节奏（issue #5）：机房/服务器 IP 与家宽的风控阈值差别很大。
        // 这里放的是**网络环境参数**，不是她看什么、怎么想。
        group('请求节奏',
          '调慢能少被 B 站风控；云服务器上要更慢。真的被风控了（一直报错、或提示 412/请求过于频繁）：先把「两次请求最少隔多久」调到 2000–3000 毫秒，停一小时再试，不要连续重试。',
          h('div', { className: 'grid2' },
            Num({ label: '两次请求最少隔多久', value: biliMinGap, onChange: setBiliMinGap, min: 200, max: 120000, step: 100, unit: '毫秒',
              hint: '默认 800。云服务器/机房 IP 建议 2000–3000；被风控过就先调到 3000。' }),
            Num({ label: '随机多等', value: biliJitter, onChange: setBiliJitter, min: 0, max: 60000, step: 100, unit: '毫秒',
              hint: '每次再随机多等 0 到这么久；0 为不加。' }))),
        group('屏蔽',
          S('翻视频和点名看画面都管；最短时长只管列表，她点名要看的那条不查时长。'),
          h('div', { className: 'grid2' },
            Text({ label: '屏蔽关键词', value: avoidText, onChange: setAvoidText,
              placeholder: '恐怖，血腥，鬼畜', wide: true,
              hint: '标题、UP 主名或标签含这些词的跳过；逗号分隔。' }),
            Num({ label: '最短时长', value: avoidMinDur, onChange: setAvoidMinDur, min: 0, max: 3600, unit: '秒',
              hint: '列表里比这短的视频跳过；0 为不限。' }),
            Text({ label: 'up主黑名单', value: avoidMids, onChange: setAvoidMids,
              placeholder: '12345678，87654321', wide: true,
              hint: S('跳过这些 UP 主的视频（管哪几样见本组说明）。名单只在这里改，她自己拉黑不了。mid 是 B 站主页地址里那串数字。') }))),
        group('发评论',
          S('她用下面登录的号发评论，别人看得见。'),
          h('div', { className: 'grid2' },
            Toggle({ label: '允许在评论区说话', on: commentOn, onChange: setCommentOn,
              hint: '模型自己写评论内容，养成前期不建议开启，除非你想看到你的笨比大肥鱼出去给你丢人，到处发一些意义不明的评论。' }),
            Num({ label: '每天评论几条', value: commentPerDay, onChange: setCommentPerDay, min: 0, max: 10, unit: '条',
              hint: S('只能评她当天翻到过或看过画面的视频；0 为不发。范围 0–10：评论是打 B 站接口的对外动作，同一天发太多容易被限流甚至封号，建议 1–3 条。') }),
            Num({ label: '每天回复几条', value: commentReplyPerDay, onChange: setCommentReplyPerDay, min: 0, max: 10, unit: '条',
              hint: S('回别人在她评论下的话；回你的不计数。') }),
            Sel({ label: '查回复间隔', value: commentScanMin, onChange: setCommentScanMin, options: [5, 10, 15, 30, 60, 120, 360, 720],
              fmt: (v) => (Number(v) < 60 ? `${v} 分钟` : `${Number(v) / 60} 小时`),
              hint: S('隔这么久查一次她近 7 天评论下的新回复。') }),
            Toggle({ label: '允许回复别人', on: commentReplyTo, onChange: setCommentReplyTo,
              hint: S('关掉后回复照样转给她，但她回不了。') }),
            TimeRange({ label: '评论时段', from: commentFrom, to: commentTo, onFrom: setCommentFrom, onTo: setCommentTo,
              hint: '只在这个时段内能发评论和回复。' })),
          cm && commentOn ? h('p', { className: 'hint', style: { marginTop: '8px' } },
            `今天：发了 ${cm.usedToday}/${cm.perDay} 条，回了 ${cm.replyUsedToday}/${cm.replyPerDay} 条。`,
            // issue #62：断网时服务端根本没去问，0 条不等于「没有新回复」。
            // 「关着」按上面那颗开关的本地状态说：刚翻过、30 秒轮询还没回来时，卡片和开关不打架。
            // 刚打开、手上这份 /comment 还是关着时取的（cm.online === false），同样没去查，只是不说「关着」。
            !biliOn
              ? S(' 「允许她上网」关着，没去查新回复。')
              : cm.online === false
                ? S(' 上次刷新时「允许她上网」还关着，没去查新回复。')
                : cm.waitingCount
                  ? ` 还有 ${cm.waitingCount} 条新回复没转给${SELF_SHE}${cm.waitingOwnerCount ? `，其中 ${cm.waitingOwnerCount} 条是你回的` : ''}。`
                  : ' 没有新回复。') : null),
        group(S('有人 @ 她'),
          S('别人在动态或视频评论区 @ 她时，把这件事递给她；要不要去看、要不要回，由她自己判断。'),
          h('div', { className: 'grid2' },
            Toggle({ label: '收 B 站 @', on: atOn, onChange: setAtOn,
              hint: '要先用下面的号登录 B 站；隔几分钟去看一次消息中心。' }),
            Sel({ label: '查看间隔', value: atEveryMin, onChange: setAtEveryMin, options: [1, 2, 5, 10, 15, 30, 60],
              fmt: (v) => (Number(v) < 60 ? `${v} 分钟` : `${Number(v) / 60} 小时`),
              hint: S('主人 @ 的话，最多等这么久就会叫醒她。') }),
            Num({ label: '每天最多递几条', value: atPerDay, onChange: setAtPerDay, min: 0, max: 100, unit: '条',
              hint: '超出的留到明天，不丢。' }),
            Toggle({ label: '非主人的 @ 也递', on: atOthers, onChange: setAtOthers,
              hint: S('只递给她，不替她回；她看不看、回不回由她自己判断。') }),
            Toggle({ label: '主人 @ 时当场叫醒', on: atOwnerWake, onChange: setAtOwnerWake,
              hint: '算一次单独的叫醒，不占每天的叫醒次数。' })),
          atStatus ? h('p', { className: 'hint', style: { marginTop: '8px' } },
            `今天递了 ${atStatus.usedToday}/${atStatus.perDayMax} 条。`,
            `${SELF_SHE}主动回了别人 ${atStatus.repliedToOthers} 次。`,
            atStatus.online === false ? S(' 「允许她上网」关着，没去查。') : '') : null),
        group('领养人验证',
          S('填你自己的号，一般是大号：昵称用来在评论开头 @ 你，uid 用来认出你在她评论下的回复。它和下面登录用的号可以不是同一个。这两格要点「保存这两格」才存（「保存 cookie」会顺带存上填了的）；没存就去点测试、清除登录这些按钮，页面重读后会换回已存的值。'),
          // 旧版本（≤0.5.9）会把登录账号写进这两格，只有点「保存」才会重写；这里点出来，别让人以为是刷新丢的。
          owMid && ow?.account?.mid && String(owMid) === String(ow.account.mid)
            ? h('p', { className: 'warn' },
                '这两格现在跟下面登录的账号是同一个号，像是旧版本写进去的。改成你自己的 uid 和要 @ 的昵称，再点下面「保存这两格」。')
            : null,
          h('div', { className: 'grid2' },
            Text({ label: '你的 uid', value: owMid, onChange: setOwMid, placeholder: '数字，比如 12345678', wide: true,
              hint: S('主页地址里那串数字，用来认出你在她评论下的回复。') }),
            Text({ label: '要 @ 的 B 站昵称', value: owName, onChange: setOwName, placeholder: '评论里 @ 的就是这个名字', wide: true,
              hint: '要跟 B 站上显示的一字不差（带空格也照填）。没填就 @ 不出来——空的 @ 只是一串没人认领的字符。' }),
            Toggle({ label: '评论开头 @ 你', on: atOwner, onChange: setAtOwner,
              hint: S('只加在她发的评论上，回复不加；没填昵称就不 @。') })),
          // 这组自己的保存键（2026-11-06，用户反馈）：填完就地能存，不用再去下面 cookie 那栏找。
          h('div', { className: 'row', style: { marginTop: '8px', gap: '8px' } },
            h('button', { onClick: saveOwnerIdentity, disabled: busy === 'owid' },
              busy === 'owid' ? '保存中…' : '保存这两格'),
            h('span', { className: 'hint' }, 'uid 和昵称要点这里保存；空着的格子保留原值。'),
            owIdNote ? h('span', { className: 'dim' }, owIdNote) : null)),
        group('B 站登录',
          S('她发评论、回复用这个号，看画面时也会带上；建议用小号，不登录也能翻视频。'),
          // 登录过期的红条在页签顶部（tab === 'bili'），这里不重复放。
          // 两个入口：扫码是给人用的，粘贴是退路（扫码不顺利、或者想换个号）。
          // 用 .seg 而不是页签那套 .tabs/.tab——卡片里的切换不该长得像导航栏（2026-11-02）。
          h('div', { className: 'seg' },
            h('button', { className: owTab === 'qr' ? 'on' : '', onClick: () => setOwTab('qr') }, '手机扫码'),
            h('button', { className: owTab === 'cookie' ? 'on' : '', onClick: () => setOwTab('cookie') }, '粘贴 cookie')),

          h('div', { className: 'dim', style: { marginBottom: '8px' } },
            ow?.hasCookie
              ? `已存${ow?.account?.name ? `，登录账号：${ow.account.name}${ow.account.mid ? `（uid ${ow.account.mid}）` : ''}` : '（点下面的「测试 cookie 能不能说话」认一下是哪个账号）'}${ow.hasCsrf ? '' : '，但少了 bili_jct（不能发评论）'}。换一份就重新登。`
              : '还没存。'),

          owTab === 'qr'
            ? h('div', null,
              h('p', { className: 'hint', style: { margin: '0 0 8px' } },
                '用手机 B 站扫码；确认是哪个号后点「就是这个号，保存」才会存下，中途关掉不存。'),
              h('div', { className: 'row' },
                h('button', { onClick: startQr, disabled: qrBusy },
                  qrBusy ? '生成中…' : qr ? '再换一张码' : '用手机扫码登录'),
                h('span', { className: 'hint' }, '码 3 分钟内有效；过期了点浮层里的「刷新」。'),
                // 生成失败时这一行是唯一能看见的原因（浮层会同时打开），别再写成灰色小字。
                qrNote ? h('span', { className: 'qrerr', style: { margin: 0 } }, qrNote) : null))
            : h('div', null,
              h('p', { className: 'hint', style: { margin: '0 0 8px' } },
                '存好后不回显：输入框空着不代表没存，以上面那行为准。'),
              h('textarea', {
                rows: 3,
                value: owCookie,
                placeholder: 'SESSDATA=...; bili_jct=...',
                onChange: (e) => setOwCookie(e.target.value),
              }),
              h('div', { className: 'hint', style: { whiteSpace: 'pre-wrap', marginTop: '6px' } },
                String(ow?.hint ?? '').split('\\n').map((line, i) => h('div', { key: i }, line))),
              h('div', { className: 'row', style: { marginTop: '8px' } },
                h('button', { onClick: saveOwnerCard, disabled: busy === 'owner' },
                  busy === 'owner' ? '保存中…' : '保存 cookie'),
                h('span', { className: 'hint' }, '会顺带存上面填了的 uid 和昵称；只改那两格，点上面那组里的「保存这两格」。'))),

          h('div', { className: 'row', style: { marginTop: '8px' } },
            owNote ? h('span', { className: 'dim' }, owNote) : null,
            // 测试键原来只长在「粘贴 cookie」页签里（issue #52）：扫码登进来的人
            // 想看「这份 cookie 还能不能说话」得先翻页签，上面那行「点测试认一下是哪个账号」
            // 更是指向一颗不在当前页签上的按钮。挪到两组共用的这一行，两个页签都点得到。
            ow?.hasCookie
              ? h('button', { onClick: testOwner, disabled: busy === 'owtest' },
                busy === 'owtest' ? '测试中…' : '测试 cookie 能不能说话')
              : null,
            ow?.hasCookie
              ? h('button', {
                disabled: busy === 'owclear',
                onClick: () => {
                  if (!window.confirm(S('清掉登录？之后她就不能发评论了，要重新登。'))) return
                  clearLogin()
                },
              }, busy === 'owclear' ? '清除中…' : '清除登录')
              : null,
            ow?.hasCookie
              ? h('span', { className: 'hint' }, '测试只查这份 cookie 登的是哪个号，不改已存的 cookie、uid 和昵称；上面两格没存的会换回已存的值。')
              : null)),

        // ---- 以前看了什么（视频观看历史，分页） ----
        groupFull('看过的视频',
          // 其余那部分有 look:（她自己点开的）和 browse:（自动逛和以前刷站记的），不只是旧版（issue #69）
          S('按天从近到远，点标题打开原视频；标「看过画面」的是抽帧看过的，其余是她自己点开的，或者自动逛时翻到的。'),
          h('div', { className: 'grid2', style: { marginBottom: '10px' } },
            Sel({ label: '查多久的记录', value: histDays,
              onChange: pickHistDays,
              options: HIST_DAYS_OPTIONS,
              fmt: (v) => `${v} 个有记录的日子`,
              hint: '按有记录的日子数，不按日历：没上网的日子不占数。只是查询范围，不会删记录；改完立刻重列，下次打开还记得。' })),
          h('div', { className: 'row', style: { marginBottom: '8px' } },
            h('span', { className: 'dim' }, histErr ? '没读到' : `共 ${histDayCount} 天 · ${hist?.total ?? 0} 条`),
            histPager),
          // 当前选的天数没读到（histErr）：手上那份不是这个天数的，一条都不摆
          histErr || !histFlat.length
            ? h('p', { className: 'empty' }, histErr
              ? `这段时间的记录没读到，不是没有记录。换个天数，或者过一会儿再选一次。（${histErr}）`
              : '还没有记录。')
            : h('div', null, histSlice.map((it, i) => h('div', {
                // 列表按时间从新到旧摊平；换天时插一条日期标签（一页 12 条，不是一天一页）
                key: `${it.date}|${it.bvid}|${i}`,
                style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' },
              },
                i === 0 || histSlice[i - 1].date !== it.date
                  ? h('div', { className: 'tag', style: { flex: '0 0 auto', minWidth: '86px' } }, it.date.slice(5))
                  : h('span', { style: { flex: '0 0 auto', width: '86px' } }),
                h('img', {
                  src: `${API}/cover/${it.bvid}`,
                  alt: '',
                  loading: 'lazy',
                  onError: (e) => { e.currentTarget.style.display = 'none' },
                  style: {
                    width: '80px',
                    height: '50px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    flex: '0 0 auto',
                    background: 'rgba(128,128,128,.15)',
                  },
                }),
                // 2026-10-30：真的抽帧看过画面的那几条要能一眼认出来，
                // 否则它跟"只扫了眼标题"在列表里长得一样（客户反馈的原点）。
                it.how === 'watch'
                  ? h('span', { className: 'tag', style: { flex: '0 0 auto' } }, '看过画面')
                  : h('span', { style: { flex: '0 0 auto', width: '0' } }),
                h('a', {
                  href: it.url,
                  target: '_blank',
                  rel: 'noreferrer',
                  style: { color: 'inherit' },
                }, esc(it.title) || it.bvid),
                h('span', { className: 'tag' }, it.up ? esc(it.up) : '')))),
          histPages > 1
            ? h('div', { className: 'row', style: { marginTop: '10px' } }, histPager)
            : null,
          // 今日概览并进这里，不再单开一张卡（原来「今天看了什么」和「以前看过什么」是两次重复）
          // 2026-10-30：三个数分开报——看过画面 / 翻到过 / 递过来还没看。
          // 原来只有一个「累计看过 M 条」，把三件事算成一个数，才有的客户反馈。
          // issue #62：browse.enabled 只是「自动逛」。「允许她上网」关着时她自己也出不去，
          // 不能再说「她自己临时去看不受影响」。这句说的是她现在能不能出门，按上面那颗开关的
          // 本地状态判（停手 700 毫秒就存盘），不等 /browse 的 30 秒轮询，免得和开关说反。
          !browse ? null
            : !browse.enabled ? h('p', { className: 'hint' }, !biliOn
              ? S('今天没开自动逛；「允许她上网」也关着，她自己也打不开视频。')
              : S('今天没开自动逛（她自己临时去看不受影响）。'))
            : h('p', { className: 'hint', style: { marginTop: '8px' } },
                `今天：自动逛了 ${browse.usedToday} / ${browse.perDay} 次，一次 ${browse.topN} 条；`
                + `其中真的看了画面 ${browse.watchedCount ?? 0} 条、只翻到过 ${browse.glancedCount ?? 0} 条`
                + `${(browse.handed ?? []).length ? `、你递过来还没看 ${browse.handed.length} 条` : ''}。`
                + (!biliOn ? S('「允许她上网」关着，她自己打不开视频。') : ''))),
        )
