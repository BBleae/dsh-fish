      // ---- 说话提醒（P3-3 重写，2026-10-23）----
      // 服务端只回答"该不该提醒、提醒什么"（GET /notify 的 due/text），
      // **弹是这里的事**。原实现调隐藏 PowerShell 弹 WinRT Toast，被火绒当
      // 木马行为拦下；更糟的是静默拦截时没有任何错误返回，lastShown 照样
      // 被写掉 → 当天再也不会弹。现在只用浏览器自己的能力，不产生任何子进程。
      //
      // 页面关着就不会有提醒——这是他本人接受的取舍（m05389）：第二天打开
      // 观测台照样能看到她说过什么。
      useEffect(() => {
        const has = typeof window !== 'undefined' && 'Notification' in window
        setNotifyPerm(has ? window.Notification.permission : 'unsupported')
        let stop = false
        const poll = async () => {
          try {
            const r = await jget('/notify')
            if (stop || !r?.due || !r?.text) return
            let shown = false
            if (has && window.Notification.permission === 'granted') {
              try {
                new window.Notification('大肥鱼跟你说话', { body: r.text, tag: 'dsh-fish' })
                shown = true
              } catch { /* 系统禁了就退到气泡 */ }
            }
            // 弹不出来也要让他看见——不然这条提醒就白记了
            if (!shown) setBubble(r.text)
            await jpost('/notify', { shown: true })
          } catch { /* 轮询失败不打扰他 */ }
        }
        poll()
        const t = setInterval(poll, 60_000)
        return () => { stop = true; clearInterval(t) }
      }, [])

      const allowNotify = async () => {
        try {
          if (typeof window === 'undefined' || !('Notification' in window)) {
            setErr('这个浏览器不支持桌面通知，大肥鱼说话时我只能在页面里提示你。')
            return
          }
          const p = await window.Notification.requestPermission()
          setNotifyPerm(p)
          setNote(p === 'granted'
            ? '好了，大肥鱼说话时会在系统里提醒你（一天最多一次）。'
            : '没拿到通知权限——那就在页面顶上提示你，效果一样的。')
        } catch (e) { setErr(e.message) }
      }


      // 只提交"环境"字段。她的性格相关的键一个都不在这里（B §8）。
      // 手动按钮和自动保存在同一处组装，避免两份字段表漂移。
      const buildConfig = () => ({
        absenceAfterDays: Number(absent),
        wakesPerDay: Number(wakes),
        daily: { events: Number(eventsPerDay), questions: Number(questionsPerDay), quietMin: Number(quietMin) },
        growthDays: Number(growthDaysUi),
        // diary 不在这张表里：它有自己的 patchDiary（见下）。
        // 整表提交会把日记三项一起写一遍，手里一旦是旧值就等于替用户把开关关掉。
        avoid: {
          keywords: avoidText.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean),
          minDuration: Number(avoidMinDur),
          upMids: avoidMids.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean),
        },
        window: [wakeFrom, wakeTo],
        // 2026-11-07（用户反馈）：能上网这颗开关要写到两个地方——
        // bili.enabled 是 0.9.x 下 bili_look / bili_watch 真正认的闸门；
        // browse.enabled 留着给老参数（以及以后要不要恢复自动刷的那个决定）。
        browse: { enabled: browseOn, perDay: Number(browsePerDay), topN: Number(browseTopN), deepRead: Number(browseDeepRead), danmaku: Number(browseDanmaku), voices: Boolean(browseVoices), window: [browseFrom, browseTo] },
        video: { enabled: videoOn, perDay: Number(videoPerDay), frames: Number(videoFrames) },
        bili: { enabled: biliOn, sub: Boolean(subOn), read: String(subRead || 'page'), minIntervalMs: Number(biliMinGap), jitterMs: Number(biliJitter) },
        notify: { enabled: notifyOn },
        chat: { rotateAfter: Number(rotateAfter), replyChars: Number(replyChars), carry: Number(carryTurns), anchor: Boolean(anchorOn) },
        tools: { restrict: Boolean(toolsRestrict), allow: toolsAllowSaved },
        memory: { docBudget: Number(docBudget), sleepEveryDays: Number(sleepEvery), sleepKeep: Number(sleepKeep), beliefsShown: Number(beliefsShown), hearEvery: Number(hearEvery), echo: Boolean(echoOn) },
        comment: {
          enabled: commentOn,
          perDay: Number(commentPerDay),
          replyPerDay: Number(commentReplyPerDay),
          replyToReplies: commentReplyTo,
          atOwner,
          scanEveryMin: Number(commentScanMin),
          window: [commentFrom, commentTo],
        },
        at: {
          enabled: atOn,
          scanEveryMin: Number(atEveryMin),
          perDayMax: Number(atPerDay),
          others: atOthers,
          ownerWake: atOwnerWake,
        },
        // 桥接投递口（2026-11-19，用户 m00805）。0 = 不开。
        bridge: { port: Number(bridgePort) },
      })

      // 数字框可能停在半截（清空、只打了一个「1」）。这种值不写盘，
      // 否则服务端 clamp 会静默改成下限，用户以为自己输的就是生效值。
      const NUM_BOUNDS = [
        ['冷落天数', absent, 1, 30],
        ['每天定时醒几次', wakes, 0, 12],
        ['每天几张事件卡', eventsPerDay, 0, 12],
        ['每天问题卡数', questionsPerDay, 0, 6],
        ['成长周期', growthDaysUi, 7, 180],
        // 日记三项不在这里：它们由 patchDiary 单独提交（整表保存会把开关写回旧值）。
        ['最短时长', avoidMinDur, 0, 3600],
        ['每天最多刷几次', browsePerDay, 0, 10],
        ['每次翻几条', browseTopN, 1, 20],
        ['每条读几条热评', browseDeepRead, 0, 20],
        ['每条读几条弹幕', browseDanmaku, 0, 30],
        ['两次请求最少隔多久', biliMinGap, 200, 120000],
        ['随机多等', biliJitter, 0, 60000],
        ['每天看几条视频画面', videoPerDay, 0, 6],
        ['每天最多搭话', proactiveMax, 0, 12],
        ['对话停下来多久才叫醒', quietMin, 0, 60],
        ['每条取几帧', videoFrames, 4, 30],
        ['聊满多少轮换新会话', rotateAfter, 0, 500],
        ['换新会话时带几轮原话', carryTurns, 0, 20],
        [S('她一轮最多写多少字'), replyChars, 0, 2000],
        ['身份段字数', docBudget, 1800, 8000],
        ['眼前的判断条数', beliefsShown, 1, 8],
        ['回头想间隔', sleepEvery, 0, 60],
        ['总共留几条自述', sleepKeep, 0, 100],
        ['每几轮记一句', hearEvery, 0, 50],
        ['每天几条评论', commentPerDay, 0, 10],
        ['每天回复几条', commentReplyPerDay, 0, 10],
        ['隔几分钟扫', commentScanMin, 5, 720],
        ['桥接投递口端口', bridgePort, 0, 65535],
      ]
      const badNumber = () => {
        for (const [label, value, lo, hi] of NUM_BOUNDS) {
          const n = Number(value)
          if (!Number.isFinite(n) || n < lo || n > hi) return `${label}（${lo}–${hi}）`
        }
        return ''
      }
      // 时间段的错不是数字越界，别套「这个数不在允许范围里」；起止相同在输入框下面已经
      // 写了红字，这里再拦一次是为了不让它被自动保存悄悄写回默认的 20:00–23:00。
      const badWindow = () => {
        const one = (label, from, to) => {
          if (!from || !to) return `${label}：开始和结束都要填。`
          if (from === to) return `${label}：开始和结束不能是同一时刻。要全天，请设 00:00–23:59。`
          return ''
        }
        return one(S('她醒着的时间段'), wakeFrom, wakeTo)
          || one('上网时段', browseFrom, browseTo)
          || one('评论时段', commentFrom, commentTo)
      }

      const save = async (silent = false) => {
        const badWin = badWindow()
        if (badWin) { setErr(badWin); return }
        if (!silent) { setBusy('save'); setNote('') }
        try {
          await jpost('/config', buildConfig())
          if (silent) flashSaved()
          else { setNote('已保存。下一轮 tick 生效。'); await load() }
        } catch (e) {
          if (silent) failSave(e.message)
          else setErr(e.message)
        } finally { if (!silent) setBusy('') }
      }

      // 日记三项单独提交（2026-10-28 用户反馈「开了『让我看日记』插件又自己关」）。
      // 走整表保存时，任何一项环境参数变化都会顺带把 diary 一起写一遍；
      // 只要那一刻手里是旧值，开关就被静默翻回去。这里改成「改了哪项就只提交哪项」，
      // 服务端 updateConfig 是深合并，没传的键原样保留。
      const patchDiary = async (patch) => {
        diaryTouchedAt.current = Date.now()
        diaryPending.current += 1
        try {
          await jpost('/config', { diary: patch })
          flashSaved()
        } catch (e) { failSave(e.message) } finally { diaryPending.current -= 1 }
      }

      // 主动说话（0.8.1 本机实验）：同样只提交改了的那一项，别把别的开关写回旧值。
      const patchProactive = async (patch) => {
        try {
          await jpost('/config', { proactive: patch })
          flashSaved()
          return true
        } catch (e) { failSave(e.message); return false }
      }

      // 外部工具分类（2026-11-14，用户 m01618）：一行一个 `工具名=类别`。
      // 只认这四类；写错的行直接忽略，不把半截对象写进配置。
      const parseToolClasses = (text) => {
        const out = {}
        for (const line of String(text ?? '').split(/[\n,，;；]+/)) {
          const m = /^\s*([A-Za-z0-9_.-]+)\s*[=:：]\s*(produce|consume|effect|self)\s*$/.exec(line)
          if (m) out[m[1]] = m[2]
        }
        return out
      }

      // 「安静多久才搭话」（issue #69）：2026-11-22 起按分钟填，10 分钟–24 小时。
      // 停手 700ms 再存；清空、不在范围里的不写，小数取整后再存。
      const QUIET_MINUTES = [10, 24 * 60]
      const pickProactiveIdle = (v) => {
        setProactiveIdle(v)
        clearTimeout(proactiveIdleTimer.current)
        const raw = String(v ?? '').trim()
        const n = Number(raw)
        if (!raw || !Number.isFinite(n) || n < QUIET_MINUTES[0] || n > QUIET_MINUTES[1]) return
        const minutes = Math.round(n)
        proactiveIdleTimer.current = setTimeout(async () => {
          // 框里换成要存的那个数：小数取了整，中间有过重读（load）把框改回旧值的，也对回来
          setProactiveIdle(minutes)
          if (minutes === proactiveIdleSaved.current) return
          proactiveIdleSaved.current = minutes
          const ok = await patchProactive({ quietMinutes: minutes })
          // 没存上：不知道盘上现在是几，下次不管填几都再写
          if (!ok && proactiveIdleSaved.current === minutes) proactiveIdleSaved.current = null
        }, 700)
      }

      // 顶层那三个开关（梦 / 主动性 / 兴趣）：各写各的组，互不覆盖。
      const patchGroup = async (key, patch) => {
        try {
          await jpost('/config', { [key]: patch })
          flashSaved()
        } catch (e) { failSave(e.message) }
      }

      // 改完就生效：任何一项变了，停手 700ms 就写盘（连点加减号也只写一次）。
      const cfgSig = JSON.stringify(buildConfig())
      useEffect(() => {
        if (!state) return
        const bad = badNumber()
        const badWin = badWindow()
        // 越界的数改回范围里了，失败框就收起来：改回的正好是盘上的值时，下面那句会直接返回、不再写盘，
        // 框就一直挂着说「超出了允许的范围」。别的原因的失败不在这里收。
        if (saveFailRange && !bad) failSave('')
        if (/^(她醒着的时间段|上网时段|评论时段)：/.test(saveFail) && !badWin) failSave('')
        if (baselinePending.current) { baselinePending.current = false; lastSaved.current = cfgSig; return }
        if (cfgSig === lastSaved.current) return
        // 越界是眼前的错，先说这个；「还没读全」只是拦着不写盘，别盖过它（issue #95 的用例）。
        if (bad) { failRange(bad); return }
        if (badWin) { failSave(badWin); return }
        if (!cfgLoads) { failSave(CFG_MISSING); return }
        const t = setTimeout(async () => {
          try {
            const r = await jpost('/config', buildConfig())
            lastSaved.current = cfgSig
            // 服务端丢掉了几个「这台机器上不存在」的名字（2026-10-31 issue #14）：
            //   · 把 cleaned 名单收回来，否则下一次整表提交又带着它、每次都白丢一遍；
            //   · 名字说出来，别让用户以为自己设的还在。
            //   · 只改「已存名单」，不动输入框里的草稿——他可能正在那儿打字。
            const gone = Array.isArray(r?.droppedTools) ? r.droppedTools.filter(Boolean) : []
            if (gone.length) {
              const kept = Array.isArray(r?.config?.tools?.allow) ? r.config.tools.allow.map(String) : []
              setToolsAllowSaved(kept)
              setDroppedTools(gone)
            }
            flashSaved()
          } catch (e) { failSave(e.message) }
        }, 700)
        return () => clearTimeout(t)
      }, [cfgSig, state, cfgLoads])

      const saveTools = async () => {
        setBusy('tools'); setToolsSaveNote(''); setToolsSaveErr('')
        try {
          let known = toolsKnown
          let own = toolsOwnLayer
          // 2026-10-29：每次保存都问一次宿主，顺带拿回 own 层名单。
          // 以前只在 known 为空时问，于是「哪些名字收窄挡不住」永远是空的。
          try {
            const r = await jget('/tools')
            const names = Array.isArray(r?.known) ? r.known : null
            if (names && names.length) { known = names; setToolsKnown(names) }
            own = Array.isArray(r?.ownLayer) ? r.ownLayer : []
            setToolsOwnLayer(own)
            setToolsBlocked(Array.isArray(r?.blocked) ? r.blocked : [])
            if (Array.isArray(r?.herTools)) setToolsHerTools(r.herTools)
            setToolsAllowNow(Array.isArray(r?.allowNow) ? r.allowNow : null)
            setToolsEffective(Array.isArray(r?.effective) ? r.effective : null)
            setToolsRunKnown(Boolean(r) && Object.prototype.hasOwnProperty.call(r, 'allowNow'))
            setToolsSkippedSure(typeof r?.skippedSure === 'boolean' ? r.skippedSure : null)
            setToolsLoad('ok')
          } catch { /* 拿不到就沿用旧名单，只查拼写 */ }
          const check = checkToolNames(toolsAllowText, known)
          if (!check.ok) {
            setToolsSaveErr(`这些名字不对：${check.unknown.join('、')}。没保存。`)
            return
          }
          // 名单没拿到（她还没在本进程里开过会话，或宿主换了版本）时，只查了拼写——
          // 这点必须说出来，否则用户以为「过了校验」就等于「名字一定存在」。
          const onlyShape = !known || !known.length
          const before = toolsAllowSaved.length
          // strictTools：这是用户刚在输入框里敲完点的「保存」，坏名字要当场拦下来。
          // 页面自动保存走的是另一条（不带这个标记）：那边丢掉坏名字、其余照存，
          // 因为回传的是盘上已有的旧名单，用户没在编辑它（2026-10-31 issue #14）。
          const saved = await jpost('/config', { tools: { restrict: Boolean(toolsRestrict), allow: check.names }, strictTools: true })
          // 服务端存盘后会当场换刀（0.9.8 起）：返回 toolsLive 就是换成了，没返回就是没动名单。
          const live = saved?.toolsLive?.ok === true
          const deferredTools = saved?.toolsLive?.deferred ?? 0
          setToolsAllowSaved(check.names)
          await load()
          const delta = check.names.length - before
          // 回执按收窄开没开分两支（0.9.5 只看名单是不是空的，两头都说反了）：
          // 收窄关着时白名单不限制她，多填少填都不会让她「多看见」「少看见」什么；
          // 收窄开着时名单清空，当场就只剩她自己的那几件。
          // 0.9.8（2026-11-11，外部用户反馈）：白名单存完当场换刀，不用重启；
          // 只有老服务端（没回 toolsLive）才按旧说法说「重启之后」。
          const tail = live && deferredTools
            ? `（这一局还有 ${deferredTools} 条${SELF_SHE}自己的工具没登记齐，下次开新会话会补进去。）`
            : ''
          if (!toolsRestrict) {
            setToolsSaveNote(check.names.length
              ? `存好了。收窄关着，白名单现在不限制${SELF_SHE}：${SELF_SHE}照样能用全部工具。名单一共 ${check.names.length} 个，打开收窄才按它来。`
              : S('存好了。收窄关着，白名单现在不限制她：她照样能用全部工具；打开收窄才按名单来。'))
          } else if (!check.names.length) setToolsSaveNote(live ? S('存好了，现在就生效：她只剩自己那几件工具。') : S('存好了。白名单是空的：重启 DSH 之后她只剩自己那几件工具。'))
          else if (delta > 0) setToolsSaveNote(live
            ? `存好了，现在就生效：${SELF_SHE}会多看见 ${delta} 个工具（名单一共 ${check.names.length} 个）。${tail}`
            : `存好了。重启 DSH 之后${SELF_SHE}会多看见 ${delta} 个工具（名单一共 ${check.names.length} 个）。`)
          else if (delta < 0) setToolsSaveNote(live
            ? `存好了，现在就生效：${SELF_SHE}会少看见 ${-delta} 个工具（名单一共 ${check.names.length} 个）。${tail}`
            : `存好了。重启 DSH 之后${SELF_SHE}会少看见 ${-delta} 个工具（名单一共 ${check.names.length} 个）。`)
          else setToolsSaveNote(`存好了。名单没变，还是 ${check.names.length} 个。`)
          const ownPicked = check.names.filter((n) => own.includes(n))
          if (ownPicked.length) {
            setToolsSaveNote((n) => `${n} 其中 ${ownPicked.join('、')} 是${SELF_SHE}本来就看得见的（插件把${SELF_SHE}自己的工具注册进${SELF_SHE}那一层，收窄挡不住）：加进白名单只是让兜底守卫放行它。`)
          }
          if (onlyShape && check.names.length) {
            setToolsSaveNote((n) => `${n} 这次只核对了拼写——${SELF_SHE}还没开过会话，宿主那边还给不出工具名单。名字必须一字不差。`)
          }
        } catch (e) {
          setToolsSaveErr(e.message)
        } finally { setBusy('') }
      }

      /**
       * 主人身份与 B 站登录。
       * cookie 只上行不下行——输入框永远是空的，存过之后只显示「已保存」。
       */
      const saveOwnerCard = async () => {
        setBusy('owner'); setOwNote('')
        try {
          // 2026-11-06（用户反馈）：这三格原来是「一律原样提交」，于是只粘 cookie、两格
          // 没填（或先清空了）的人，点一次保存就把 mid / 昵称覆写成空串 —— 昵称一空，
          // mentionPrefix 就返回空串，评论里再也 @ 不出来。现在只提交填了的格子。
          const body = {}
          if (owMid.trim()) body.mid = owMid.trim()
          if (owName.trim()) body.nickname = owName.trim()
          if (owCookie.trim()) body.cookie = owCookie.trim()
          if (!Object.keys(body).length) { setOwNote('三格都是空的，没东西可存。'); setBusy(''); return }
          const r = await jpost('/owner', body)
          setOwNote(r.note || (r.ok ? '存下了。' : '没存上。'))
          setOwCookie('')
          await load()
        } catch (e) { setOwNote(e.message) } finally { setBusy('') }
      }

      /**
       * 只保存「领养人」那两格（2026-11-06，用户反馈）。
       * 以前这两格唯一能存的地方挂在下面「B 站登录 → 粘贴 cookie」页签底部：
       * 停在领养人这一组里找不到，停在扫码页签里那颗键压根不渲染，填完等于白填。
       * 现在这组自带一颗，提交范围也只有这两格——不动下面那份 cookie，也不把空串写回去。
       * 存完刷一次 /owner：旧版本写脏时那句提示会跟着消失，两格也换回服务端真正存下的值。
       */
      const saveOwnerIdentity = async () => {
        setBusy('owid'); setOwIdNote('')
        try {
          const body = {}
          if (owMid.trim()) body.mid = owMid.trim()
          if (owName.trim()) body.nickname = owName.trim()
          if (!Object.keys(body).length) { setOwIdNote('两格都空着，没有可存的。'); setBusy(''); return }
          const r = await jpost('/owner', body)
          setOwIdNote(r.note || (r.ok ? '存下了。' : '没存上。'))
          if (r.ok) { flashSaved(); await load() }
        } catch (e) { setOwIdNote(e.message) } finally { setBusy('') }
      }

      const testOwner = async () => {
        setBusy('owtest'); setOwNote('')
        try {
          const r = await jpost('/owner', { test: true })
          setOwNote(r.note || (r.ok ? '可以说话。' : '还不行。'))
          // 2026-10-27：测试只认「这份 cookie 登的是谁」，不再回填领养人输入框。
          // 以前这里会把 owMid / owName 改成小号，用户手填的大号当场被冲掉。
          await load()
        } catch (e) { setOwNote(e.message) } finally { setBusy('') }
      }

      /**
       * 扫码登录（2026-11-01）。
       * 码在宿主那边生成——passport 接口没有 CORS 头，页面里 fetch 会当场被挡。
       * 这里拿到的只有一张 SVG 和一把 key；cookie 原文永远到不了页面。
       *
       * 2026-11-02：点下去之后**一定要有反馈**。以前生成失败时只往卡片里塞一行灰字，
       * 浮层根本不弹，人看到的就是「点了没反应」。现在失败也把浮层打开，
       * 里面写清为什么没有码（多半是宿主还跑着旧版插件，重启才好）。
       */
      const qrFail = (why) => {
        const msg = String(why || '没生成出来，再点一次。')
        setQrNote(msg)
        setQr({
          key: '', svg: '', expiresAt: 0,
          state: 'error', note: msg, account: null, canWrite: false,
        })
      }
      const startQr = async () => {
        setQrBusy(true); setQrNote('')
        try {
          // 刷新＝换一张：旧的那张连它攥着的 cookie 一起丢掉，不留两把钥匙。
          // 但 drop 失败要留痕（2026-11-02）：以前这里 .catch(() => {}) 把 404 也吃了，
          // 宿主根本没装这个插件版本时，界面上一点线索都没有。
          if (qr?.key) {
            jpost('/bili/qr/drop', { key: qr.key })
              .catch((e) => console.warn('[dsh-fish] 丢掉旧二维码失败：', e?.message || e))
          }
          const r = await jpost('/bili/qr', {})
          if (!r?.ok) { qrFail(r?.why); return }
          setQr({
            key: r.key,
            svg: r.svg,
            expiresAt: Number(r.expiresAt ?? (Date.now() + (Number(ow?.qrTtlMs) || 180_000))),
            state: 'waiting',
            note: '',
            account: null,
            canWrite: false,
          })
        } catch (e) {
          // 404/405 = 宿主还跑着旧版插件，新路由没注册上（405 是宿主对未注册前缀的默认应答）。
          // 说人话，别让人对着「HTTP 405」猜要不要重启。
          const m = String(e?.message || e)
          qrFail(/HTTP (404|405)/.test(m)
            ? '宿主还没加载这一版插件（多半是没重启）。完全退出 DSH 再打开，然后重新点一次。'
            : m)
        } finally { setQrBusy(false) }
      }

      /** 关浮层＝放弃这次登录：让宿主把那张码和攥着的 cookie 一起忘掉。 */
      const closeQr = () => {
        const key = qr?.key
        setQr(null); setQrNote('')
        if (key) jpost('/bili/qr/drop', { key }).catch(() => {})
      }

      /** 人点了「确认」才写盘——扫码成功只是把 cookie 攥在宿主内存里。 */
      const saveQrLogin = async () => {
        if (!qr?.key) return
        setQrBusy(true); setQrNote('')
        try {
          const r = await jpost('/bili/qr/save', { key: qr.key })
          if (!r?.ok) { setQrNote(r?.why || r?.error || '没存上。'); return }
          setQr(null)
          setOwNote(r.note || '存下了。')
          await load()
        } catch (e) { setQrNote(e.message) } finally { setQrBusy(false) }
      }

      /** 清除登录：cookie 与「登的是谁」一起清，别留一个会误导人的旧名字。 */
      const clearLogin = async () => {
        setBusy('owclear'); setOwNote('')
        try {
          const r = await jpost('/owner', { cookie: '' })
          setOwNote(r.note || '清掉了。')
          await load()
        } catch (e) { setOwNote(e.message) } finally { setBusy('') }
      }

      const wake = async () => {
        setBusy('wake'); setNote('')
        try {
          const r = await jpost('/wake')
          setNote(r.ok ? '已叫醒。' : `没叫：${r.why || ''}`)
          await load()
        } catch (e) {
          setErr(e.message)
        } finally { setBusy('') }
      }

      // 2026-11-17（用户 m00796）：「现在去看积压的视频」——不是叫醒，是单独开一个
      // 翻一翻回合，把还没摆过的视频标题摆给她挑。wakesPerDay=0 时 /wake 叫不醒，
      // 这个按钮不受那条限制。
      const browseNow = async () => {
        setBusy('browse-now'); setNote('')
        try {
          const r = await jpost('/browse-review')
          setNote(r.ok ? `摆出了 ${r.count} 条。` : (r.why === '没有要整理的' ? '没有积压的视频，不用整理。' : `没摆：${r.why || ''}`))
          await load()
        } catch (e) {
          setErr(e.message)
        } finally { setBusy('') }
      }

      // ---- P3-1：跟她说一句话 ----
      const send = async () => {
        const t = sayText.trim()
        if (!t) return
        setBusy('say'); setNote(''); setSaid([])
        try {
          const r = await jpost('/say', { text: t })
          setSaid(r.said || [])
          setSayText('')
          setNote(r.said?.length ? '' : (r.note || '大肥鱼这次没说话。'))
          await load()
        } catch (e) {
          setErr(e.message)
        } finally { setBusy('') }
      }

      // 一条规则被驳回几次之后就不再自动提：unlock.js 的 offerLimits 永远给两档冷却（retryDays 两个数），
      // offerDueDay 在驳回次数到了档数时回 null。cooldownDays 只改天数，不改档数。
      const RULE_REJECT_MAX = 2
      const rejectsOf = (ruleId) => (rules?.history || [])
        .filter((x) => x && x.rule === ruleId && x.verdict === 'reject').length

      // ---- R3：裁决她提上来的那张申请 ----
      // 批准会立刻重写身份文档，她下一次开口就看得见"这件事现在可以了"。
      const decide = async (verdict) => {
        setBusy('decide')
        setErr('')
        // 点之前先记下这条规则已经被驳回过几次：回执要说清这一次是不是最后一次。
        const rule = rules?.pending?.rule || ''
        const left = RULE_REJECT_MAX - rejectsOf(rule) - 1
        try {
          const r = await jpost('/decide', { verdict })
          if (r && r.error) throw new Error(r.error)
          setNote(verdict === 'approve'
            ? S('答应了，下一次开口她就知道这件事现在可以了。')
            : rules?.offersOn === false
              ? S('记下了「这次不行」。申请通道现在关着，她不会再自动提。')
              : left > 0
                ? `记下了「这次不行」。条件还够的话，过几天${SELF_SHE}可能再提一次；再驳回 ${left} 次就不再自动提。`
                : S('记下了「这次不行」。这条已经驳回到上限，以后她不会再自动提了。'))
          await load()
        } catch (e) {
          setErr(e.message || String(e))
        } finally { setBusy('') }
      }

      // ---- P3-2：信箱已读 ----
      const markInbox = async () => {
        setBusy('inbox')
        try { await jpost('/inbox'); await load() } catch (e) { setErr(e.message) } finally { setBusy('') }
      }

      // ---- P4：把她放回第一天 ----
      // 两步：先读"将要封存什么"给他看，再要求他按第二次（真按钮）。
      // 不做 undo —— 但旧数据是**改名封存**，不是删，所以真后悔了还能从
      // 同级目录的 dsh-fish-backups/reset-* 里整包搬回来。
      const askReset = async () => {
        setBusy('reset-ask'); setNote('')
        try {
          const info = await jget('/reset')
          setResetInfo(info)
          setResetAsk(true)
        } catch (e) { setErr(e.message) } finally { setBusy('') }
      }
      // ---- 导入别人养过的大肥鱼（2026-10-27，用户 m03170）----
      // 先读「现在能不能导 + 交接单模板」，再让用户粘贴/上传，最后才写。
      // 为什么不做一键上传文件：宿主的文件选择要另一套接口，而这是一次性动作，
      // 让他把文本贴进来最省事，也不给插件多一条读文件的通路。
      const askImport = async () => {
        setImportBusy('ask'); setNote('')
        try {
          const i = await jget('/import')
          setImportInfo(i)
          // 模板只在第一次填进去，之后不再覆盖用户已经写的/贴的内容
          setImportText((cur) => (cur ? cur : (i.template || '')))
          setImportAsk(true)
        } catch (e) { setErr(e.message) } finally { setImportBusy('') }
      }
      const doImport = async () => {
        setImportBusy('go'); setNote(''); setImportNote('')
        try {
          const r = await jpost('/import', { text: importText })
          setImportAsk(false)
          // note 用 <pre class="ok"> 渲染，单行说完；细节放 importNote
          const bits = []
          if (r.name) bits.push(`${SELF_SHE}现在管你叫「${r.name}」`)
          // 「这次新放行几个」和「名单现在共几个」分开说：只报总数时，原来放行 3 个、
          // 交接单带 2 个（1 个重复）会写成「工具白名单 4 个」，像是这次带进来 4 个。
          if (r.toolsError) {
            // 写配置失败：tools 是交接单里写的那几个，一个都没放行。不能写成「这次新加 0 个」。
            bits.push(`工具白名单没写进去（${r.toolsError}），交接单里的 ${r.tools?.length ?? 0} 个工具这次都没放行，要的话到「插件」页的「${SELF_SHE}能用的工具」里自己加`)
          } else if (r.tools?.length) {
            const added = Array.isArray(r.toolsAdded) ? r.toolsAdded.length : 0
            bits.push(`工具白名单这次新加 ${added} 个，现在一共 ${r.tools.length} 个`)
          }
          setNote(`人设接过来了。${bits.length ? bits.join('，') + '。' : ''}从第 ${r.day} 天开始。`)
          setImportNote(S('她的人设下一轮就生效（身份是每轮现读的）。工具白名单存好也当场生效，不用重启。'))
          await load()
        } catch (e) {
          setImportNote(e.message)
        } finally { setImportBusy('') }
      }

      // 下载交接单模板（2026-10-27，用户 m04565）：
      // 用户的原话是「出一个导入人设的提示词模版，点一下下载到本地，然后可以拿给那个要导入
      // 人设的 ai 去写对应它自己的提示词」。所以模板不是给人照着填的表格，是一份**给对面 AI 的
      // 说明书** —— 上面写着怎么写、不要写什么，下面才是三节空表格。
      // 一键下载成 .md，直接丢给对面那个 AI 就行。
      const downloadTemplate = async () => {
        try {
          const i = importInfo?.template ? importInfo : await jget('/import')
          const tpl = i.template || ''
          if (!tpl) { setImportNote('没读到模板。'); return }
          if (typeof document === 'undefined' || typeof Blob === 'undefined') {
            setImportNote('这个环境不支持下载。'); return
          }
          const blob = new Blob([tpl], { type: 'text/markdown;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = '大肥鱼-交接单.md'
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
          setImportNote(S('交接单已下载。把它发给「现在养着她的那个 AI」，让它照着上面的说明填三节，填完再贴回这里。'))
        } catch (e) { setImportNote(e.message) }
      }

      const doReset = async () => {
        setBusy('reset'); setNote('')
        try {
          const r = await jpost('/reset', { confirm: 'reset' })
          setResetAsk(false)
          // issue #65：重开一局之后「能不能接别人养过的」要重新问服务器，
          // 不然界面还挂着重置前的 canImport:false。
          setImportInfo(null)
          // 没搬东西（movedTo 为空）只有一种情况：本来就没有档。不拿服务端的 note 当开头——
          // 它自己也说了一遍去哪叫醒，和下面那句叠在一起，按钮名字还是旧的。
          const head = r.movedTo ? `已重开。旧的都在：${r.movedTo}` : '已重开。本来就没有旧档，没有东西要搬。'
          // 单行：这个 note 用 <pre class="ok"> 渲染，换行会撑出一块绿色告示，不如一句话说清。
          // 2026-10-26（m01426 真机反馈）：重置会把新会话建出来，也会顺手叫一声，但**侧栏仍然看不见**——
          // 宿主的 sessionVisible 规则是「空白会话只有成为当前会话才显示」，而插件用 API 建的会话永远
          // 不会成为 current。实测只有用户自己点一次「叫醒大肥鱼」才会出现。所以提示以这一步为准，
          // 不再承诺「侧栏已经冒出」。
          const tail = r.freshError
            ? ` 新会话没建出来：${r.freshError}`
            : (r.retiredError
              ? ` 旧会话没收干净：${r.retiredError}。到「状态」页点一下「现在叫醒大肥鱼」，${SELF_SHE}开一次口，侧栏里才看得见新会话。`
              : S(' 侧栏这会儿还看不到她——到「状态」页点一下「现在叫醒大肥鱼」，她开一次口，「跟大肥鱼说话」才会出现在侧栏里。'))
          setNote(`${head}${tail}`)
        } catch (e) {
          setErr(e.message)
        } finally { setBusy('') }
      }

      // 会话被用户归档之后，插件不再自动重开（0.6.8）。必须有个明说的入口，
      // 否则「收起来」就真的变成「再也回不去」。它只建新会话，不动任何文件。
      const doRebuild = async () => {
        setBusy('rebuild'); setNote('')
        try {
          const r = await jpost('/home/rebuild', { confirm: 'rebuild' })
          if (!r.ok) setNote(`没搭成：${r.error || r.note || ''}`)
          else if (r.woke) setNote(S('搭好了，也叫了她一声——侧栏里等她说出第一句就会出现。'))
          else setNote(S('搭好了。到「状态」页点一下「现在叫醒大肥鱼」，她开一次口，侧栏里才看得见这条会话。'))
          await load()
        } catch (e) {
          setErr(e.message)
        } finally { setBusy('') }
      }

      const s = state
      const kv = (pairs) => h('div', { className: 'kv' },
        pairs.filter(Boolean).flatMap(([k, v]) => [h('b', { key: 'k' + k }, k), h('span', { key: 'v' + k }, v)]))

      // 时段行（2026-10-23 加）：三个时段用同样的控件，省得三处各写一遍还对不齐。
      // type=time 在浏览器里自带时间选择器；跨零点（22:00→02:00）是允许的，由服务端判定。
      const timeRow = (label, from, to, setFrom, setTo, hint) =>
        h('label', null, label,
          h('input', { type: 'time', value: from, onChange: (e) => setFrom(e.target.value) }),
          h('span', { className: 'dim' }, '到'),
          h('input', { type: 'time', value: to, onChange: (e) => setTo(e.target.value) }),
          hint ? h('span', { className: 'dim' }, hint) : null)
