      // ---- 云端备份那张卡 ----
      // 一个目标一条，每条自己带开关：挂掉一个不影响别的，这就是「降级」的最小单位。
      // 「选目录」这件事在桌面版能直接弹系统文件夹选择器（用户 m03310：不要让人手打路径）。
      // 但 web 版没有 window.__DSH_DIRECTORY_PICKER__，所以两条路都要留：
      // 有选择器就一颗按钮点开选；没有就把话说清楚，让他把路径贴进框里。
      const pickDirFor = async (setField) => {
        const p = globalThis.__DSH_DIRECTORY_PICKER__
        if (p && typeof p.pick === 'function') {
          try {
            const dir = await p.pick()
            if (dir) { setField('dir', String(dir)); return true }
            return false
          } catch { /* 用户取消或被拦，往下走手填 */ }
        }
        setCloudMsg('这里打不开文件夹选择器（网页版没有这个能力）。把文件夹的完整路径贴进上面那个框里，例如 D:\\我的网盘\\大肥鱼备份。')
        return false
      }

      const cloudField = (f, draft, setField) => {
        const v = draft?.[f.key]
        if (f.type === 'bool') {
          return Toggle({
            label: f.label,
            on: v !== false,
            onChange: (x) => setField(f.key, x),
            hint: f.hint || '',
          })
        }
        if (f.type === 'num') {
          return Num({
            label: f.label,
            value: v ?? f.dflt ?? 0,
            onChange: (x) => setField(f.key, Number(x)),
            min: f.lo ?? 0, max: f.hi ?? 999999,
            hint: f.hint || '',
          })
        }
        if (f.type === 'area') {
          return h('div', { className: 'fld' },
            h('div', { className: 'fl' },
              h('span', { className: 'flabel' }, f.label),
              f.hint ? h('span', { className: 'fhint' }, f.hint) : null),
            h('textarea', {
              value: String(v ?? ''),
              placeholder: f.placeholder || '',
              rows: 4,
              style: { width: '100%', fontFamily: 'inherit', fontSize: '12.5px' },
              onChange: (e) => setField(f.key, e.target.value),
            }))
        }
        // 目录只有一个地方要：folder 的 dir。给它一颗「选择文件夹…」+ 仍然可手填的框。
        const isDir = draft?.kind === 'folder' && f.key === 'dir'
        return h('div', { className: 'fld' },
          h('div', { className: 'fl' },
            h('span', { className: 'flabel' }, f.label),
            f.hint ? h('span', { className: 'fhint' }, f.hint) : null),
          h('div', { className: 'row', style: { alignItems: 'stretch' } },
            h('input', {
              type: 'text',
              value: String(v ?? ''),
              placeholder: f.placeholder || '',
              style: { flex: '1', minWidth: '200px' },
              onChange: (e) => setField(f.key, e.target.value),
            }),
            isDir
              ? h('button', {
                  type: 'button',
                  className: 'ghost',
                  onClick: () => { void pickDirFor(setField) },
                }, '选择文件夹…')
              : null))
      }

      const cloudKind = (k) => (cloudState?.kinds ?? []).find((x) => x.kind === k)
      const cloudDraftBody = cloudDraft
        ? h('div', { style: { marginTop: '12px', padding: '10px 0', borderTop: '.5px solid var(--dsw-alias-border-l2)' } },
            h('p', { className: 'grouphd' }, `${cloudDraft.id ? '改这个目标' : '加一个目标'}：${cloudKind(cloudDraft.kind)?.label || cloudDraft.kind}`),
            h('p', { className: 'hint' }, cloudKind(cloudDraft.kind)?.steps || ''),
            h('p', { className: 'hint' }, '密码类的框留空＝不改。要改才重新填；填了才会覆盖掉原来那个。'),
            ...(cloudKind(cloudDraft.kind)?.fields ?? []).map((f) => h('div', { key: f.key },
              cloudField(f, cloudDraft, (key, val) => setCloudDraft({ ...cloudDraft, [key]: val })))),
            h('div', { className: 'fld' },
              h('div', { className: 'fl' }, h('span', { className: 'flabel' }, '给它起个名'),
                h('span', { className: 'fhint' }, '留空就用这种方式的默认名，比如「一个文件夹」。')),
              h('input', {
                type: 'text', value: String(cloudDraft.name || ''), placeholder: '留空用默认名',
                onChange: (e) => setCloudDraft({ ...cloudDraft, name: e.target.value }),
              })),
            h('div', { className: 'row', style: { marginTop: '8px' } },
              h('button', { disabled: cloudBusy, onClick: () => saveTarget(cloudDraft, '存好了。') }, '存下来'),
              h('button', { disabled: cloudBusy, className: 'ghost', onClick: () => testCloudTarget(cloudDraft) }, '先测一下能不能连上'),
              h('button', { disabled: cloudBusy, className: 'ghost', onClick: () => { setCloudDraft(null); setCloudMsg('') } }, '算了')))
        : null

      // 云端备份（2026-11-14，用户 m01090）。
      // 2026-11-14 用户 m02555：三件事本来分成两张卡，读的时候要在两张卡之间来回找。
      // 「手动备份 / 自动备份 / 云端备份」其实是同一件事的三层，摆在一张卡里
      // 从近到远依次往下读才顺。所以这里不再是 group()，而是一段可以直接塞进卡里的内容块。
      const subCard = (title, ...items) => h('div', {
        style: { marginTop: '16px', paddingTop: '12px', borderTop: '.5px solid var(--dsw-alias-border-l2)' },
      }, h('p', { className: 'grouphd', style: { margin: '0 0 6px', fontSize: '12px' } }, title), ...items)

      // 云端每一处的动作：标题写成整句话，下面跟一句「它到底会做什么」（2026-11-14 用户 m04053：
      // 「这几个按钮根本搞不明白是干什么用的」）。两三个字的按钮就是让人猜，猜不出来就不敢点。
      const cloudAction = (label, hint, onClick) => h('div', { style: { margin: '8px 0' } },
        h('button', { disabled: cloudBusy, className: 'ghost', onClick }, label),
        h('p', { className: 'hint', style: { margin: '3px 0 0' } }, hint))

      const cloudBlock = h('div', null,
          h('p', { className: 'hint' }, '本地那一份永远先存，云端备份是本地文件损坏时候的兜底，以及提供一种便捷性。'),
          h('p', { className: 'hint' }, '默认关闭，启用需要先按照流程把下方的云端配置填完，测试通畅，才能打开开关。'),
          h('p', { className: 'hint' }, '只会送「带日子的历史档」，跟自动备份同一个节奏（默认一天一份）。「最新的」那份默认不送——半小时一刷新，等于半小时上传一个备份，会把网盘的免费额度烧光。'),
          // 2026-11-14 用户 m04003：这四个旋钮是同一层的四件事——送不送、多久送、连不连「最新」、
          // 每处留几份。原来竖着排四行，读完要上下扫四遍才拼得出「现在到底怎么在送」；
          // 摆成 2×2，左上「开不开」对着右上「多久」、左下「连不连最新」对着右下「留几份」。
          // 加密与渠道是下一层（锁不锁、送到哪儿），所以从第三行开始。
          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px 16px',
              alignItems: 'start',
              marginTop: '4px',
            },
          },
            h('div', null,
              Toggle({
                label: '往云端送',
                on: cloudOn,
                // 打不开的时候要说清是缺什么，不能只让开关回弹（用户 m02555 的原始反馈）。
                onChange: toggleCloudOn,
                hint: cloudOn ? '开着' : '关着',
              }),
              // 开关为什么没动，就写在开关正下方（m03127 用户：「关了之后点不开」）。
              cloudGate ? h('p', { className: 'hint', style: { color: 'var(--dsw-alias-label-warning, #b26a00)' } }, cloudGate) : null),
            Num({
              label: '多久送一次',
              value: cloudEvery,
              onChange: (v) => patchCloud({ everyDays: Number(v) }, () => setCloudEvery(v)),
              min: 1, max: 30, unit: '天',
              hint: '1 = 每天',
            }),
            Toggle({
              label: '「最新」那份也送',
              on: cloudLatestUp,
              onChange: (v) => patchCloud({ latestUp: v }, () => setCloudLatestUp(v)),
              hint: '默认关。开着的话每次刷「最新」都会往云端传一次（半小时一次），坚果云这类 1GB/月的额度会被烧光。',
            }),
            Num({
              label: '每个地方留几份',
              value: cloudKeep,
              onChange: (v) => patchCloud({ keep: Number(v) }, () => setCloudKeep(v)),
              min: 1, max: 60, unit: '份',
              hint: '这里（还有那个网盘里）只留最新的这么多份，更早的自动删掉。只删文件名是我们自己起的那种（大肥鱼-自动-…），那个目录里你放的其他文件一律不碰。',
            })),
          Toggle({
            label: '加密之后再送',
            on: cloudEncrypt,
            onChange: (v) => patchCloud({ encrypt: v }, () => setCloudEncrypt(v)),
            hint: S('强烈建议开着。包里有她的身份和你的 B 站凭据，网盘不是保险箱。'),
          }),
          h('div', { style: { marginTop: '8px' } },
            h('p', { className: 'grouphd' }, '加密口令'),
            // 2026-11-14 用户 m03579：这里原来会连着说两遍「没有口令就没法加密」——
            // 一遍是本行的手写文案，一遍是 passProblem 的原话。没设口令时只留 passProblem 那一句；
            // 设过了才用这句讲清「它在哪、丢了会怎样」。
            cloudState?.hasPass
              ? h('p', { className: 'hint' }, `已经设过了${cloudState.passHint ? `（提示：${cloudState.passHint}）` : ''}，指纹 ${cloudState.passFingerprint || ''}。它只存在这台机器上、不进任何一份备份——所以**丢了就真解不开**，自己记牢。`)
              : null,
            cloudState?.passProblem ? h('p', { className: 'hint' }, cloudState.passProblem) : null,
            h('div', { className: 'row' },
              h('input', {
                type: 'password', value: cloudPass, placeholder: '至少 8 个字符',
                style: { flex: '1', minWidth: '200px' },
                onChange: (e) => setCloudPass(e.target.value),
              }),
              h('button', { disabled: cloudBusy || !String(cloudPass).trim(), onClick: setCloudPassword }, '设成这个口令'),
              cloudState?.hasPass
                ? h('button', { disabled: cloudBusy, className: 'ghost', onClick: async () => { setCloudPass(''); await jpost('/cloud/pass', { pass: '' }).then(() => { setCloudMsg('口令清掉了。之后再传的就是明文——想清楚再这么做。'); return refreshCloud() }).catch((e) => setCloudMsg(`没清成：${e.message}`)) } }, '清掉口令')
                : null)),

          h('div', { style: { marginTop: '14px' } },
            h('p', { className: 'grouphd' }, '送到哪儿'),
            !cloudState
              ? h('p', { className: 'hint' }, '状态还没读到。')
              : (cloudState.targets?.length
                  ? h('div', null, ...cloudState.targets.map((t) => h('div', {
                      key: t.id,
                      style: { padding: '8px 0', borderTop: '.5px solid var(--dsw-alias-border-l2)' },
                    },
                      h('div', { className: 'row', style: { alignItems: 'center', gap: '8px' } },
                        h('span', { style: { flex: '1', minWidth: '160px' } }, `${t.name}（${t.label || t.kind}）`),
                        h('span', { className: 'dim' }, t.ready ? (t.enabled ? '在用' : '关着') : (t.problem || '还没填完'))),
                      t.pending
                        ? h('p', { className: 'hint' }, `上次没送成：${t.pending.why || '不知道什么原因'}。试了 ${t.pending.tries || 1} 次，下次 ${t.pending.nextAt ? new Date(t.pending.nextAt).toLocaleString() : '稍后'} 再试。`)
                        : null,
                      h('div', { className: 'row', style: { marginTop: '4px', alignItems: 'center' } },
                        h('button', {
                          disabled: cloudBusy,
                          className: 'ghost',
                          onClick: () => setCloudManage(cloudManage === t.id ? '' : t.id),
                        }, cloudManage === t.id ? '收起' : '管理这一处'),
                        cloudManage === t.id
                          ? null
                          : h('span', { className: 'hint' }, '要改设置、测连接、暂停、删掉、看云上存了什么，都在这颗里面。')),
                      cloudManage === t.id
                        ? h('div', {
                            style: { marginTop: '2px', paddingLeft: '10px', borderLeft: '.5px solid var(--dsw-alias-border-l2)' },
                          },
                          cloudAction(t.enabled ? '先停一停，别再往这儿送了' : '继续往这儿送',
                            t.enabled ? '只停这一处，别的地方照常送；云上已经传上去的那几份不会跟着删。'
                              : '它已经填完了，继续就是恢复往这儿送。',
                            () => saveTarget({ ...t, enabled: !t.enabled })),
                          cloudAction('改这里的设置',
                            '地址、账号、目录这些。密码类的框留空＝不改。',
                            () => { const d = { ...t }; for (const f of (cloudKind(t.kind)?.fields ?? [])) if (f.type === 'pass') d[f.key] = ''; setCloudDraft(d); setCloudMsg('') }),
                          cloudAction('看看现在还连得上吗',
                            '只测连通，不传任何东西，也不动云上已有的那几份。',
                            () => testCloudTarget(t)),
                          t.kind === 'smtp' ? null : cloudAction(
                            cloudRemoteLoading === t.id ? '正在问那边有哪些份……' : '看看云上已经存了哪几份',
                            '列出来之后能取回本机，也能就地恢复。',
                            () => viewCloudRemote(t)),
                          cloudAction(cloudDelConfirm === t.id ? '真的删掉' : '删掉这一处',
                            '只删这台机器上的这条配置；云上已经传上去的备份不会跟着消失，但这条配置要重新填一轮才能加回来。',
                            () => {
                              if (cloudDelConfirm !== t.id) { setCloudDelConfirm(t.id); return }
                              setCloudDelConfirm('')
                              removeTarget(t.id)
                            }))
                        : null)))
                  : h('p', { className: 'hint' }, '还没加任何一个地方。加好一个之后，每一处都会长出一颗「管理这一处」——改设置、测连接、暂停、删掉、看云上存了什么都在里面。')),
            h('div', { className: 'row', style: { marginTop: '10px' } },
              h('select', {
                value: kindChosen,
                onChange: (e) => setCloudNewKind(e.target.value),
                style: { flex: '1', minWidth: '160px' },
              }, ...(cloudState?.kinds ?? []).map((k) => h('option', { key: k.kind, value: k.kind }, k.label))),
              h('button', { disabled: cloudBusy || !kindChosen, onClick: () => { setCloudDraft(targetDraftOf(kindChosen)); setCloudMsg('') } }, '点击配置')),
            cloudDraftBody,
            cloudRemote
              ? h('div', { ref: cloudRemoteRef, style: { marginTop: '12px', padding: '10px 0', borderTop: '.5px solid var(--dsw-alias-border-l2)' } },
                  h('p', { className: 'grouphd' }, `「${cloudRemote.target?.name || cloudRemote.target?.kind}」那边现在有：`),
                  h('p', { className: 'hint' }, '云上放着的是加密过的（文件名后面多个 .enc），不是普通的 json。想拿回去：点「取到本机」会解开并放进备份文件夹，之后用上面「从备份恢复」导入；点「直接恢复」是就地换上这份档，不经过文件。'),
                  cloudRemote.items?.length
                    ? h('p', { className: 'hint' }, `${cloudRemote.items.length} 份，合计 ${(cloudRemote.items.reduce((s, it) => s + (Number(it.bytes) || 0), 0) / 1048576).toFixed(1)}MB。只算这个目录里的文件；git 历史另算，删旧份也不会让它变小。`)
                    : null,
                  cloudRemote.items?.length
                    ? h('div', null, ...cloudRemote.items.map((it) => h('div', { key: it.name, className: 'row', style: { gap: '8px', marginTop: '4px' } },
                        h('span', { className: 'dim', style: { flex: '1', minWidth: '180px' } }, `${it.name}${it.bytes ? `　${Math.max(1, Math.round(it.bytes / 1024))}KB` : ''}`),
                        h('button', {
                          disabled: cloudBusy,
                          className: 'ghost',
                          onClick: () => downloadFromCloud(cloudRemote.target, it.name),
                        }, '取到本机'),
                        h('button', {
                          disabled: cloudBusy,
                          className: 'ghost',
                          onClick: () => restoreFromCloud(cloudRemote.target, it.name),
                        }, '直接恢复'))))
                    : h('p', { className: 'hint' }, '还没有我们传上去的份。'),
                  h('div', { className: 'row', style: { marginTop: '6px' } },
                    h('button', { className: 'ghost', onClick: () => setCloudRemote(null) }, '收起')))
              : null),

          h('div', { style: { marginTop: '14px' } },
            h('p', { className: 'hint' }, cloudState
              ? (cloudState.enabled === false
                  ? '关着。开着之后按上面的节奏自动送。'
                  : (cloudState.due ? `这一份马上送（${cloudState.dueWhy}）。` : `下一份：${cloudState.dueWhy}。`))
                + (cloudState.newest ? `本地最新的一份是 ${cloudState.newest.name}。` : '本地还没有历史备份，先让自动备份攒一份。')
                + (cloudState.lastName ? `上次送上去的是 ${cloudState.lastName}。` : '')
              : '状态还没读到。'),
            h('div', { className: 'row', style: { marginTop: '8px' } },
              h('button', { disabled: cloudBusy || !cloudState?.targets?.some((t) => t.ready && t.enabled), onClick: cloudNow }, cloudBusy ? '正在送……' : '现在就送一份'),
              h('button', { disabled: cloudBusy, className: 'ghost', onClick: () => refreshCloud(true) }, '刷新状态')),
            cloudMsg ? h('p', { className: 'hint' }, cloudMsg) : null))

      const dataPage = h('div', { className: 'page' },
        group('数据在哪',
          '一个文件夹装全部。想备份、想搬走、想看原始记录，都在这一格里。',
          h('div', null,
            h('p', { className: 'dim' }, '文件夹里的「说明.md」写了每个文件是什么。'),
            h('div', { className: 'row' },
              h('button', {
                disabled: !dataPaths?.root,
                onClick: () => copyPath(dataPaths?.root || ''),
              }, dataPaths?.root ? '复制数据文件夹路径' : '路径还没读到')),
            moveCard)),

        // ---- 备份（2026-11-14，用户 m02555）----
        // 三件事在一张卡里，从近到远排：手上这一份 → 机器自己攒的那批 → 送到机器之外。
        // 原来「自动备份」和「云端备份」各占一张卡，读的人要在两张卡之间来回对照
        // 「哪个开关管哪个」；它们本来就是同一条链上的三层。
        // 用 groupFull 而不是 group：这张卡现在有三层，塞在一窄列里，
        // 「JSON 那一行」和「往云端填地址」都会挤成一条竖缝。整行宽才好读。
        groupFull('备份与恢复',
          S('备份是一份 json：事件流、配置、日记、她的房间、头像都在里面。换台机器，或者想重开一局之前，先存一份。'),
          // 2026-11-16，用户 m00979：这三个开关其实都同时管自动备份与云端备份——云端推的就是
          // 自动备份写出的那份文件。不先说明，读的人会以为云端另有一套、改这里不生效。
          h('p', { className: 'hint' }, '这一段三个开关同时管两个地方：自动备份，和云端备份——云端推的就是自动备份写出的那份文件，所以这里改了，云端那份也跟着变。手动「备份成一份文件」不看它们，永远是全量。'),
          // 2026-11-16，用户 m00712 / m00818：一个开关管两条无人值守的渠道（自动 + 云端），
          // 放在卡片最上面——用云端的人未必会展开「自动备份」那一段；云端推的就是自动备份
          // 写出的那份文件，本来就该同进同出，拆成两个开关只会长期不一致。
          // 手动「备份成一份文件」不归它管（那是当场按下、旁边写着后果的一次性动作）。
          Toggle({
            label: '自动备份与云端备份带上登录凭据',
            on: backupSecrets,
            onChange: (v) => {
              setBackupSecrets(v)
              void patchBackup({ withSecrets: v })
            },
            hint: '默认关：B 站登录 cookie、云端目标里的令牌 / 应用密码 / 授权码都会被擦成空值，恢复后重新贴一次就能接着用。自动备份会被网盘同步、云端再推一份，这两条路是最不该装账号的。「仅核心数据」模式下打开它，会把「主人资料」一并带上——B 站登录只存在那份文件里。',
          }),
          // 加密过的包（`.json.enc`）也能从这颗按钮进来（2026-11-14 用户 m03675）：
          // 他不接受「先去云端那一栏取一份」这条路——大多数人是网盘客户端先下到本地，
          // 文件落在哪儿、叫什么名字都有可能，导入按钮得自己认。
          h('p', { className: 'hint' }, '从网盘下载下来的 `.enc` 加密包也能直接选：这颗按钮不挑扩展名，认的是文件内容。'),
          h('div', null,
            h('p', { className: 'hint' }, '备份含会话压力的轮末采样和压缩配对读数。一般运行日志和旧备份会排除。'),
            // 手动这一颗始终是全量（2026-11-16，用户 m00712）：自动/云端的凭据开关不管它。
            // 备份能发出去、能放网盘，所以这件事要写在按钮旁边，不能只在迁移卡里提一句。
            h('p', { className: 'hint' }, '也含主人身份和 B 站登录凭据（登录过的话）。拿到这份文件就能用你的 B 站登录，别随手发给别人。自动备份与云端那份默认不带凭据，不受这里影响。'),
            backupMsg ? h('p', { className: 'hint' }, backupMsg) : null,
            restoreBad
              ? h('div', { style: { marginTop: '10px' } },
                  h('p', { className: 'dim' }, `这份备份里有 ${restoreBad.count} 个文本文件读出来是碎字（早先导出时丢过字节，不是这次弄坏的）：`),
                  h('p', { className: 'hint' }, someOf(restoreBad.files, restoreBad.count)),
                  h('p', { className: 'hint' }, '现在的档什么都没动。可以跳过这些文件、其余照常恢复；也可以先不动。'),
                  h('div', { className: 'row' },
                    h('button', { disabled: backupBusy, onClick: () => (restoreBad.obj && restoreBad.obj.__enc ? pushRestoreEnc(restoreBad.obj.buffer, true) : pushRestore(restoreBad.obj, true)) }, '跳过这些文件继续恢复'),
                    h('button', {
                      disabled: backupBusy,
                      className: 'ghost',
                      onClick: () => { setRestoreBad(null); setBackupMsg('') },
                    }, '先不动')))
              : null),

          // 第一层：手动备份（浏览器下载，全量、什么都不缺）。
          subCard('手动备份',
            h('div', { className: 'row' },
              h('button', { disabled: backupBusy, onClick: backupNow }, '备份成一份文件'),
              h('button', { disabled: backupBusy, onClick: restoreFromFile }, '从备份恢复')),
            h('p', { className: 'hint' }, '恢复不会覆盖删除：现在的档会整体改名到 dsh-fish-backups/pre-restore-<时间>，写坏了还能换回来。')),

          // 第二层：自动备份（2026-11-14，用户 m00002）。默认开着、每天一份、留 2 份。
          subCard('自动备份',
            h('p', { className: 'hint' }, '定时扫描数据有没有改动，有改动就存一份到数据文件夹的 backups 里。存几份可以在下面调。数据文件夹搬到哪，它就跟着存到哪。'),
            h('p', { className: 'hint' }, '自动备份不带 B 站封面缓存（out/covers）。上面手动备份仍然是全量，什么都不缺。'),
            h('p', { className: 'hint' }, '还有一份「最新的」：启动和退出 DSH 时各扫一次存储，中间也隔一阵看一眼，确保留在那的是最新的一份。'),
            Toggle({
              label: '定时备份',
              on: backupOn,
              onChange: (v) => patchBackup({ enabled: v }, () => setBackupOn(v)),
              // 按代码里真实的节奏写，别让人以为「定时」就是每分每秒都在存：
              // 兜底那一份是每 30 分钟看一眼（有新东西才刷），历史档按「多久存一份」走，
              // 启动首拍与退出前各强刷一次。
              hint: backupOn
                ? '开着：每半小时左右看一次数据有没有变，变了就刷「最新的」；带日子的那几份按下面设的天数存；每次打开、关掉 DSH 也各扫一次。'
                : '关着——不会自己存，点了也不会',
            }),
            // 两个数字框并排（2026-11-14 用户 m03310：「多久存一份，和留几份这两个按钮并排」）。
            // 它们是一件事的两面（多久一份 × 留几份），竖着排会白占两行高度。
            h('div', { className: 'row', style: { alignItems: 'flex-start' } },
              Num({
                label: '多久存一份',
                value: backupEvery,
                onChange: (v) => patchBackup({ everyDays: Number(v) }, () => setBackupEvery(v)),
                min: 1, max: 30, unit: '天',
                hint: '1 = 每天一份',
              }),
              Num({
                label: '留几份',
                value: backupKeep,
                onChange: (v) => patchBackup({ keep: Number(v) }, () => setBackupKeep(v)),
                min: 1, max: 60, unit: '份',
                hint: '多出来的自动删掉，只删它自己攒的那些；「最新的」那份不算在里头',
              })),
            Toggle({
              label: '自动备份与云端只保留核心数据',
              on: backupScope.coreOnly,
              onChange: (coreOnly) => {
                const next = { ...backupScopeRef.current, coreOnly }
                backupScopeRef.current = next
                setBackupScope(next)
                void patchBackup({ coreOnly })
              },
              hint: '保留事件流、设置、日记、身份和房间资料。云端那份跟着一起变，从新备份生效。恢复只会放回包内的文件。',
            }),
            Toggle({
              label: '自动备份与云端不含媒体与桥接附件',
              on: backupSkipAttachments,
              onChange: (v) => {
                setBackupSkipAttachments(v)
                void patchBackup({ skipAttachments: v })
              },
              hint: '跳过图片、电子书、音视频、压缩包和超过 4MB 的文件，以及 media、updates、home/.dsh-im 这些附件目录；云端那份也跟着变小。手动「备份成一份文件」不受影响。邮件目标塞不下时，靠它把包压小。',
            }),
            h('p', { className: 'hint' }, '「仅核心」模式下额外带上哪些：'),
            backupScope.coreOnly && [
              ['attachments', '微信附件'],
              ['media', '媒体'],
              ['outings', '外出产物'],
              ['updates', '更新包'],
              ['owner', '主人资料（含 B 站登录凭据）'],
            ].map(([key, label]) => {
              // 「带上登录凭据」一开，主人资料就跟着进包：B 站 cookie 只在那份文件里，
              // 而 config.json（云端目标令牌）本来就是核心文件，不带 owner.json 会变成
              // 「令牌进了包、cookie 没进」。这里显示成已带、点不动，别让人看着没勾却装了账号
              // （2026-11-16，用户 m00871）。
              const forced = key === 'owner' && backupSecrets
              return h('label', { key },
                h('input', {
                  type: 'checkbox',
                  checked: forced || backupScope.extras.includes(key),
                  disabled: forced,
                  onChange: (e) => {
                    if (forced) return
                    const cur = backupScopeRef.current
                    const extras = e.target.checked
                      ? [...cur.extras, key]
                      : cur.extras.filter((item) => item !== key)
                    const next = { ...cur, extras }
                    backupScopeRef.current = next
                    setBackupScope(next)
                    void patchBackup({ extras })
                  },
                }),
                forced ? '主人资料（含 B 站登录凭据，随上面那个开关一起带上）' : label,
              )
            }),
            h('p', { className: 'hint' }, autoState
              ? (autoState.count
                  ? `现在攒着 ${autoState.count} 份，一共 ${autoState.sizeText || ''}。${autoState.latest ? '最新的那份在。' : ''}${autoState.enabled === false ? '（已经关掉了，这些会一直留着）' : (autoState.due ? '这一份马上就存。' : `下一份：${autoState.dueWhy}。`)}`
                  : (autoState.latest
                      ? `只有最新那一份，${autoState.sizeText || ''}。${autoState.enabled === false ? '（已经关掉了）' : '攒够一天的还会另外留一份带日子的，能往回退得更远。'}`
                      : (autoState.enabled === false ? '还没存过。开着之后到点会自动存一份。' : '还没存过。打开 DSH 的这一拍就会存一份，之后到点再存。')))
              : '状态还没读到。'),
            // 1.0.3：这颗不再绑 GitHub Release 目标。POST /backup/auto 本身不依赖云端
            // （服务端两条腿都刷），没有云端目标也该能立刻留一份——README 里就是这么写的。
            h('button', { disabled: backupBusy, onClick: generateHistoryBackup }, '现在生成一份历史备份'),
            autoBackupResult && h('p', { role: 'status', className: 'hint' }, autoBackupResult),
            autoState?.items?.length
              ? h('div', null,
                  h('p', { className: 'hint' }, '现在留着这几份（新的在上面）：'),
                  ...autoState.items.slice(0, 5).map((it) => h('div', { key: it.name, style: { marginTop: '4px' } },
                    h('span', { className: 'dim' }, `${it.name}　${Math.max(1, Math.round((it.bytes || 0) / 1024))}KB`))))
              : null,
            // 存在哪儿：用户原话（m02795）「加一个提示说明这个备份存到了哪里，
            // 或者做成一个按钮，点击之后复制备份文件夹的路径，自己去文件管理器复制跳转」。
            // 两样都给：路径直接写在明面上，旁边一颗复制按钮（和「数据在哪」那张卡同一个 copyPath）。
            h('div', { className: 'row', style: { marginTop: '10px' } },
              h('button', {
                disabled: !autoState?.dir,
                className: 'ghost',
                onClick: () => copyPath(autoState?.dir || ''),
              }, autoState?.dir ? '复制备份文件夹路径' : '备份路径还没读到')),
            h('p', { className: 'hint' }, autoState?.dir
              ? `存在 ${autoState.dir}　——　粘到资源管理器地址栏回车就能打开。想拿一份出去，用上面「手动备份」。`
              : '存在哪个目录还没读到，刷新一下再看。')),

          // 第三层：送到机器之外（2026-11-14，用户 m01090）。
          // 2026-11-14 用户 m03310：这一段默认折叠，只留标题和一颗「点击配置」，
          // 点开才摊出那七八个字段、目标列表和口令区。多数人不用云端，
          // 一进来就该先看见「手动」「自动」这两层。
          h('div', { style: { marginTop: '16px', paddingTop: '12px', borderTop: '.5px solid var(--dsw-alias-border-l2)' } },
            h('div', { className: 'row', style: { alignItems: 'center', justifyContent: 'space-between' } },
              h('p', { className: 'grouphd', style: { margin: 0, fontSize: '12px' } }, '云端备份'),
              h('button', {
                type: 'button',
                className: 'ghost',
                onClick: () => setCloudOpen((x) => !x),
              }, cloudOpen ? '收起' : '展开')),
            cloudOpen ? cloudBlock : h('p', { className: 'hint', style: { marginTop: '6px' } },
              cloudState?.enabled
                ? `${(cloudState.targets ?? []).filter((t) => t.ready && t.enabled).length} 个地方在用。点「展开」看详细设置。`
                : '默认关着。点「展开」加一个地方（一个网盘同步目录最快，零注册），配好再打开。'))),

        groupFull('每日报告',
          S('她醒过的日子各有一份；点日期看那天的。'),
          !reports.dates.length
            ? h('p', { className: 'empty' }, S('还没有报告，她醒过一次之后才有。'))
            : h('div', null,
                h('div', { className: 'row', style: { marginBottom: '8px', flexWrap: 'wrap' } },
                  ...reports.dates.map((d) => h('button', {
                    key: d,
                    disabled: busy === 'rep',
                    onClick: async () => {
                      setBusy('rep')
                      try { setReports(await jget(`/reports?date=${d}`)) } catch (e) { setErr(e.message) } finally { setBusy('') }
                    },
                    style: d === reports.date ? { borderColor: 'var(--dsw-alias-state-business-primary)' } : undefined,
                  }, d))),
                h('div', { className: 'row', style: { flexWrap: 'wrap' } },
                  h('button', { onClick: () => setShowReport(!showReport) }, showReport ? '收起报告' : '展开报告'),
                  h('button', { onClick: downloadReport }, '导出报告'),
                  h('button', {
                    title: '点了只是把这个文件夹的路径复制到剪贴板（不会弹窗口）——粘到资源管理器地址栏回车就能打开。',
                    onClick: () => copyPath(dataPaths?.out || ''),
                  }, '查看文件夹')),
                showReport && reports.md ? h('pre', { style: { marginTop: '8px', maxHeight: '320px', overflow: 'auto' } }, reports.md) : null)),

        // ---- 运行日志导出 ----
        // 为什么单独一张卡：她某晚没说话、没刷站、没写日记，只看状态页是猜不出来的。
        // 三件事分开做——预览（小）、导出（大、纯文本、给 AI 看）、清空（单独一次点击）。
        group('运行日志导出',
          S('出问题时导出来发给开发者或 AI；不含 cookie 和她的原话。'),
          !logTail ? h('p', { className: 'empty' }, logBusy ? '读取中…' : '还没读。')
            : h('div', null,
                h('p', { className: 'hint' },
                  !logTail.exists
                    ? '还没有日志文件。插件启动一次之后才会有。'
                    : `${logTail.lines?.length || 0} 行 · 上限 ${Math.round((logTail.maxBytes || 0) / 1024 / 1024)}MB · 保留 ${logTail.keep || 0} 份`),
                logTail.lines?.length
                  ? h('div', { style: {
                      maxHeight: '104px', overflowY: 'auto', overflowX: 'hidden',
                      border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: '8px',
                      padding: '6px 8px',
                    } },
                    h('pre', null, logTail.lines.slice(-200).join(String.fromCharCode(10))))
                  : null),
          h('div', { className: 'row' },
            h('button', {
              onClick: () => {
                setLogBusy(true)
                jget('/log?lines=200').then(setLogTail).catch(() => {}).finally(() => setLogBusy(false))
              },
            }, logBusy ? '读取中…' : '刷新预览'),
            h('button', {
              onClick: () => { window.location.href = API + '/log/export?lines=300' },
            }, '导出日志'),
            h('button', {
              onClick: () => {
                if (!window.confirm('清空当前日志？轮转出的旧日志和导出过的文件不受影响。')) return
                jpost('/log/clear', {}).then(() => jget('/log?lines=40')).then(setLogTail).catch(() => {})
              },
            }, '清空日志')),
          h('p', { className: 'hint' }, S('导出的是纯文本：版本、自检结果、脱敏后的配置、日志末尾。没有 cookie，没有她说过的话。'))),

        importCard,

        // 宿主旧了（0.8.1）：比升级自检更基础——先告诉它为什么有个功能没反应。
        compatCard,
        hostCard,

        // 升级自检放在最上面：这类问题不报错，只表现为「升了没变」，得先看见它。
        upgradeCard,

        // 换家留痕（0.6.8）：只在「跟上次不一样」时出现。用户改了 cordis.patch.yml 的 root
        // 之后，侧栏会多一间屋、旧的还在——这里直接把两个路径并排摆出来，省得靠猜。
        state?.homes?.changed === true
          ? h('p', { className: 'hint' },
              `这次住的是 ${state.homes.to}；上一次在 ${state.homes.from}。换家不等于搬家——旧家的东西还在原地，没有并过来。`)
          : null,

        archivedCard,

        blockedCard,

        resetCard)

      const showTab = (id) => tab === id

      if (err && !state) {
        return h('div', { className: 'dfish' },
          h('h2', null, '大肥鱼'),
          h('p', { className: 'sub' }, '读不到状态。'),
          h('pre', { className: 'err' }, err))
      }

      return h('div', { className: 'dfish', ref: (el) => { topEl = el } },
        h('h2', null, '大肥鱼'),
        h('p', {
          className: 'sub',
          // issue #32：这个数字（counts.total = countEvents().real）从来不只是「她写的」——
          // 她读到的别人说法、开局那份起点、答你的话都在里面。日记不在：日记写在文件里，
          // 事件流只留一条 meta。以前文案写「她记下 N 条」，跟面板上「记下的事」一起被当成了
          // 「她写了 N 条」，于是永远对不上；#59 后续把页头改叫「记录」，跟记忆页同一个叫法。
          // 口径不改（改 real 的定义会动事件流语义与一堆派生数字），把话说清楚。
          title: S('事件流里除系统记账以外的条数：她自己写下的（判断、留话、改口、拒绝、梦这些）、对话里回你的话、她读到的别人说法、记下的你的原话、开局那份起点，还有冷落、申请、请求这类替她记下的事。日记写在文件里，每篇只在系统记录里留一行标记，不算在这里。'),
        },
          s ? `第 ${s.day} / ${s.growthDays} 天 · ${s.stageName} · 记录 ${s.counts.total} 条${s.counts.meta ? `，另有 ${s.counts.meta} 条系统记录` : ''}` : '读取中…'),
        err ? h('pre', { className: 'err' }, err) : null,
        note ? h('pre', { className: 'ok' }, note) : null,
        // 保存回执只是确认「存到了」，不占页签里的说明位（2026-10-29 用户）。
        autoNote ? h('p', { className: 'ok', style: { margin: '0 0 8px' } }, autoNote) : null,
        // 保存时被跳过的工具名（2026-10-31 issue #14）：和失败框分开——
        // 设置**存下去了**，只是名单里少了几个名字。悄悄少一个是更大的问题，所以必须说出来。
        droppedTools.length
          ? h('div', { className: 'card', style: { margin: '0 0 10px', borderLeft: '3px solid currentColor' } },
              h('div', null, `白名单里有 ${droppedTools.length} 个名字在这台机器上不存在，已经跳过：${droppedTools.join('、')}`),
              h('div', { className: 'dim', style: { marginTop: '4px' } }, '其它设置都存进去了。这些名字可能是以前装的插件留下的，也可能是拼错了。'),
              h('div', { className: 'row', style: { marginTop: '6px' } },
                h('button', {
                  onClick: () => {
                    // 名单里已经没有被丢掉的名字了（服务端存的就是干净那份），
                    // 这里只是把输入框草稿里可能还留着的字一起抹掉，然后收起这条提示。
                    const gone = new Set(droppedTools.map((n) => String(n)))
                    const keep = parseToolNames(toolsAllowText).filter((n) => !gone.has(n))
                    setToolsAllowText(keep.join(', '))
                    setDroppedTools([])
                  },
                }, '也从输入框删掉'),
                h('button', { style: { marginLeft: '8px' }, onClick: () => setDroppedTools([]) }, '知道了')))
          : null,
        // 保存失败是一个要处理的状态，不是提示：一句人话先说清「不是你填错了」，
        // 技术信息另起一行留给开发者，自己点掉。放在页签栏上方，不混进设置项里。
        saveFail
          ? h('div', { className: 'err', style: { margin: '0 0 10px' } },
              // 数字框只在失焦时才收回范围内；打字打到一半越界，也会落到这个框里。那时确实是数填错了。
              // 看的是这一次失败的原因（saveFailRange），不是渲染这一刻输入框里的数。
              h('div', null, saveFailRange
                ? '这个数超出了允许的范围，所以没存。改回下面括号里的范围就会自动再存；已经保存的内容没丢。'
                : '这一项没存上。不是你填错了——已经保存的内容没丢，调整之后再改一次就会重试；实在不行重启 DSH 看看。'),
              h('div', { className: 'dim', style: { marginTop: '4px' } }, `技术信息：${saveFail}`),
              h('div', { className: 'row', style: { marginTop: '6px' } },
                h('button', { onClick: () => setSaveFail('') }, '知道了')))
          : null,
        // 说了话、但系统通知弹不出来时，退到这里。点一下才收起来。
        bubble ? h('div', { className: 'card', style: { borderLeft: '3px solid currentColor' } },
          h('div', { className: 'dim' }, '大肥鱼跟你说话'),
          h('div', { style: { marginTop: '4px' } }, bubble),
          h('div', { className: 'row', style: { marginTop: '6px' } },
            h('button', { onClick: () => setBubble('') }, '知道了'))) : null,

        tabBar,
        // 数字被收进上下限的那句话（2026-11-15）。放在页签栏下面：不管在哪一页都看得见。
        numNote ? h('p', { className: 'hint', role: 'status', style: { margin: '0 0 8px' } }, numNote) : null,
        AUTO_SAVE_TABS.has(tab) ? h('p', { className: 'hint', style: { margin: '0 0 8px' } },
          tab === 'bili' ? '改完自动保存；uid 和昵称、B 站登录各有自己的保存键。' : '改完自动保存。') : null,
        // 2026-11-12（用户要求）：登录态放在页签顶部、紧跟这句提示，进「上网」第一眼就能看见；
        // 放进「B 站登录」组里要往下滚才看得到。只有明确过期才亮，不抢别的内容。
        tab === 'bili' && biliState && biliState.ok === false && biliState.state !== 'none'
          ? h('div', { className: 'biliwarn', style: { margin: '0 0 10px' } },
            h('strong', null, biliState.state === 'expired' ? 'B 站登录已过期' : '没连上 B 站'),
            h('span', null, biliState.state === 'expired'
              ? S('她发不了评论、也收不到 @，也查不了字幕（AI 字幕要登录）。请重新扫码，或粘贴一份新的 cookie。')
              : (biliState.note || '检查一下网络，或重新登录。')),
            h('button', {
              onClick: () => { jget('/bili/state').then(setBiliState).catch(() => {}) },
            }, '重新检测'))
          : null,

        showTab('now') ? nowPage : null,
        showTab('grow') ? growPage : null,
        showTab('home') ? homePage : null,
        showTab('bili') ? biliPage : null,
        showTab('memory') ? memoryPage : null,
        showTab('env') ? envPage : null,
        showTab('principle') ? principlePage : null,
        // 2026-11-16（用户 m03816）：原来自成一页的说明，现在挂在原理页最上面（WikiLink）。
        showTab('data') ? dataPage : null,
        showTab('feedback') ? feedbackPage : null,
        showTab('outing') ? outingPage : null,

        // 扫码浮层挂在最外面（不塞进设置页）：切页签时它要么还开着、要么已经关了，
        // 不能因为换了一页就留一张没人认领的码在宿主内存里。
        qrOverlay,
      )
    }

