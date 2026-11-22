    // ---------------------------------------------------------------- 组件
    function FishSection() {
      useStyleOnce()
      const [state, setState] = useState(null)
      // 每次拿到 /state 都刷新一次；固定文案由 S() 在渲染时取当前值。
      // 「他」在配置里是合法取值，但界面守卫测试会逐字扫 client.js 的字符串字面量——
      // 这里写成转义，免得把「配置取值」误判成「要显示的文案」。
      const SELF_HE = '\u4ed6'
      const sp = state?.config?.self?.pronoun
      SELF_SHE = sp === '祂' ? '祂' : sp === SELF_HE ? SELF_HE : '她'
      const [beliefs, setBeliefs] = useState(null)
      const [diary, setDiary] = useState(null)
      const [browse, setBrowse] = useState(null)
      const [reports, setReports] = useState({ dates: [], date: null, md: '' })
      const [inbox, setInbox] = useState(null)
      const [home, setHome] = useState(null)
      // 请求事件（0.7.6，m01274）：她问过什么、答过什么。只在住所页用到。
      const [asks, setAsks] = useState(null)
      // 请求事件：在这里补答之后的提示（弹卡答过的就不写了）。
      const [askMsg, setAskMsg] = useState('')
      // 梦（2026-10-30 m02837，本机实验 A 案）：只在 .dev 下才取得到，公开版 404。
      const [dreams, setDreams] = useState(null)
      const [mem, setMem] = useState(null)
      // 规则与解禁（R3，2026-10-24）：四层规则 + 她提上来的那一张申请
      const [rules, setRules] = useState(null)
      const [st, setSt] = useState(null)
      const [rotateAfter, setRotateAfter] = useState(120)
      // 换新会话时带几轮原话过去（0 = 不带）。默认 3（2026-11-17 用户 m04639）。
      const [carryTurns, setCarryTurns] = useState(3)
      const [docBudget, setDocBudget] = useState(2800)
      // 0.9.7 T1：身份段里摆不摆「你最近说过的几句话」（默认开）
      const [echoOn, setEchoOn] = useState(true)
      const [beliefsShown, setBeliefsShown] = useState(3)
      // 旁听（A2，2026-10-30）：每几轮记一句你说过的话（0 = 不记）
      const [hearEvery, setHearEvery] = useState(3)
      // 记忆体检（0.7.6，2026-10-30 用户 m00342）：点一下才算，不自动跑。
      const [health, setHealth] = useState(null)
      const [healthBusy, setHealthBusy] = useState(false)
      const [toolsAllowText, setToolsAllowText] = useState('')
      const [toolsRestrict, setToolsRestrict] = useState(true)
      // 白名单草稿态（2026-10-24，用户要求）：输入框里的字先不提交，
      // 点「保存设置」才写盘——否则敲一半就被页面其它地方的保存带上去，拼错一个字母整条收窄失效。
      const [toolsAllowSaved, setToolsAllowSaved] = useState([])
      const [toolsKnown, setToolsKnown] = useState(null)
      // 看得见、但收窄挡不住的那些（own 层，比如 dsh-ops 的 ops_*）。白名单放行 = 守卫放行。
      const [toolsOwnLayer, setToolsOwnLayer] = useState([])
      // 这个进程里被兜底守卫真挡下来的工具（2026-11-04，issue #20）。
      // 进来之前它只活在日志里——而她答「这件事我做不到」的时候，用户唯一的线索就是这里。
      const [toolsBlocked, setToolsBlocked] = useState([])
      // 她自己本来就有的那几件（服务端给的真名单，不是界面硬编码）。
      const [toolsHerTools, setToolsHerTools] = useState([])
      // 只在特定场合才交给她的那几件（比如出门才用得上的 bring_back）。
      // 它们也是她的工具，只是不在家里的工具面里——单列一组，别让它们看起来像丢了。
      const [toolsHerScene, setToolsHerScene] = useState([])
      // 工具分组的展开状态（2026-11-04，用户反馈）：真机上一百多个名字全摊开，
      // 等于没有界面。默认全收起来，点哪个前缀才展开哪一组。
      const [toolsOpenFams, setToolsOpenFams] = useState({})
      const [toolsSaveNote, setToolsSaveNote] = useState('')
      const [toolsSaveErr, setToolsSaveErr] = useState('')
      // 运行日志（2026-10-24）：只在点开时才读，不参与 30 秒轮询。
      const [logTail, setLogTail] = useState(null)
      const [logBusy, setLogBusy] = useState(false)
      // 备份与恢复（2026-10-25）：只在数据页用，不进轮询。
      const [backupBusy, setBackupBusy] = useState(false)
      const [backupMsg, setBackupMsg] = useState('')
      // 迁移工作区（2026-10-28，用户 m06510）
      const [moveBusy, setMoveBusy] = useState(false)
      const [moveMsg, setMoveMsg] = useState('')
      const [moveAsk, setMoveAsk] = useState(false)
      const [moveTarget, setMoveTarget] = useState('')
      const [moveInfo, setMoveInfo] = useState(null)
      let topEl = null
      const [sayText, setSayText] = useState('')
      const [said, setSaid] = useState([])
      const [err, setErr] = useState('')
      const [busy, setBusy] = useState('')
      const [note, setNote] = useState('')
      // 设置界面重做（2026-10-23）：当前页 + 新增的几个环境项
      const [tab, setTab] = useState('now')
      const [pressure, setPressure] = useState(null)
      const [structureExperiment, setStructureExperiment] = useState({})
      const [requestExperiment, setRequestExperiment] = useState({})
      const [capacityExperiment, setCapacityExperiment] = useState({})
      const [pressureTab, setPressureTab] = useState('current')
      const [pressureOpen, setPressureOpen] = useState(false)
      const [pressureRefresh, setPressureRefresh] = useState(0)
      const [showPressureIds, setShowPressureIds] = useState(false)
      const [showUncheckedPressure, setShowUncheckedPressure] = useState(false)
      const [pressureSaving, setPressureSaving] = useState(false)
      const [pressureSelectionError, setPressureSelectionError] = useState(false)
      const [compositeExperiment, setCompositeExperiment] = useState({})
      const [trendConfig, setTrendConfig] = useState({})
      const [trendData, setTrendData] = useState({})
      const [trendLoading, setTrendLoading] = useState(false)
      const [trendFocus, setTrendFocus] = useState(null)
      async function selectPressureSession(id, selected) {
        setPressureSaving(true)
        setPressureSelectionError(false)
        try {
          await jpost('/session-pressure', { id, selected })
          setPressureRefresh(value => value + 1)
        } catch {
          setPressureSelectionError(true)
        } finally { setPressureSaving(false) }
      }
      useEffect(() => {
        if (tab !== 'memory' || !pressureOpen) return
        let active = true
        let inFlight = false
        const compositeQuery = '&composite=1'
        async function refresh() {
          if (!active || inFlight || document.visibilityState === 'hidden') return
          inFlight = true
          try {
            let result = await jget(compositeQuery ? '/session-pressure?composite=1' : '/session-pressure')
            if (active) setPressure(result)
            while (active && document.visibilityState !== 'hidden' && result?.usage?.pendingCount > 0) {
              result = await jget('/session-pressure?wait=1' + compositeQuery)
              if (active) setPressure(result)
            }
          } catch {
            if (active) setPressure({ failed: true })
          } finally { inFlight = false }
        }
        document.addEventListener('visibilitychange', refresh)
        void refresh()
        const poll = compositeQuery ? setInterval(refresh, 5000) : null
        return () => {
          active = false
          if (poll != null) clearInterval(poll)
          document.removeEventListener('visibilitychange', refresh)
        }
      }, [tab, pressureOpen, pressureRefresh])

      // 恢复撞上碎字文件时，后端回的「要你拿主意」那张清单（issue #65）：{ obj, files, count }。
      // 放在 tab 后面（上面的规矩）：测试按下标找 tab，别把它挤走。
      const [restoreBad, setRestoreBad] = useState(null)
      // 这几个放在 tab 后面：测试按下标找 tab（test/client.test.mjs），别把它挤走。
      // 这一局收窄真在管的那两份（/tools 的 allowNow / effective，issue #69 第 9 条）。
      // 她自己的工具按它分成「在手上」和「这一局不在手上」；null = 不知道，或收窄这一局没在管。
      const [toolsAllowNow, setToolsAllowNow] = useState(null)
      const [toolsEffective, setToolsEffective] = useState(null)
      // /tools 读没读成：'' 还没回来、'ok' 读到了、'fail' 没读成。
      // 拿不到名单要照实说，不能说成「她还没开过会话」。
      const [toolsLoad, setToolsLoad] = useState('')
      // /tools 回没回 allowNow 这一栏（回 null 也算回了）：没回就不知道这一局收窄在不在管，
      // 工具卡只能按开关说。skippedSure 跟自检同一个判据：false 时没下给 restrict 的名字
      // 说不准在不在她手上（宿主没给 visible），null = 还没真下过。
      const [toolsRunKnown, setToolsRunKnown] = useState(false)
      const [toolsSkippedSure, setToolsSkippedSure] = useState(null)
      const [growthDaysUi, setGrowthDaysUi] = useState(30)
      const [diaryKeep, setDiaryKeep] = useState(0)
      const [browseDeepRead, setBrowseDeepRead] = useState(6)
      // 评论区里别人的话（2026-10-24，用户 m02454）：默认开，每次最多留 1 条。
      const [browseVoices, setBrowseVoices] = useState(true)
      const [videoOn, setVideoOn] = useState(true)
      const [videoPerDay, setVideoPerDay] = useState(2)
      const [videoFrames, setVideoFrames] = useState(9)
      const [avoidMinDur, setAvoidMinDur] = useState(60)
      const [avoidMids, setAvoidMids] = useState('')
      const [sleepEvery, setSleepEvery] = useState(7)
      const [sleepKeep, setSleepKeep] = useState(12)

      // 生长环境（可编辑的那几项）
      const [absent, setAbsent] = useState(2)
      const [diaryVisible, setDiaryVisible] = useState(false)
      const [diaryEnabled, setDiaryEnabled] = useState(true)
      const [wakes, setWakes] = useState(1)
      const [eventsPerDay, setEventsPerDay] = useState(1)
      // 对话热窗（2026-11-15，用户 m00829）：他刚说完话的这几分钟里不叫醒。
      const [quietMin, setQuietMin] = useState(10)
      const [questionsPerDay, setQuestionsPerDay] = useState(1)
      // 主动说话（0.8.1 本机实验，.dev 专属）：她自己决定要不要开口。频率是上限，不是要求。
      const [proactiveOn, setProactiveOn] = useState(false)
      const [proactiveMax, setProactiveMax] = useState(2)
      // 2026-11-22（用户 m00851）：这个值现在按分钟存，默认 360（6 小时）。
      // 变量名还叫 Idle，是为了不把这条链上几十处引用一起翻掉。
      const [proactiveIdle, setProactiveIdle] = useState(360)
      // 「安静多久才搭话」停手 700ms 再存（issue #69）：等待中的那次，和盘上现在的值
      const proactiveIdleTimer = useRef(null)
      const proactiveIdleSaved = useRef(null)
      const [proactiveTools, setProactiveTools] = useState('')
      const proactiveToolsTimer = useRef(null)
      const [proactiveCompact, setProactiveCompact] = useState(true)
      const [proactiveSeen, setProactiveSeen] = useState(true)
  const [doingOn, setDoingOn] = useState(false)
  const [interestGateOn, setInterestGateOn] = useState(false)
  const [doingPerDay, setDoingPerDay] = useState(1)
  const [doingClasses, setDoingClasses] = useState('')
  const doingClassesTimer = useRef(null)
      // 2026-11-05（用户 m02634）：梦 / 主动性 / 兴趣 三个开关，默认全开。
      const [driveOn, setDriveOn] = useState(true)
      const [interestOn, setInterestOn] = useState(true)
      const [dreamEnabled, setDreamEnabled] = useState(true)
      // 1.0.7：他这句话碰到她的旧判断时，摆不摆那一行（lib/cue.js）。
      const [cueOn, setCueOn] = useState(true)
      // 空醒开关（0.9.0 公开）：醒来时没派活、桌上也没东西，她可以自己找点事做。
      const [selfWakeOn, setSelfWakeOn] = useState(true)
      const [avoidText, setAvoidText] = useState('')
      // 刷站（全是环境参数：她今天能不能出门、一次看见几条，不是她爱看什么）
      const [browseOn, setBrowseOn] = useState(true)
      // 2026-11-07（用户 m00365）：两颗开关是两件事——
      //   biliOn  = 她能不能自己出门看 B 站（bili_look / bili_watch / bili_speak）
      //   browseOn = 家里要不要按时间替她逛（安静刷，只记账不叫醒）
      const [biliOn, setBiliOn] = useState(true)
      // 2026-11-13（用户 m04422）：读字幕单独一颗开关。和上网总闸分开——
      // 可以让她看标题、看画面，但不想让她把整条视频的台词读下来。
      const [subOn, setSubOn] = useState(true)
      const [browsePerDay, setBrowsePerDay] = useState(1)
      const [browseTopN, setBrowseTopN] = useState(4)
      const [browseDanmaku, setBrowseDanmaku] = useState(6)
      // 请求节奏（issue #5）：服务器/机房 IP 需要放慢，家宽可以更快
      const [biliMinGap, setBiliMinGap] = useState(800)
      const [biliJitter, setBiliJitter] = useState(500)
      // 桌面提醒（P3-3 重写）：默认关，由他自己打开
      const [notifyOn, setNotifyOn] = useState(false)
      // 浏览器通知权限 + 弹不出来时的页面内气泡
      const [notifyPerm, setNotifyPerm] = useState('default')
      const [bubble, setBubble] = useState('')
      // 在 B 站说话（P4）：默认关。这是唯一会动她账号的功能。
      const [commentOn, setCommentOn] = useState(false)
      const [commentPerDay, setCommentPerDay] = useState(1)
      const [commentReplyPerDay, setCommentReplyPerDay] = useState(2)
      const [commentReplyTo, setCommentReplyTo] = useState(true)
      const [commentScanMin, setCommentScanMin] = useState(30)
      const [cm, setCm] = useState(null)
      // 有人 @ 她（2026-11-11）：默认关。这是别人在 B 站点名找她，不是她发东西。
      const [atOn, setAtOn] = useState(false)
      const [atEveryMin, setAtEveryMin] = useState(5)
      const [atPerDay, setAtPerDay] = useState(20)
      const [atOthers, setAtOthers] = useState(true)
      const [atOwnerWake, setAtOwnerWake] = useState(true)
      const [atStatus, setAtStatus] = useState(null)
      // B 站登录态（2026-11-12）：设置页打开时问一次，过期就在「上网」页亮红条。
      const [biliState, setBiliState] = useState(null)
      // 桥接投递口（2026-11-19，用户 m00805）：给外部桥用的本机口子，默认关。
      // 0 = 不开。填了端口就当场起来（/config 的保存分支会热更新），不用重启。
      const [bridgePort, setBridgePort] = useState(0)
      const [bridgeUrlLive, setBridgeUrlLive] = useState('')
      // 时段（2026-10-23 加）：醒来 / 上网 / 说话，三段各自可调
      const [wakeFrom, setWakeFrom] = useState('20:00')
      const [wakeTo, setWakeTo] = useState('23:00')
      // 上网时段没单独配 = 跟着醒来时段（issue #86 第 2 条），所以初值就是醒来那两个数
      const [browseFrom, setBrowseFrom] = useState('20:00')
      const [browseTo, setBrowseTo] = useState('23:00')
      const [commentFrom, setCommentFrom] = useState('20:00')
      const [commentTo, setCommentTo] = useState('23:00')
      // 重置
      const [resetInfo, setResetInfo] = useState(null)
      const [resetAsk, setResetAsk] = useState(false)
      // 导入别人养过的大肥鱼（2026-10-27，用户 m03170）
      const [importInfo, setImportInfo] = useState(null)
      const [importText, setImportText] = useState('')
      const [importAsk, setImportAsk] = useState(false)
      const [importBusy, setImportBusy] = useState('')
      const [importNote, setImportNote] = useState('')
      // 看过什么 / 自检 / 风控（2026-10-23 加）
      const [hist, setHist] = useState({ groups: [], total: 0 })
      // 2026-11-07（用户反馈）：初值从 localStorage 读回来，别再写死 14。
      const [histDays, setHistDays] = useState(readHistDays)
      // load() 的依赖是空数组，闭包里永远只有挂载时那个 histDays——凡是「现在这个天数」
      // 都得走 ref，不能直接读 state（改了也读不到）。
      const histDaysRef = useRef(histDays)
      // 当前选的天数没读到时的原因（issue #69）。这时列表里留着的要么是别的天数的、
      // 要么什么都没有，都不能当成「共 0 天」「还没有记录」摆出来。
      const [histErr, setHistErr] = useState('')
      // 列表里现在摆的是哪个天数的（读到才记）。已经摆着当前天数的，重读失败一次不收起来。
      const histShown = useRef(null)
      const [checks, setChecks] = useState(null)
      const [checking, setChecking] = useState(false)
      const [risk, setRisk] = useState(null)
      // 你不在的时候（2026-10-23 加）
      const [away, setAway] = useState(null)
      // 设置界面 2.0（2026-10-24）：观看历史分页 + 报告默认收起
      const [histPage, setHistPage] = useState(0)
      const [showReport, setShowReport] = useState(false)
      // 常见问题解答（2026-10-28 用户 m00416）：改成就地展开，不再开新窗口（见 feedbackPage 前的注释）
      const [faq, setFaq] = useState(null)
      const [faqOpen, setFaqOpen] = useState(false)
      const [faqNote, setFaqNote] = useState('')
      // 主人是谁 + B 站登录（2026-10-23 加）
      const [ow, setOw] = useState(null)
      const [owMid, setOwMid] = useState('')
      const [owName, setOwName] = useState('')
      const [owCookie, setOwCookie] = useState('')
      const [atOwner, setAtOwner] = useState(true)
      const [owNote, setOwNote] = useState('')
      // 2026-11-06（用户反馈）：领养人两格原来只有「B 站登录 → 粘贴 cookie」页签底部那一颗保存键，
      // 停在「领养人验证」这一组里根本找不到保存路径，停在扫码页签里那颗键更是连渲染都不渲染。
      // 这一组现在自带一颗，提示也写在这一组里，不再借用下面 cookie 那行的 owNote。
      const [owIdNote, setOwIdNote] = useState('')
      // 扫码登录（2026-11-01）：浮层里的这张码。
      // qr 只在浮层开着的时候有值；关掉就 drop，宿主那边攥着的 cookie 一起忘掉。
      const [owTab, setOwTab] = useState('qr')
      const [qr, setQr] = useState(null)
      const [qrBusy, setQrBusy] = useState(false)
      const [qrNote, setQrNote] = useState('')
      const [qrLeft, setQrLeft] = useState(0)
      // 数据文件夹的真路径。**只在内存里用，不上屏**（用户 m03440）。
      const [dataPaths, setDataPaths] = useState(null)
      // 自动备份（2026-11-14，用户 m00002）：定时把同一份包存进数据文件夹的 backups/。
      // 三个设置项走 patchGroup('backup', …) 单独提交，不挤进 buildConfig 那张整表——
      // 自动保存那条 useEffect 每 700ms 会比一次 cfgSig，多塞三项会让别的页签也跟着重发。
      const [backupOn, setBackupOn] = useState(true)
      const [backupEvery, setBackupEvery] = useState(1)
      const [backupKeep, setBackupKeep] = useState(2)
      const [autoBackupResult, setAutoBackupResult] = useState('')
      const [backupScope, setBackupScope] = useState({ coreOnly: false, extras: [] })
      // 自动备份默认不带附件（2026-11-15，用户 m01641）。
      const [backupSkipAttachments, setBackupSkipAttachments] = useState(true)
      // 自动备份与云端带不带凭据，默认不带（2026-11-16，用户 m00712）。
      const [backupSecrets, setBackupSecrets] = useState(false)
      // 范围用 ref 记一份：开关的 onChange 拿到的是上一次渲染的 backupScope，
      // 连点两个勾选时后一个会把前一个覆盖掉。
      const backupScopeRef = useRef({ coreOnly: false, extras: [] })
      const [autoState, setAutoState] = useState(null)
      // 云端备份（2026-11-14，用户 m01090）：本地存完再往用户自己的云上送一份。
      // 目标是一张列表，每个目标自己带开关——挂一个不影响别的，这就是降级的最小单位。
      const [cloudState, setCloudState] = useState(null)
      const [cloudOn, setCloudOn] = useState(false)
      const [cloudEvery, setCloudEvery] = useState(1)
      const [cloudKeep, setCloudKeep] = useState(3)
      const [cloudEncrypt, setCloudEncrypt] = useState(true)
      const [cloudLatestUp, setCloudLatestUp] = useState(false)
      const [cloudBusy, setCloudBusy] = useState(false)
      const [cloudMsg, setCloudMsg] = useState('')
      // 开关为什么打不开。单独一个 state，因为这句话要贴在开关**正下方**——云端这一层
      // 很长，塞在卡片最底下那句 cloudMsg 里，用户点了开关只看到它纹丝不动，等于没提示
      // （2026-11-14 用户反馈「关了之后点不开」）。
      const [cloudGate, setCloudGate] = useState('')
      const [cloudPass, setCloudPass] = useState('')
      // 正在编辑的目标：null=没展开；{id, kind, ...} 是一条草稿。
      // 新加的和改原来的共用这一份草稿，「还没存就测」也发它。
      const [cloudDraft, setCloudDraft] = useState(null)
      // 「加一个」下拉当前选中的类型。
      // 2026-11-14 用户反馈：一进页面下拉里明明显示着「一个文件夹」，按钮却是灰的，
      // 得先切到别的再切回来才行。原因是 state 初值是空串，而 select 的 value='' 不匹配
      // 任何 option 时浏览器会把第一项**画**出来——看着像选中了，值其实还是空的。
      // 所以这里不再拿裸 state 判禁用，取「用户选过就用他选的，没选过就用列表第一项」。
      const [cloudNewKind, setCloudNewKind] = useState('')
      const kindChosen = cloudNewKind || (cloudState?.kinds ?? [])[0]?.kind || ''
      // 「看云上那几份」：点开才去问，不在首屏拉——灾后换机才会用到，平时白花一次网络。
      const [cloudRemote, setCloudRemote] = useState(null)
      // 2026-11-16 issue #145：点完就把结果滚到眼前，并且让点的那颗按钮说清自己在忙。
      // 之前结果渲染在目标列表之后、按钮只加 disabled，点完看起来像没反应。
      const cloudRemoteRef = useRef(null)
      const [cloudRemoteLoading, setCloudRemoteLoading] = useState('')
      useEffect(() => {
        if (cloudRemote && cloudRemoteRef.current) {
          cloudRemoteRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }, [cloudRemote])
      // 云端那一段默认折叠（2026-11-14 用户 m03310：「默认折叠，只保留标题，点击打开后再显示详细设置」）。
      // 理由：云端有七八个字段、一张目标列表、口令区，一进来全摊开，会把上面「手动/自动备份」
      // 挤到一屏之外——多数人根本不用云端，先看见的应该是那两层。
      const [cloudOpen, setCloudOpen] = useState(false)
      // 「删」要按两下（2026-11-14 用户 m03925：一排五颗小按钮，他点着点着把云端目标删了都说不清点了哪颗）。
      // 第一下只把这一行的那颗变成「真的删掉」，第二下才动手；点别处/换行就复原。
      // 「先停一停」已经有退路（再点一下「继续往这里送」就回来），只有删是不可逆的，所以只给删加这一步。
      const [cloudDelConfirm, setCloudDelConfirm] = useState('')
      // 每一处的动作收进一颗「管理这一处」后面（2026-11-14 用户 m04053：
      // 「不要拿几个按钮，其次是隐藏那几个按钮，因为真的是一头雾水」）。
      // 五颗并排等于让人先猜一遍每颗是什么；现在默认只有一颗，点开才是一列**带整句说明**的动作。
      const [cloudManage, setCloudManage] = useState('')
      // 头像（2026-10-24）：插件不自带任何图片，谁用谁自己传一张
      const [avatarV, setAvatarV] = useState(0)
      const [avatarPresent, setAvatarPresent] = useState(false)
      const [avatarBytes, setAvatarBytes] = useState(0)
      const [avatarBusy, setAvatarBusy] = useState(false)
      const [avatarNote, setAvatarNote] = useState('')
      // 自动保存（2026-10-24 用户）：设置项改完就生效，不再需要滚到底点保存。
      const [autoNote, setAutoNote] = useState('')
      // 保存回执和保存失败是两件事，不许挤成一行（2026-10-29 用户：这两句没有联系，
      // 也不属于同类型的提示）。回执只是「存到了」的一句确认，两秒半自己消失；
      // 失败是一个要处理的状态，放在页签栏上方，一句人话 + 一行技术信息，自己点掉。
      // 尤其不能让失败去占「改完就生效」那条说明的位置——两句摆在一起自相矛盾。
      const [saveFail, setSaveFail] = useState('')
      // 这次失败是不是数字越界。失败框按这一次失败的原因选那句人话，不在渲染时现查输入框：
      // 越界的数还停在框里时，开关那几条单独提交也可能因为断网失败，那时说「数超出范围」就说错了原因。
      const [saveFailRange, setSaveFailRange] = useState(false)
      const failSave = (msg, range = false) => { setSaveFailRange(range); setSaveFail(msg) }
      const failRange = (bad) => failSave(`「${bad}」这个数不在允许范围里，所以没有写进去。`, true)
      // 2026-11-15（用户 m00274）：数字框被收进上下限时必须说一句。
      // 原来只在离开框时悄悄把 999 改成 12，用户看到数字自己变了，却不知道填的那个数没存进去。
      const [numNote, setNumNote] = useState('')
      const numNoteTimer = useRef(null)
      // 保存时被跳过的工具名（2026-10-31，issue #14 @ming-fish）。
      // 服务端不再因为一个「这台机器上没有的名字」把整张表拒掉，而是丢掉它、其余照存。
      // 丢掉的东西必须说出来——否则用户以为自己设的还在，实际悄悄少了一个。
      const [droppedTools, setDroppedTools] = useState([])
      const savedTimer = useRef(null)
      const flashSaved = () => {
        setAutoNote(`已保存 ${new Date().toTimeString().slice(0, 8)}`)
        // 开关、日记这几项是单独提交的：它们存上了，不等于框里那个越界的数也存上了。
        // 越界的数还在，失败框就接着说它（自动保存那边 cfgSig 没变，不会再查一次）。
        const bad = badNumber()
        if (bad) failRange(bad)
        else {
          const badWin = badWindow()
          if (badWin) failSave(badWin)
          else setSaveFail('')
        }
        clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setAutoNote(''), 2500)
      }
      // 首屏载入完先把基线记下来，否则一打开页面就会把刚读到的配置又写回去一遍。
      const baselinePending = useRef(true)
      const lastSaved = useRef('')
      // 日记三项单独提交（2026-10-28 用户反馈「开了『让我看日记』插件又自己关」）：
      // 记下最后一次动过它们的时刻，用来挡住紧接着的 load() 把旧值写回输入框。
      const diaryTouchedAt = useRef(0)
      // 还没回包的日记 patch 数量：有在飞的就不让 load() 覆盖输入框。
      const diaryPending = useRef(0)
      // 原理页两张图：点开看原图，滚轮缩放、按住拖动（2026-10-25 用户：插件里看不清）。
      const [zoom, setZoom] = useState(null)
      const dragRef = useRef(null)
      // 2026-10-25：单轮回复字数预算（0 = 不限，默认就不提任何长度要求）
      const [replyChars, setReplyChars] = useState(0)
      // 「纠正鱼八股」（1.0，用户 m04784）：默认关。开了之后私聊时她尽量把话挂到具体一句上。
      // 放在 tab 之后声明，免得把 tab 的 hook 下标再挪一次（client.test 里写死了下标）。
      const [anchorOn, setAnchorOn] = useState(false)
      // B 站登录提示卡：他点过「不用了」就别再出现（存进 config.ui）
      const [uiHintDismissed, setUiHintDismissed] = useState(false)
      // 检查更新（2026-10-25 用户要求）：null=还没查过，{...}=查过。
      // 只有点按钮才查，不自动轮询——她运行期不该操心自己是几号版本。
      const [upd, setUpd] = useState(null)
      const [updBusy, setUpdBusy] = useState(false)
      // 自带升级（2026-10-29 用户 m00203）：null=没在升，{phase,bytes,total,error,...}=在升。
      // 下载和安装都必须是你点过确认才发生，所以这里没有"自动开始"的路径。
      const [dl, setDl] = useState(null)
      // 日记翻页（2026-10-26 用户 m01201）：一天一页、日期多于一天才出翻页按钮。
      // 正文按天取（`/diary?day=…`），翻过的缓存进 ref，来回翻不重复请求。
      const [diaryDay, setDiaryDay] = useState(0)
      const diaryCache = useRef({})
      const diaryLoaded = useRef(false)
      const [, setDiaryTick] = useState(0)

      // 当前这天的正文没缓存就去取一次（一页一天，不预取；翻回去靠缓存）。
      const diaryDates = diary?.dates ?? []
      const diaryIdx = Math.min(Math.max(diaryDay, 0), Math.max(diaryDates.length - 1, 0))
      const diaryCur = diaryDates[diaryIdx] ?? null
      useEffect(() => {
        if (!diaryCur || diaryCache.current[diaryCur] !== undefined) return undefined
        let dead = false
        jget(`/diary?day=${diaryCur}`)
          .then((r) => {
            if (dead) return
            diaryCache.current[diaryCur] = r?.text ?? ''
            setDiaryTick((n) => n + 1)
          })
          .catch(() => {})
        return () => { dead = true }
      }, [diaryCur])

      useEffect(() => {
        if (!zoom) return undefined
        const onKey = (e) => { if (e.key === 'Escape') setZoom(null) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [zoom])

      // 扫码登录的轮询与倒计时（2026-11-01）。
      // 只在这张码还"活着"的时候转：waiting / scanned。走到 confirmed 就停手——
      // 后面要不要写盘由人决定，不该有东西在后台一直问。
      useEffect(() => {
        if (!qr || (qr.state !== 'waiting' && qr.state !== 'scanned')) return undefined
        const key = qr.key
        const tick = async () => {
          try {
            const r = await jget(`/bili/qr/status?key=${encodeURIComponent(key)}`)
            if (!r?.state) return
            setQr((prev) => {
              if (!prev || prev.key !== key) return prev
              const next = r.state === 'confirmed' ? 'confirmed' : r.state
              if (next === prev.state && !r.why && !r.note) return prev
              return {
                ...prev,
                state: next,
                note: String(r.why || r.note || ''),
                account: r.account ?? prev.account,
                canWrite: r.canWrite ?? prev.canWrite,
              }
            })
          } catch { /* 一次轮询失败不算数，下一次接着问 */ }
        }
        const id = setInterval(tick, 1_500)
        return () => clearInterval(id)
      }, [qr?.key, qr?.state])

      // 倒计时：只在浮层开着时走，纯本地算，不打扰宿主。
      useEffect(() => {
        if (!qr || !qr.expiresAt) return undefined
        const left = () => Math.max(0, Math.round((qr.expiresAt - Date.now()) / 1000))
        setQrLeft(left())
        const id = setInterval(() => setQrLeft(left()), 1_000)
        return () => clearInterval(id)
      }, [qr?.key, qr?.expiresAt])

      // 出门（用户 m07453）与请神（2026-10-28）两页的 state。
      // 必须写在这里：下面「读不到状态」会提前 return，return 之后再调 hook，
      // 第一次读 /state 失败时第二次渲染就少了这十几个 hook，React 直接抛错，
      // 整节连「读不到状态。」都显示不出来（issue #69）。
      const [outing, setOuting] = useState(null)
      const [outingBusy, setOutingBusy] = useState(false)
      const [outingMsg, setOutingMsg] = useState('')
      const [outingPick, setOutingPick] = useState('')
      const [outingEndAsk, setOutingEndAsk] = useState(false)
      // 回家卡上被取消勾选的条目 id（默认全勾 = 空数组）
      const [outingDrop, setOutingDrop] = useState([])
      // 复用同一趟（0.6.16，用户 m01613）：接着这个工作区上次那条会话。
      const [outingReuse, setOutingReuse] = useState(false)
      const [possess, setPossess] = useState(null)
      const [possessBusy, setPossessBusy] = useState(false)
      const [possessMsg, setPossessMsg] = useState('')
      const [possessPick, setPossessPick] = useState('')
      // 回家审查（m02241 第⑤条）：结束请神前先把这趟多出来的条目摆出来。
      // 默认全收下；取消勾选的会写成 possess-reject: 标记，之后派生时跳过。
      const [possessEndAsk, setPossessEndAsk] = useState(false)
      const [possessDrop, setPossessDrop] = useState([])

      // /config 灌进界面一次就加一。自动保存靠它在「盘上的值刚灌进来」那一帧重记基线：
      // /state 先回来、/config 后到，只在 /state 那一帧记基线的话，/config 一到界面就和基线不同，
      // 什么都没动也会整表回写一遍（issue #69）。值没变时 cfgSig 不变、effect 不跑，所以要单独一个数。
      const [cfgLoads, setCfgLoads] = useState(0)
      // cfgLoads 还是 0（/config 一次都没灌进来：打开页面时 /beliefs、/diary、/config、/browse
      // 有一个失败，Promise.all 整个拒掉）时，界面上除了 /state 带的那几项都还是初值，
      // 整表写下去会把盘上的 atOwner 写回 true、屏蔽词和工具白名单清空。这时不整表保存，用这句说清楚。
      const CFG_MISSING = '设置还没从盘上读全，这次不整表保存，免得拿界面上的初值盖掉盘上的设置。重新打开这一页再改。'
      // 「导出这一轮她读到的」（2026-11-13，用户 m04163）。放在最后声明：client.test
      // 里按 hook 下标找东西，新钩子只许往后加，不许插在中间。
      const [exportBusy, setExportBusy] = useState(false)
      const [exportNote, setExportNote] = useState('')
      // 她的东西（1.0.4）：她自己愿意留下的那些，只读、点开看正文。
      // 同样放在最后声明——上面那几条注释说的 hook 下标不能动。
      const [works, setWorks] = useState(null)
      const [workOpen, setWorkOpen] = useState(null)
      const [workMsg, setWorkMsg] = useState('')
      // 「这事已经过去了」的二次确认（2026-11-20 用户 m00849）：只存那一张卡的 id。
      // 点第一下只把确认框摆出来，按了「确定」才记账——这一笔写了撤不回来，
      // 所以要先把它的作用念清楚。同样放在最后声明：hook 下标不能往前挪。
      const [askDoneAsk, setAskDoneAsk] = useState('')
      // 字幕一次读多少（2026-11-21，用户 m01746 / issue #155）：'page' | 'whole'。
      // 只能加在 hook 列表末尾：test/client.test.mjs 按下标找 hook，往前挪会把别人错位。
      const [subRead, setSubRead] = useState('page')

      // 读一次「看过的视频」（issue #69）。回来时天数已经换了（在路上时用户又选了别的）就丢掉，
      // 别盖住新选的列表；当前这个天数没读到、列表里也不是这个天数的，就记下原因。
      const readHist = async (days) => {
        try {
          const r = await jget(`/history?days=${days}`)
          if (histDaysRef.current !== days) return
          histShown.current = days
          setHist(r)
          setHistErr('')
        } catch (e) {
          if (histDaysRef.current === days && histShown.current !== days) setHistErr(e.message)
        }
      }

      const load = useCallback(async () => {
        setErr('')
        // 重新读盘之后要重新记基线（撤销 / 刷新都走这里）。
        baselinePending.current = true
        // 工具名单（2026-11-04，issue #20）：以前只在点「保存设置」时才拉一次，
        // 于是页面一打开，分组清单永远是空的——用户看不出这台机器上到底有哪些工具，
        // 也看不出哪几个真被挡过。这里跟其它只读卡片一样静默失败，不影响别处。
        // 放在最前面单独发：排在 /state、Promise.all 后面时，前面哪一个失败它就不发，
        // 工具卡会一直停在「读取中」。
        const markToolsFail = () => setToolsLoad((v) => (v === 'ok' ? v : 'fail'))
        jget('/tools').then((r) => {
          // 回了个空体也算没读到（之前读到过就留着那份）。
          if (!r) return markToolsFail()
          setToolsKnown(Array.isArray(r.known) ? r.known : null)
          setToolsOwnLayer(Array.isArray(r.ownLayer) ? r.ownLayer : [])
          setToolsHerTools(Array.isArray(r.herTools) ? r.herTools : [])
          setToolsHerScene(Array.isArray(r.herSceneTools) ? r.herSceneTools : [])
          setToolsBlocked(Array.isArray(r.blocked) ? r.blocked : [])
          setToolsAllowNow(Array.isArray(r.allowNow) ? r.allowNow : null)
          setToolsEffective(Array.isArray(r.effective) ? r.effective : null)
          setToolsRunKnown(Object.prototype.hasOwnProperty.call(r, 'allowNow'))
          setToolsSkippedSure(typeof r.skippedSure === 'boolean' ? r.skippedSure : null)
          setToolsLoad('ok')
        }).catch(markToolsFail)
        try {
          const s = await jget('/state')
          setState(s)
          setAbsent(Number(s.config?.absenceAfterDays ?? 2))
          // 刚点过日记开关就别用服务端的旧值把它压回去（下面的 patchDiary 已经存过盘了）
          if (!diaryPending.current && Date.now() - diaryTouchedAt.current > 3000) {
            // 服务端没给这个字段（undefined）不等于 false，别把空值当成「关掉」写回界面
            const dv = s.config?.diary?.visible
            const de = s.config?.diary?.enabled
            if (typeof dv === 'boolean') setDiaryVisible(dv)
            if (typeof de === 'boolean') setDiaryEnabled(de)
          }
          setWakes(Number(s.config?.wakesPerDay ?? 1))
          setQuietMin(Number(s.config?.daily?.quietMin ?? 10))
          setEventsPerDay(Number(s.config?.daily?.events ?? 1))
          setQuestionsPerDay(Number(s.config?.daily?.questions ?? 1))
          // 主动说话（.dev 专属）：没这个字段就是没开过，保持默认关闭。
          const pr = s.config?.proactive
          if (pr && typeof pr === 'object') {
            setProactiveOn(pr.enabled === true)
            setProactiveMax(Number(pr.maxPerDay ?? 2))
            {
              // 新键按分钟；老配置只有 minIdleHours（小时），读的时候换算一次。
              const legacyHours = Number(pr.minIdleHours)
              const minutes = Number(pr.quietMinutes ?? (Number.isFinite(legacyHours) ? legacyHours * 60 : 360))
              setProactiveIdle(Number.isFinite(minutes) ? minutes : 360)
              proactiveIdleSaved.current = Number.isFinite(minutes) ? minutes : 360
            }
            setProactiveTools(Array.isArray(pr.sendTools) ? pr.sendTools.join(', ') : '')
            setProactiveCompact(pr.foldSilent !== false)
            setProactiveSeen(pr.idleCountsSeen !== false)
    setDoingOn(pr.allowDoing === true)
    setInterestGateOn(pr.interestGate === true)
    setDoingPerDay(Number(pr.consumePerDay ?? 1))
            setDoingClasses(Object.entries(pr.toolClasses && typeof pr.toolClasses === 'object' ? pr.toolClasses : {})
              .map(([k, v]) => `${k}=${v}`).join('\n'))
          }
          setDriveOn(s.config?.drive?.enabled !== false)
          setInterestOn(s.config?.interest?.enabled !== false)
          setDreamEnabled(s.config?.dream?.enabled !== false)
          setCueOn(s.config?.cue?.enabled !== false)
          setSelfWakeOn(s.config?.memory?.selfWake !== false)
          setEchoOn(s.config?.memory?.echo !== false)

          // 不再拉 /events（2026-11-02，用户 m00335）：这里取回来的 e.rows 只进了
          // setEvents，全文件没有一处渲染它——每 30 秒白拉 25 条事件（九成是后台记账）。
          // 想看账本原文去「数据」页，那里给的是路径，不靠这条轮询。
          const [b, d, c, br, ib, hm, pth] = await Promise.all([
            jget('/beliefs'),
            jget('/diary'),
            jget('/config'),
            jget('/browse'),
            jget('/inbox?limit=60').catch(() => null),
            jget('/home').catch(() => null),
            jget('/paths').catch(() => null),
          ])
          setBeliefs(b)
          setDiary(d)
          // 首天正文随 /diary 一起回来了，先灌进翻页缓存（省一次往返）。
          for (const it of d?.items ?? []) diaryCache.current[it.date] = it.text
          // 只有第一次载入才跳到最新一天：30 秒轮询不该把人正在看的那页弹走。
          if (!diaryLoaded.current) {
            setDiaryDay(0)
            diaryLoaded.current = true
          }
          setBrowse(br)
          setInbox(ib)
          setHome(hm)
          setDataPaths(pth)
          // 迁移工作区：只读她现在住哪、有多少东西（失败就只显示按钮，不影响别处）
          jget('/move').then(setMoveInfo).catch(() => {})
          // 自动备份现在攒了几份（失败就当还没攒过）
          jget('/backup/auto').then(setAutoState).catch(() => {})
          // 出门：现在在哪、有哪些工作区可去、说明卡确认过没有（失败就只显示空页）
          jget('/outing').then(setOuting).catch(() => {})
          // 云端备份（2026-11-14，用户 m01090）：目标、口令状态、上次推到哪。
          jget('/cloud').then(setCloudState).catch(() => {})
          // 请神：现在上身在哪条、哪些对话可以请（失败就只显示空卡）
          jget('/possession').then(setPossess).catch(() => {})
          // 请求事件：她问过什么、哪些还没答（失败就只显示空卡）
          jget('/ask').then(setAsks).catch(() => {})
          // 梦（本机实验）：公开版这条路由直接 404，失败就当没有这张卡
          jget('/dream').then(setDreams).catch(() => {})
          // 上下文与记忆：单独取，失败不影响其它卡片
          jget('/memory').then(setMem).catch(() => {})
          // 她以前看过什么 / 风控状态：都是只读，失败不影响其它卡片
          // 天数走 ref：load() 的依赖是空数组，读 state 只会读到挂载时那个值。
          // 晚到、失败怎么处理见 readHist（issue #69）。
          readHist(histDaysRef.current)
          jget('/risk').then(setRisk).catch(() => {})
          jget('/away').then(setAway).catch(() => {})
          // 头像元信息（有没有、多大）。没有就是空圈，不回落任何内置图。
          jget('/avatar/info').then((r) => {
            setAvatarPresent(Boolean(r && r.present))
            setAvatarBytes(Number(r && r.bytes) || 0)
          }).catch(() => {})
          // 规则与解禁（R3）：失败不影响其它卡片
          jget('/rules').then(setRules).catch(() => {})
          // 运行日志：失败就当没这回事（日志本身坏了不该拖垮设置页）
          jget('/log?lines=40').then(setLogTail).catch(() => {})
          // 她的东西（1.0.4）：只读清单，失败就当这栏还没东西。
          jget('/works?limit=30').then(setWorks).catch(() => {})
          // 报告：先拿日期列表，再取最新那天的正文（失败不影响其它卡片）
          jget('/reports').then(async (r) => {
            if (!r.dates?.length) return setReports(r)
            const one = await jget(`/reports?date=${r.dates[0]}`)
            setReports(one)
          }).catch(() => {})
          const cfg = c.config || {}
          setAbsent(Number(cfg.absenceAfterDays ?? 2))
          setWakes(Number(cfg.wakesPerDay ?? 1))
          setQuietMin(Number(cfg.daily?.quietMin ?? 10))
          setEventsPerDay(Number(cfg.daily?.events ?? 1))
          setQuestionsPerDay(Number(cfg.daily?.questions ?? 1))
          setAvoidText(((cfg.avoid?.keywords) || []).join('，'))
          // 2026-11-07（用户反馈 + m00365）：拆成两颗开关，各读各的闸门。
          // bili.enabled 管「她自己能不能出门看」；browse.enabled 管「家里会不会按时间替她逛」。
          // 以前合成一颗，关掉之后她照样能翻（甚至能看画面），用户看到的就是一颗假开关。
          setBiliOn(cfg.bili?.enabled !== false)
          setSubOn(cfg.bili?.sub !== false)
          // 一次读多少：老配置里没有这一项 = 'page'（最省的那档）。
          setSubRead(cfg.bili?.read === 'whole' ? 'whole' : 'page')
          setBrowseOn(cfg.browse?.enabled !== false)
          setBrowsePerDay(Number(cfg.browse?.perDay ?? 1))
          setBrowseTopN(Number(cfg.browse?.topN ?? 4))
          setBrowseDanmaku(Number(cfg.browse?.danmaku ?? 6))
          setBiliMinGap(Number(cfg.bili?.minIntervalMs ?? 800))
          setBiliJitter(Number(cfg.bili?.jitterMs ?? 500))
          setDriveOn(cfg.drive?.enabled !== false)
          setInterestOn(cfg.interest?.enabled !== false)
          setDreamEnabled(cfg.dream?.enabled !== false)
          setCueOn(cfg.cue?.enabled !== false)
          setSelfWakeOn(cfg.memory?.selfWake !== false)
          setEchoOn(cfg.memory?.echo !== false)
          setNotifyOn(cfg.notify?.enabled === true)
          setCommentOn(cfg.comment?.enabled === true)
          setCommentPerDay(Number(cfg.comment?.perDay ?? 1))
          setCommentReplyPerDay(Number(cfg.comment?.replyPerDay ?? 2))
          setCommentReplyTo(cfg.comment?.replyToReplies !== false)
          // 「评论开头 @ 你」也随整表提交，就得和别的项一样从 /config 读（issue #69）。
          // 以前只在下面 /owner 成功时才设，/owner 一失败，界面停在初值 true，
          // 下一次自动保存就把盘上关着的它写回 true。判据和 GET /owner 同一个。
          setAtOwner(cfg.comment?.atOwner !== false)
          setCommentScanMin(Number(cfg.comment?.scanEveryMin ?? 30))
          setBridgePort(Number(cfg.bridge?.port ?? 0))
          setAtOn(cfg.at?.enabled === true)
          setAtEveryMin(Number(cfg.at?.scanEveryMin ?? 5))
          setAtPerDay(Number(cfg.at?.perDayMax ?? 20))
          setAtOthers(cfg.at?.others !== false)
          setAtOwnerWake(cfg.at?.ownerWake !== false)
          setRotateAfter(Number(cfg.chat?.rotateAfter ?? 120))
          setCarryTurns(Number(cfg.chat?.carry ?? 3))
          setReplyChars(Number(cfg.chat?.replyChars ?? 0))
          setAnchorOn(cfg.chat?.anchor === true)
          setUiHintDismissed(cfg.ui?.ownerHintDismissed === true)
          setToolsAllowText((cfg.tools?.allow ?? []).join(', '))
          setToolsAllowSaved(Array.isArray(cfg.tools?.allow) ? cfg.tools.allow.map(String) : [])
          setToolsRestrict(cfg.tools?.restrict !== false)
          setDocBudget(Number(cfg.memory?.docBudget ?? 2800))
          setBeliefsShown(Number(cfg.memory?.beliefsShown ?? 3))
          setHearEvery(Number(cfg.memory?.hearEvery ?? 3))
          setGrowthDaysUi(Number(cfg.growthDays ?? 30))
          setDiaryKeep(Number(cfg.diary?.keepDays ?? 0))
          setBrowseDeepRead(Number(cfg.browse?.deepRead ?? 6))
          setBrowseVoices(cfg.browse?.voices !== false)
          setVideoOn(cfg.video?.enabled !== false)
          setVideoPerDay(Number(cfg.video?.perDay ?? 2))
          setVideoFrames(Number(cfg.video?.frames ?? 9))
          setAvoidMinDur(Number(cfg.avoid?.minDuration ?? 60))
          setAvoidMids(((cfg.avoid?.upMids) || []).join('，'))
          setSleepEvery(Number(cfg.memory?.sleepEveryDays ?? 7))
          setSleepKeep(Number(cfg.memory?.sleepKeep ?? 12))
          // 自动备份（2026-11-14，用户 m00002）：三项设置 + 现在攒了几份。
          // 状态取不到就当没有（数据页照常显示设置项，只是不列文件）。
          setBackupOn(cfg.backup?.enabled !== false)
          setBackupEvery(Number(cfg.backup?.everyDays ?? 1))
          setBackupKeep(Number(cfg.backup?.keep ?? 2))
          const scope = {
            coreOnly: cfg.backup?.coreOnly === true,
            extras: Array.isArray(cfg.backup?.extras) ? cfg.backup.extras : [],
          }
          backupScopeRef.current = scope
          setBackupScope(scope)
          setBackupSkipAttachments(cfg.backup?.skipAttachments !== false)
          setBackupSecrets(cfg.backup?.withSecrets === true)
          // 云端备份（2026-11-14，用户 m01090）：同样是单独提交，不进整表。
          setCloudOn(cfg.cloud?.enabled === true)
          setCloudEvery(Number(cfg.cloud?.everyDays ?? 1))
          setCloudKeep(Number(cfg.cloud?.keep ?? 3))
          setCloudEncrypt(cfg.cloud?.encrypt !== false)
          setCloudLatestUp(cfg.cloud?.latestUp === true)
          // 时段：醒来 / 上网 / 说话。坏值由服务端兜底，这里只做展示。
          const w0 = Array.isArray(cfg.window) ? cfg.window : ['20:00', '23:00']
          setWakeFrom(w0[0]); setWakeTo(w0[1])
          // 上网时段：没单独配（null）就是跟着醒来时段，界面上直接显示醒来那两个数。
          const b0 = Array.isArray(cfg.browse?.window) ? cfg.browse.window : w0
          setBrowseFrom(b0[0]); setBrowseTo(b0[1])
          const c0 = Array.isArray(cfg.comment?.window) ? cfg.comment.window : ['20:00', '23:00']
          setCommentFrom(c0[0]); setCommentTo(c0[1])
          // 盘上的值刚灌进界面：这一帧重记基线，不当成「改过了」再写回去（见 cfgLoads）。
          baselinePending.current = true
          setCfgLoads((n) => n + 1)
          // 读全了：之前那句「还没从盘上读全」不再成立，收起来（别的失败原因照留）
          setSaveFail((m) => (m === CFG_MISSING ? '' : m))
          // 说话状态：单独取，失败不影响其它卡片
          jget('/comment').then(setCm).catch(() => {})
          jget('/at').then(setAtStatus).catch(() => {})
          // 登录态：失败不打断别处，红条只在明确过期时出现。
          jget('/bili/state').then(setBiliState).catch(() => {})
          jget('/reset').then(setResetInfo).catch(() => {})
          // 主人是谁（uid / 昵称 / 有没有 cookie）。cookie 原文永远不下发。
          // 「评论开头 @ 你」只从上面的 /config 取，这里不再设：/owner 晚回来时带的是发请求
          // 那一刻盘上的值，会把用户刚拨过的开关翻回去，自动保存再把旧值写回盘（issue #69）。
          jget('/owner').then((o) => {
            setOw(o)
            setOwMid(String(o?.mid ?? ''))
            setOwName(String(o?.name ?? ''))
          }).catch(() => {})
        } catch (e) {
          setErr(e.message)
        }
      }, [])

      useEffect(() => { load() }, [load])

      // 切到住所页时重读一次她的东西（1.0.5）：她可能刚留下/改了一版，
      // 而 load() 只在整页打开时跑一次——不重读就得刷新页面才看得见。
      useEffect(() => {
        if (tab !== 'home') return
        jget('/works?limit=30').then(setWorks).catch(() => {})
      }, [tab])

      // 「查多久的记录」改了立刻重列（2026-11-07，用户反馈）。
      // 以前只 setHistDays，列表要等下一次整页刷新才可能变——而整页刷新又把这个值
      // 重置回 14，于是「改了没反应、关掉再开还是 14」两件事一起发生。
      const pickHistDays = useCallback(async (v) => {
        const n = Number(v)
        const days = HIST_DAYS_OPTIONS.includes(n) ? n : 14
        histDaysRef.current = days
        setHistDays(days)
        setHistPage(0)
        setHistErr('')
        storeHistDays(days)
        // 先选 90 再选 7，90 那次晚到时下拉框是 7、列表却是 90 天的：readHist 对不上就丢掉（issue #69）。
        // 只读卡片，失败不打断别处，只在这张卡里说没读到。
        await readHist(days)
      }, [])

      // 在线状态每 30 秒刷一次；页面在后台就不轮询（省电，也不制造无谓请求）。
      // 2026-10-23 加：他要能看见「醒了但没做什么」这种状态，而不是只有结果。
      useEffect(() => {
        let stop = false
        const peek = async () => {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          try { const r = await jget('/status'); if (!stop) setSt(r) }
          catch { if (!stop) setSt({ phase: 'offline', label: '离线', detail: '服务没开，或者插件没加载' }) }
        }
        peek()
        const t = setInterval(peek, 30_000)
        return () => { stop = true; clearInterval(t) }
      }, [])
