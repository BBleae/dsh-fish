      // ---------------------------- 数据 ----------------------------
      // 用户 m03440：原来的「危险」页改名「数据」。数据文件夹、每日报告、
      // 运行日志、重置本来就是一套动作——备份、搬走、出事把现场交出去、重开一局。
      // 界面上不出现绝对路径（那是他本机的用户名和盘符）。
      // 备份不是「复制路径」：一个真会动文件的动作，单独摆一张卡，
      // 免得用户把「复制数据文件夹路径」当成备份（那是两回事）。
      async function backupNow() {
        setBackupBusy(true)
        setBackupMsg('正在打包……')
        try {
          const b = await jget('/backup')
          const name = b.fileName || '大肥鱼-备份.json'
          const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }))
          const a = document.createElement('a')
          a.href = url
          a.download = name
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
          // skipped 只有真没装进去的文件，每条自带原因（超限、读不到……），报真实个数、列出名字：
          // 0.9.5 只列前 3 条再写「等」，owner.json、state.json 这种要紧的会被盖住。
          const skipped = Array.isArray(b.skipped) ? b.skipped : []
          const unlisted = Math.max(0, Number(b.skippedUnlisted) || 0)
          const missingCount = skipped.length + unlisted
          // 照规矩不带的目录在 excluded 里。顶层的 logs/、backups/ 卡片上已经写了「不含运行日志和旧备份」；
          // 可目录名在哪一层都认，她房间里叫 backups、node_modules 的文件夹也没带，这些要单独说，不能不声不响。
          const CARD_SAYS = ['logs/', 'backups/', 'dsh-fish-backups/']
          const quiet = (Array.isArray(b.excluded) ? b.excluded : []).filter((x) => typeof x === 'string' && !CARD_SAYS.includes(x))
          // 事件流不设上限，包可能比「从备份恢复」一次能收的大。导出时就说，不要等到恢复那天。
          const tooBig = b.fitsRestore === false
          setBackupMsg(
            `已导出「${name}」：${b.files?.length ?? 0} 个文件，约 ${Math.max(1, Math.round((b.bytes || 0) / 1024))}KB。`
            + (missingCount ? `有 ${missingCount} 个文件没打进包，恢复出来也不会有：${missingText(skipped, skipped.length, unlisted)}。` : '')
            + (quiet.length ? `另外，叫 logs、backups、node_modules 这类名字的文件夹照规矩不打包，这次没带：${quiet.slice(0, 10).join('、')}${quiet.length > 10 ? `，还有 ${quiet.length - 10} 个` : ''}。` : '')
            + (tooBig
              ? `这份包有 ${mbText(b.restoreBytes)}，「从备份恢复」一次最多收 ${mbText(b.restoreLimit)}，用它装不回去。换机器的话，直接把数据文件夹整个复制过去。`
              : ''),
          )
        } catch (e) {
          setBackupMsg(`备份失败：${e.message}`)
        } finally {
          setBackupBusy(false)
        }
      }

      // ---- 自动备份（2026-11-14，用户 m00002）----
      // 手动那颗是「下载一份带走」，这一层是「自己按时存一份在本地」——
      // 用同一个 collectBackup，所以存出来的东西能直接被「从备份恢复」吃回去。
      const refreshAuto = () => jget('/backup/auto').then(setAutoState).catch(() => {})
      async function patchBackup(patch, setLocal) {
        const before = { enabled: backupOn, everyDays: backupEvery, keep: backupKeep }
        if (setLocal) setLocal()
        try {
          await jpost('/config', { backup: patch })
          flashSaved()
          await refreshAuto()
        } catch (e) {
          failSave(e.message)
          // 存不进去就以盘上的为准回滚。不要用闭包里的旧值：连点两下时，第二次失败
          // 会把第一次成功的改动也一起抹回界面上（PR #142 审查发现的）。
          try {
            const cfg = await jget('/config')
            const b = cfg?.backup
            if (b) {
              setBackupOn(b.enabled !== false)
              setBackupEvery(Number(b.everyDays ?? 1))
              setBackupKeep(Number(b.keep ?? 2))
              const scope = {
                coreOnly: b.coreOnly === true,
                extras: Array.isArray(b.extras) ? b.extras : [],
              }
              backupScopeRef.current = scope
              setBackupScope(scope)
              setBackupSkipAttachments(b.skipAttachments !== false)
              setBackupSecrets(b.withSecrets === true)
            }
          } catch {
            setBackupOn(before.enabled)
            setBackupEvery(before.everyDays)
            setBackupKeep(before.keep)
            setBackupScope(backupScopeRef.current)
          }
        }
      }
      async function generateHistoryBackup() {
        setBackupBusy(true)
        setAutoBackupResult('正在生成历史备份……')
        try {
          const result = await jpost('/backup/auto', {})
          await refreshAuto()
          setAutoBackupResult('已生成「' + result.name + '」。')
        } catch (e) {
          setAutoBackupResult('备份失败：' + e.message)
        } finally {
          setBackupBusy(false)
        }
      }

      // ---- 云端备份（2026-11-14，用户 m01090）----
      // 本地那一份永远先存；这一层只负责「云端备份」。所以这里的失败从不影响本地。
      // 目标和开关都走 patchGroup('cloud', …) 单独提交，不进 buildConfig 那张整表。
      // 2026-11-14 用户反馈「刷新状态点了没变化」：原来只是重新拉一次、把同样的字重新写一遍，
      // 看上去当然没反应。现在刷完一定回一句「刷过了 + 当时看到什么 + 几点刷的」，
      // 哪怕状态一模一样，时间戳也会变——点了有没有生效是眼睛能确认的。
      const refreshCloud = async (say) => {
        try {
          // 列表刷新过就把「等第二下」的那颗复原：目标可能已经被删掉/换过，
          // 留着旧 id 会让下一行的「真的删掉」莫名其妙地亮着。
          setCloudDelConfirm('')
          // 目标可能已经被删掉/换过，展开的那一块也要跟着收起来（否则会在下一行莫名出现）。
          setCloudManage('')
          const st = await jget('/cloud')
          setCloudState(st)
          if (say) {
            const ts = new Date().toLocaleTimeString()
            const n = (st?.targets ?? []).filter((t) => t.ready && t.enabled).length
            const head = st?.enabled === false
              ? '刷过了：云端备份是关着的'
              : (n ? `刷过了：${n} 个地方在用` : '刷过了：没有一个地方在用')
            const tail = st?.lastName ? `，上次送上去的是 ${st.lastName}` : '，还没送过'
            const due = st?.enabled === false ? '' : (st?.due ? `。${st.dueWhy}，到点会送` : `。${st.dueWhy || '还没到点'}`)
            setCloudMsg(`${head}${tail}${due}（${ts}）`)
          }
          return st
        } catch (e) {
          if (say) setCloudMsg(`没刷成：${e.message}`)
          return null
        }
      }
      // 2026-11-14（用户反馈「点往云端送，点不开」）：原来把 setLocal 当成失败回调传进来，
      // 于是成功时谁也没去改 cloudOn——开关看起来纹丝不动。这里改成和 patchBackup 一样：
      // 先乐观地改界面，存不进去再退回盘上的值。
      async function patchCloud(patch, setLocal) {
        const before = { enabled: cloudOn, everyDays: cloudEvery, keep: cloudKeep, encrypt: cloudEncrypt, latestUp: cloudLatestUp }
        if (typeof setLocal === 'function') setLocal()
        try {
          await jpost('/config', { cloud: patch })
          flashSaved()
          await refreshCloud()
        } catch (e) {
          failSave(e.message)
          setCloudOn(before.enabled)
          setCloudEvery(before.everyDays)
          setCloudKeep(before.keep)
          setCloudEncrypt(before.encrypt)
          setCloudLatestUp(before.latestUp)
        }
      }
      // 打开「往云端送」之前先把「送到哪儿」检查一遍。没有可用目标时不开，并且当场说清楚
      // 该去哪儿配——否则用户只看到开关回弹，不知道是缺东西。
      //
      // 2026-11-14 用户反馈「关了之后点不开」：这句话原来写进卡片最底下那句 cloudMsg，
      // 而云端这一层很长，开关在顶部、回话在底部——点了看起来就是纹丝不动。现在单独一个
      // cloudGate，贴着开关显示。另外「关掉再开」还要多查一种：目标都在，但都被「先停一停」关了。
      function toggleCloudOn(v) {
        if (v) {
          if (!cloudState) {
            setCloudGate('云端状态还没读到。等一秒再点；总也读不到就点下面「刷新状态」看看接口通不通。')
            return
          }
          const ts = cloudState.targets ?? []
          if (!ts.length) {
            setCloudGate('还没有云端存储方式。先在下面「送到哪儿」加一个地方——「一个文件夹」最快，零注册：指一个目录，它正好是网盘客户端的同步目录就行。加好了这里就能打开。')
            return
          }
          const ready = ts.filter((t) => t.ready)
          if (!ready.length) {
            setCloudGate('下面列出的地方都还没填完。看它后面那句「还差：…」，点那一行的「管理这一处」→「改这里的设置」补齐，再回来打开。')
            return
          }
          if (!ready.some((t) => t.enabled)) {
            setCloudGate('有能用的地方，但都被「先停一停」关掉了。至少让一个回到「继续往这儿送」，这个总开关才打得开。')
            return
          }
        }
        setCloudGate('')
        patchCloud({ enabled: v }, () => { setCloudOn(v); setCloudMsg('') })
      }
      // 目标的增删改：走 /cloud/target 单独一条路由，不走整表提交。
      // 原因是密码类字段界面不回显，交上去是空串——整表提交会把已填好的令牌抹掉。
      async function saveTarget(draft, msg) {
        setCloudBusy(true)
        try {
          await jpost('/cloud/target', { target: draft })
          await refreshCloud()
          setCloudDraft(null)
          if (msg) setCloudMsg(msg)
        } catch (e) {
          setCloudMsg(`没存下来：${e.message}`)
        } finally {
          setCloudBusy(false)
        }
      }
      async function removeTarget(id) {
        setCloudBusy(true)
        try {
          await jpost('/cloud/target', { remove: id })
          await refreshCloud()
          setCloudMsg('删掉了。那个地方已经传上去的那几份不会自己消失，要清得去那边删。')
        } catch (e) {
          setCloudMsg(`没删成：${e.message}`)
        } finally {
          setCloudBusy(false)
        }
      }
      function targetDraftOf(kind) {
        const blank = { id: '', kind, name: '', enabled: true }
        for (const f of (cloudState?.kinds ?? []).find((k) => k.kind === kind)?.fields ?? []) {
          blank[f.key] = f.type === 'bool' ? Boolean(f.dflt) : (f.type === 'num' ? (f.dflt ?? 0) : '')
        }
        return blank
      }
      async function testCloudTarget(draft) {
        setCloudBusy(true)
        setCloudMsg('正在试……')
        try {
          const r = await jpost('/cloud/target/test', { id: draft?.id ?? '', target: draft })
          // 用户 m03310：通了之后要详细说清测到了什么、测不到什么。
          // 驱动那边每个 probe 都写好了这一句，原样端上来；只有它没写时才用保底话术。
          const where = r?.where ? `（${r.where}）` : ''
          setCloudMsg(r?.note ? `测过了${where}：${r.note}` : `测过了${where}，这一步是通的。`)
        } catch (e) {
          // 400 / 404 这种不是「没通」，是「还没配完 / 填错了」。原样把后端那句话端上来。
          setCloudMsg(`没通：${e.message}`)
        } finally {
          setCloudBusy(false)
        }
      }
      async function cloudNow() {
        setCloudBusy(true)
        setCloudMsg('正在往每个地方送……')
        try {
          const r = await jpost('/cloud/now', {})
          const ok = (r.results ?? []).filter((x) => x.ok).length
          const bad = (r.results ?? []).filter((x) => !x.ok)
          setCloudMsg(`送出去了：${r.name || '这一份'}，成功 ${ok} 个地方。`
            + (bad.length ? `没送成的：${bad.map((x) => `${x.name}（${x.why || '不知道什么原因'}）`).join('；')}。会自己重试。` : ''))
          await refreshCloud()
        } catch (e) {
          setCloudMsg(`没能送出去：${e.message}`)
        } finally {
          setCloudBusy(false)
        }
      }
      async function setCloudPassword() {
        const pass = String(cloudPass || '')
        setCloudBusy(true)
        try {
          const r = await jpost('/cloud/pass', { pass })
          setCloudPass('')
          setCloudMsg(r?.cleared ? (r.why || '口令清掉了。') : '口令设好了。它只存在这台机器上，不进任何备份。')
          await refreshCloud()
        } catch (e) {
          setCloudMsg(`口令没设成：${e.message}`)
        } finally {
          setCloudBusy(false)
        }
      }
      // 云上现在有哪些份。灾后换台机器、本机是空的时候，只剩这条路能数得清。
      async function viewCloudRemote(t) {
        setCloudBusy(true)
        setCloudRemoteLoading(t.id)
        setCloudMsg('正在问那边有哪些份……')
        try {
          const r = await jget(`/cloud/remote?id=${encodeURIComponent(t.id)}`)
          setCloudRemote({ target: t, items: r.items ?? [] })
          setCloudMsg(r.items?.length ? `那边有 ${r.items.length} 份。` : '那边还没有我们传上去的份。')
        } catch (e) {
          setCloudMsg(`数不回来：${e.message}`)
        } finally {
          setCloudBusy(false)
          setCloudRemoteLoading('')
        }
      }
      // 从云上取回来恢复：先取、再解（加密的话），最后走和「从备份恢复」同一条路。
      async function restoreFromCloud(t, name) {
        setCloudBusy(true)
        setCloudMsg('正在从云上取回这一份……')
        try {
          const r = await jpost('/cloud/restore', { id: t.id, name, pass: String(cloudPass || '') })
          setCloudMsg('')
          await viewRestoreResult(r)
          await refreshCloud()
        } catch (e) {
          setCloudMsg(`取不回来：${e.message}`)
        } finally {
          setCloudBusy(false)
        }
      }
      // 只下载、不恢复：解密之后落成一份普通的 .json 放进 backups/，
      // 这样「从云上取回来」和「从本地文件恢复」是同一种东西，用户不必理解 .enc。
      // 2026-11-14 用户 m03579：原来是只有「直接恢复」，没有「先拿下来」这条路。
      async function downloadFromCloud(t, name) {
        setCloudBusy(true)
        setCloudMsg('正在把那一份取下来……')
        try {
          const r = await jpost('/cloud/download', { id: t.id, name, pass: String(cloudPass || '') })
          setCloudMsg(`取下来了：${r.name}（${Math.max(1, Math.round((r.bytes || 0) / 1024))}KB），已经放进备份文件夹。${r.encrypted ? '在云上是加密的，取下来时用一个口令解开过了，所以这份是普通 json。' : ''}`)
          await refreshCloud()
          await refreshAuto()
        } catch (e) {
          setCloudMsg(`取不下来：${e.message}`)
        } finally {
          setCloudBusy(false)
        }
      }


      // 恢复成功之后那句回执：两条路（从本地文件、从云上取）共用同一套话，
      // 不然同一件事在两处慢慢说岔，用户会以为是两回事。
      function restoreReceipt(r) {
        const missing = Array.isArray(r.skipped) ? r.skipped : []
        const unlisted = Math.max(0, Number(r.skippedUnlisted) || 0)
        const missingCount = Math.max(Number(r.skippedCount) || 0, missing.length + unlisted)
        const badSkipped = Array.isArray(r.skippedBad) ? r.skippedBad : []
        return `已恢复 ${r.restored} 个文件。${r.quarantined ? `旧档整体封存在「${r.quarantined}」，没有删。` : ''}`
          + (badSkipped.length ? `按你说的，${badSkipped.length} 个碎字文件跳过了、没写回去：${someOf(badSkipped, badSkipped.length)}。` : '')
          + (missingCount ? `这份包导出时有 ${missingCount} 个文件没打进去，这次也没有恢复出来：${missingText(missing, missingCount - unlisted, unlisted)}。` : '')
          + S('重启 DSH 之后她才是这份档的样子。')
      }
      async function viewRestoreResult(r) {
        setBackupMsg(restoreReceipt(r))
      }

      // 这中间旧档、新档一个都没动（见 lib/backup.js 的 restoreBackup）。
      async function pushRestore(obj, skipBad) {
        setBackupBusy(true)
        setBackupMsg(skipBad ? '正在跳过那些文件继续恢复……' : '正在恢复……')
        setRestoreBad(null)
        try {
          const r = await jpost('/backup/restore' + (skipBad ? '?skipBad=1' : ''), obj)
          // 导出时就没打进包的文件，恢复出来也没有。照报成功会让人以为全回来了。
          // skipped 最多带前 200 条，个数以 skippedCount 为准。
          setBackupMsg(restoreReceipt(r))
        } catch (e) {
          const p = e && e.payload
          if (p && p.needDecision) {
            // 点名：哪个文件坏了，先让人看见，再问跳不跳。
            setRestoreBad({
              obj,
              files: Array.isArray(p.badFiles) ? p.badFiles : [],
              count: Math.max(Number(p.badCount) || 0, Array.isArray(p.badFiles) ? p.badFiles.length : 0),
            })
            setBackupMsg('')
          } else {
            setBackupMsg(`恢复失败：${e.message}`)
          }
        } finally {
          setBackupBusy(false)
        }
      }

      // 加密过的那份（`.json.enc`）：把原始字节直接交给后端解，前端不碰口令逻辑。
      // 为什么不先在本机解：解密要 node:crypto + 那份口令，客户端里一样都没有。
      async function pushRestoreEnc(buffer, skipBad) {
        setBackupBusy(true)
        setBackupMsg(skipBad ? '正在跳过那些文件继续恢复……' : '正在解开这份加密的备份……')
        setRestoreBad(null)
        try {
          const r = await fetch(API + '/backup/restore/enc' + (skipBad ? '?skipBad=1' : ''), {
            method: 'POST',
            // 口令可能含中文/符号，头里只能放 ASCII，所以编码一下；后端 decodeURIComponent 回来。
            headers: {
              'content-type': 'application/octet-stream',
              accept: 'application/json',
              ...(String(cloudPass || '').trim() ? { 'x-fish-pass': encodeURIComponent(String(cloudPass).trim()) } : {}),
            },
            body: buffer,
          })
          const j = await r.json().catch(() => ({}))
          if (!r.ok) {
            const err = new Error(j.error || `HTTP ${r.status}`)
            err.payload = j
            err.status = r.status
            throw err
          }
          setBackupMsg(restoreReceipt(j))
        } catch (e) {
          const p = e && e.payload
          if (p && p.needDecision) {
            setRestoreBad({
              obj: { __enc: true, buffer, skipBad },
              files: Array.isArray(p.badFiles) ? p.badFiles : [],
              count: Math.max(Number(p.badCount) || 0, Array.isArray(p.badFiles) ? p.badFiles.length : 0),
            })
            setBackupMsg('')
          } else if (/解不开|口令/.test(String(e.message))) {
            // 换台机器恢复时，这台机器上根本没有 cloud-key.txt，所以要人把口令给一次。
            // 不去弹 window.prompt：宿主里不一定有，而且焦点会被抢走。
            setBackupMsg('这份是加密的，但这台机器上没有对得上的口令，打不开。展开下面的「云端备份」，在「加密口令」那个输入框里粘上当时设的口令（提示会显示成指纹，不显示原文），再点一次「从备份恢复」就行。口令是真找不回来的——当时存在原来那台机器的数据文件夹里，叫 cloud-key.txt。')
          } else {
            setBackupMsg(`恢复失败：${e.message}`)
          }
        } finally {
          setBackupBusy(false)
        }
      }

      function restoreFromFile() {
        const el = document.createElement('input')
        el.type = 'file'
        // 2026-11-14 用户 m03709：原来只认 .json，网盘下载回来的 .json.enc 在文件对话框里
        // 根本看不见（不是灰的，是压根不列出来），人只会以为「选项里没有这个文件」。
        // 改成什么文件都能选——是不是备份由我们自己看内容判断，不该让文件对话框替我们筛。
        el.accept = ''
        el.onchange = async () => {
          const f = el.files && el.files[0]
          if (!f) return
          // 先看头 8 个字节：我们的加密包以 'DSHFISH1' 开头。
          // 不能只看扩展名——用户在网盘里改过名、或者下载工具加了后缀，扩展名靠不住。
          let head = null
          try {
            head = new Uint8Array(await f.slice(0, 8).arrayBuffer())
          } catch { head = null }
          const magic = head && head.length === 8 ? String.fromCharCode(...head) : ''
          if (magic === 'DSHFISH1') {
            let buf = null
            try {
              buf = await f.arrayBuffer()
            } catch (e) {
              setBackupMsg(`恢复失败：这个文件读不出来（${e.message}）。`)
              return
            }
            await pushRestoreEnc(buf, false)
            return
          }
          let obj = null
          try {
            const text = await f.text()
            try { obj = JSON.parse(text) } catch { throw new Error('这个文件不是 json，也不像加密过的备份（开头不是 DSHFISH1）。') }
          } catch (e) {
            setBackupMsg(`恢复失败：${e.message}`)
            return
          }
          await pushRestore(obj, false)
        }
        el.click()
      }

      // ---- 迁移工作区（2026-10-28，用户 m06510）----
      // 用户要的是：点一个按钮 → 选文件夹 → 全搬过去。
      // 文件夹选择优先用桌面端的原生选择器（宿主用 contextBridge 暴露的
      // `__DSH_DIRECTORY_PICKER__`）；web 模式下没有它，退回手输路径。
      async function refreshMove() {
        try { setMoveInfo(await jget('/move')) } catch { setMoveInfo(null) }
      }

      async function pickFolder() {
        try {
          const p = globalThis.__DSH_DIRECTORY_PICKER__
          if (p && typeof p.pick === 'function') {
            const dir = await p.pick()
            if (dir) setMoveTarget(String(dir))
            return String(dir || '')
          }
          // 没有原生选择器（web 模式、宿主没暴露）：原来点了什么都不发生，像是按钮坏了。
          setMoveMsg('这里打不开文件夹选择器。把文件夹的完整路径直接填进左边的框里，例如 D:\\大肥鱼。')
        } catch (e) {
          setMoveMsg(`打开文件夹选择器失败：${e.message}`)
        }
        return ''
      }

      async function askMove() {
        setMoveAsk(true)
        setMoveMsg('')
        await refreshMove()
      }

      async function doMove() {
        const target = String(moveTarget || '').trim()
        if (!target) { setMoveMsg('先选一个文件夹'); return }
        setMoveBusy(true)
        setMoveMsg('正在搬……东西多的话要等一会儿，别关窗口。')
        try {
          const r = await jpost('/move', { target })
          setMoveAsk(false)
          setMoveTarget('')
          setMoveMsg(
            `搬好了：${r.files} 个文件、约 ${Math.max(1, Math.round((r.bytes || 0) / 1024))}KB，现在在 ${r.to}。`
            + (r.oldDirMoved ? '老目录没删，改名收在旁边的 dsh-fish-backups 里。' : '老目录还在原处（改名没成功），确认无误后你可以自己删。')
            + S('重启 DSH 之后她才会在新位置醒过来；重启之前她记不下新的事（写入会被拒），请现在就重启。')
            + (r.stranded ? ` 侧栏旧会话没全清干净：${r.stranded}` : ''),
          )
        } catch (e) {
          setMoveMsg(`迁移失败：${e.message}`)
        } finally {
          setMoveBusy(false)
        }
      }

      const moveHint = moveInfo
        ? `现在住在 ${moveInfo.root}（${moveInfo.files} 个文件，约 ${Math.max(1, Math.round((moveInfo.bytes || 0) / 1024))}KB）${moveInfo.moved ? '——已经搬过一次了' : ''}。`
        : ''

      const moveCard = h('div', { style: { marginTop: '14px' } },
        h('div', { className: 'row', style: { alignItems: 'center', gap: '10px' } },
          h('button', { disabled: moveBusy, onClick: askMove }, '迁移工作区…'),
          h('span', { className: 'hint', style: { margin: '0' } }, '把大肥鱼的所有文件迁移至任何你想存放的地方')),
        !moveAsk
          ? (moveMsg ? h('p', { className: 'hint' }, moveMsg) : null)
          : h('div', { style: { marginTop: '10px' } },
              h('p', { className: 'dim' }, S('有些人不想让这些文件待在 C 盘，想挪到 D 盘、E 盘。搬的是整个数据文件夹：事件流、日记、她的房间、配置、登录凭据，全都在里面。')),
              h('p', { className: 'hint' }, '搬的是复制 + 逐文件核对字节数。老目录不会删，会改名收在同级的 dsh-fish-backups 里。'),
              h('p', { className: 'hint' }, S('搬完必须重启 DSH 才生效——她现在住哪是在启动时定下来的。搬完到重启之间她记不下新的事，所以搬完请马上重启。')),
              moveHint ? h('p', { className: 'hint' }, moveHint) : null,
              h('p', { className: 'dim' }, '选一个文件夹，会在里面建 dsh-fish 子目录（已有非空的 dsh-fish 不行）。已经放着一份档的文件夹（里面有 events.jsonl）也不行：会直接拒绝，两边什么都不动。'),
              h('div', { className: 'row' },
                h('input', {
                  type: 'text',
                  value: moveTarget,
                  placeholder: '例如：D:\\大肥鱼',
                  style: { flex: '1', minWidth: '220px' },
                  onChange: (e) => setMoveTarget(e.target.value),
                }),
                h('button', { disabled: moveBusy, onClick: pickFolder }, '选择文件夹…')),
              h('div', { className: 'row', style: { marginTop: '8px' } },
                h('button', { disabled: moveBusy || !moveTarget.trim(), onClick: doMove }, moveBusy ? '正在搬……' : '搬到这个文件夹'),
                h('button', { disabled: moveBusy, className: 'ghost', onClick: () => { setMoveAsk(false); setMoveMsg('') } }, '算了')),
              moveMsg ? h('p', { className: 'hint' }, moveMsg) : null))
