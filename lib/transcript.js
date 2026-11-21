/**
 * transcript.js —— 把「她自己续写的对话记录」从正文里切掉（2026-11-11，W49）
 *
 * 症状（外部用户真机，dsh-fish 0.9.7-fix.1，两天内从 0% 爬到 19%）：
 *   她的回复末尾会往下接着写对话记录，形态是
 *     <她真说的话>
 *     user <凭空编的、对方「下一句」会说的话>
 *     assistant <她接着编的、自己「下一句」会说的话>
 *   后半段是纯虚构：对方没说过 those 话，有时连地名都是现编的
 *   （例：整条会话里只有她自己写出过「浙西川藏线」，下一轮她当既成事实用）。
 *
 * 为什么必须切（而不是「让她注意点」）：
 *   同一段正文有四个出口——`talk-recent.json` 的「上次我们说到这」、
 *   `events.jsonl` 的 `utterance`、`utterance` 进了 `wontCount`/`consistency`
 *   这些尺子、以及 `home.js` 问「上一个房间最后说了什么」。存下来又送回提示词，
 *   就是自增强：她每轮都看见自己以前这么写，于是越写越顺。这在源头才断得掉。
 *
 * 判据只认**行首标记**，不猜句式：
 *   - 行首（允许前置的空格、引用符 `>`、列表符、`#`、`-`）出现
 *     `user` / `assistant` / `human` / `用户` / `助手`；
 *   - 英文那几个后面必须跟冒号、行尾、或者「空格 + 非英文字母」——
 *     所以正常句子里的 `user experience`、`AI agent` 不会被当成标记；
 *   - 中文那两个只要在行首独立成词就算（真机用例是 `用户 嗯嗯`）。
 *
 * 两条纪律：
 *   - **只切不改写**：从标记那一行起整段丢掉，前面一个字符都不动。
 *     红线是「不许替她改写」，切尾巴是**少记一句**，改写是**替她说**。
 *   - 宁可少留一句真话，也不留下半句假话。假话会进账本、进提示词、
 *     下一轮被她自己引用；真话少一句，下一轮还在会话里。
 */

/** 行首允许的前缀：空格、引用、列表符、标题井号。 */
const LEAD = '(?:^|\\n)[ \\t>*+\\-#]*'

/** 中文标记：行首独立成词即可（真机形态是「用户 嗯嗯」，没有冒号）。 */
const CN = new RegExp(`${LEAD}(?:用户|助手)[ \\t]*(?=[:：\\s]|$)`, 'i')

/**
 * 英文标记：`user` / `assistant` / `human`。
 * `(?![a-z])` 挡住 `userland`、`assistants` 这类词；
 * 后面要么冒号、要么「空格 + 非英文字母」（`user 是的`）、要么行尾（`assistant` 独行）。
 */
const EN = new RegExp(
  `${LEAD}(?:user|assistant|human)(?![a-z])(?:[ \\t]*[:：]|[ \\t]+(?![A-Za-z])|[ \\t]*(?=\\n|$))`,
  'i',
)

/** 这段正文里有没有「行首对话记录标记」。给「要不要打一行日志」用。 */
export function hasTranscriptTail(text) {
  const raw = String(text ?? '')
  if (!raw) return false
  return CN.test(raw) || EN.test(raw)
}

/**
 * 从第一条行首标记切到结尾；没有标记就原样返回（**连空白都不动**）。
 *
 * 返回空串的意思是「这一步她没有正文」——只有整段都是标记时才会这样。
 *
 * @param {string} text
 * @returns {string}
 */
export function stripTranscriptTail(text) {
  const raw = String(text ?? '')
  if (!raw) return ''
  const at = firstMarkAt(raw)
  if (at < 0) return raw
  // 标记前面那半句是真话，留着；标记那行起全都不要。
  return raw.slice(0, at).replace(/[ \t]+$/, '').trimEnd()
}

/**
 * 第一条标记所在的**行首**下标；没有就是 -1。
 *
 * 流式清洗要拿这个下标当场截断，所以导出。
 *
 * @param {string} raw
 * @returns {number}
 */
export function transcriptStart(raw) {
  return firstMarkAt(String(raw ?? ''))
}

/** 第一条标记所在的**行首**下标；没有就是 -1。 */
function firstMarkAt(raw) {
  let best = -1
  for (const re of [CN, EN]) {
    const m = re.exec(raw)
    if (!m) continue
    // `(?:^|\n)` 吃掉了那个换行，切点得从换行之后开始，否则会多删一个空行。
    const at = m[0].startsWith('\n') ? m.index + 1 : m.index
    if (best < 0 || at < best) best = at
  }
  return best
}

/** 判据里的标记词。流式清洗要在 chunk 边界上认「半个词」，得知道有哪些。 */
export const MARK_WORDS = ['user', 'assistant', 'human', '用户', '助手']

/** 行首允许的前缀（与 LEAD 保持一致）。 */
const LEAD_ONLY = /^[ \t>*+?#-]*/

/**
 * 这一段**还没写完的行首**该压住多少字，等下一块拼上再判。
 *
 * 只在两种情形下压：这段尾巴本身是某个标记词的开头（`us` / `用户` 刚写了一半），
 * 或者恰好写完一个完整的标记词（后面可能跟 `s` 变成 `users`，也可能跟空格变成标记）。
 * 压住的量有上限，认不出来就一个字都不压、当场放行。
 *
 * @param {string} buf 从行首开始的这段尾巴
 * @returns {number} 要压住的尾部字符数（0 = 不用压）
 */
export function partialMarkTail(buf) {
  const raw = String(buf ?? '')
  if (!raw || raw.includes('\n')) return raw ? 0 : 0
  const lead = LEAD_ONLY.exec(raw)[0]
  const rest = raw.slice(lead.length)
  if (!rest) return 0
  const low = rest.toLowerCase()
  if (low.length > 12) return 0
  for (const w of MARK_WORDS) {
    if (w.startsWith(low)) return rest.length
  }
  return 0
}

/* ---------------------------------------------------------------------------
 * 第二个判据：末尾两个短段像「一个人的告别 + 另一个人的应答」（2026-11-21）
 *
 * 上面那套只认行首标记。外部报告（1.0.5 真机）里的另一次续写没有标记，
 * 只有空行分段：
 *
 *   …这次没有一个人扛得住，只能全部一起重来。
 *
 *   明天再和你玩吧，我得出门了
 *
 *   好，那你先忙。回来再接着聊。
 *
 * 第二段是「对方要走」，第三段是「自己应了一声」。两句都不是她说的话，
 * 却一起被记成了她的 utterance（进 talk-recent、进尺子、下一轮再读回来）。
 *
 * 为什么不按报告里那版泛判据做（末段短 + 以「好/嗯/行」开头）：报告人自己
 * 在 14261 条 assistant 消息里量过，泛判据命中 14 条，只有 1 条是真的，
 * 其余 13 条都是正常收尾（「那就这样，去睡。」「好了，你该走了。」）。
 * 那种筛子会在真话上误伤，所以这里把判据压到「一对告别」的形状本身：
 *
 *   1. 末尾正好两个段（空行分隔），各自只有一行、都不长；
 *   2. 前一段：第一人称（有「我」）+ 一个离场词；
 *   3. 后一段：应答词开头 + 有「你」（指那个要走的人）+ 一个回来/接着的词；
 *   4. 这两段前面还有真正文——整条回复只有这两段就不切，
 *      宁可留下一句可疑的话，也不把她整轮的话删成空。
 *
 * 只切不改写：从「要走」那一段的第一行起整段丢掉，前面一个字都不动。
 * ------------------------------------------------------------------------- */

/** 离场词：一个人要走了才会说自己去做的事。 */
const EXIT_WORDS = [
  '出门', '出去', '走了', '先走', '下线', '睡了', '去睡', '先睡',
  '先忙', '去忙', '忙别的', '不聊了', '回头聊', '晚安', '明天见',
  '先撤', '去吃饭', '去洗澡', '有点事', '下班',
]

/** 应答词：后一段是「应了一声」的开头。 */
const ACK_HEAD = /^(?:好|嗯|行|哦|噢|对|是|那)/

/** 回来/接着的词：后一段在跟对方约下一次。 */
const RETURN_WORDS = ['回来', '接着', '再聊', '回头', '继续', '明天', '下次', '等你', '再来', '再玩']

/** 两段各自最多这么长；再长就不是一句对白了。 */
const PAIR_MAX = 40

/** 这对告别前面至少要有这么多字的真正文。 */
const BODY_MIN = 10

/**
 * 按空行切段，带上每段第一个非空白字符的下标。
 * 只用于「末尾两段」的判断，不改变原文。
 */
function paragraphs(raw) {
  const out = []
  const push = (from, to) => {
    const seg = raw.slice(from, to)
    const text = seg.trim()
    if (!text) return
    out.push({ at: from + (seg.length - seg.trimStart().length), text })
  }
  const re = /\n[ \t\r]*\n/g
  let start = 0
  let m
  while ((m = re.exec(raw)) !== null) {
    push(start, m.index)
    start = re.lastIndex
  }
  push(start, raw.length)
  return out
}

/**
 * 末尾那对「告别 + 应答」从哪一行的行首开始；不是这个形状就是 -1。
 *
 * @param {string} text
 * @returns {number}
 */
export function twoVoiceTailStart(text) {
  const raw = String(text ?? '')
  if (!raw) return -1
  const ps = paragraphs(raw)
  if (ps.length < 3) return -1
  const b = ps[ps.length - 1]
  const a = ps[ps.length - 2]
  const body = ps.slice(0, -2).map((p) => p.text).join('\n')
  if (body.trim().length < BODY_MIN) return -1
  if (a.text.includes('\n') || b.text.includes('\n')) return -1
  if (a.text.length > PAIR_MAX || b.text.length > PAIR_MAX) return -1
  if (!a.text.includes('我') || !EXIT_WORDS.some((w) => a.text.includes(w))) return -1
  if (!ACK_HEAD.test(b.text) || !b.text.includes('你')) return -1
  if (!RETURN_WORDS.some((w) => b.text.includes(w))) return -1
  return a.at
}

/**
 * 切掉末尾那对「告别 + 应答」；不是这个形状就**原样返回**（连空白都不动）。
 *
 * @param {string} text
 * @returns {string}
 */
export function stripTwoVoiceTail(text) {
  const raw = String(text ?? '')
  if (!raw) return ''
  const at = twoVoiceTailStart(raw)
  if (at < 0) return raw
  return raw.slice(0, at).trimEnd()
}

/* ---------------------------------------------------------------------------
 * 第三个判据：正文里「续写」出宿主的时间头，再接整份提示词（2026-11-21）
 *
 * 又一次同族的漂移：她写完了真话没停，接着按「对话记录」往下写——先编一个
 * 下一轮的抬头（`Time sampled while preparing turn 51, step 1: …`），再把上下文
 * 里那份整份身份/提示词逐字默写出来（真机 4479 字）。这一段没有 `user` /
 * `assistant` 行首标记，也不是「告别 + 应答」，前两道判据都按设计放行，
 * 于是整段被当成她这一轮说的话记进了账本。
 *
 * 判据只钉**结构**，不认措辞（`unavailable. Ask the user to clarify.` 这句宿主
 * 真用过，按原文匹配两头都会错）：
 *   1. 行首（允许前置空格）出现 `Time sampled while preparing turn <n>, step <n>:`，
 *      或时间头的另两行 `Browser time zone for this request|call:` /
 *      `Elapsed since the preceding model-visible message:`；
 *   2. 从那一行起整段切掉。
 * 宿主自己的时间头不会出现在 assistant 正文里，所以「行首 + 这个结构」本身就是
 * 证据；句中提到它（`那行叫 Time sampled while preparing turn，我照着写就行`）
 * 不算，有回归用例。
 *
 * 只切不改写：假时间头前面那半句是真话，留着。宁可少留一句真话，也不留下
 * 半句假话——假时间头会进 `talk-recent`，下一轮被她当成「上一轮说过的话」引用。
 * ------------------------------------------------------------------------- */

/** 时间头的三行结构（只认出这三行，不看后面的值）。 */
const PROMPT_ECHO = [
  /^Time sampled while preparing turn \d+, step \d+:/,
  /^Browser time zone for this (?:request|call):/,
  /^Elapsed since the preceding model-visible message:/,
]

/** 身份文档的小节标题：只当软信号（她引用自己设定时也会出现这些行）。 */
export const IDENTITY_TITLES = [
  '## 你是谁',
  '## 现在',
  '## 这些天',
  '## 你不会做的',
  '## 你还不会的',
  '## 现在把话说清楚处',
  '## 现在能做什么',
]

/**
 * 正文里从哪一行开始是「编出来的时间头」；没有就是 -1。
 *
 * 逐行扫，命中在**行首**（允许前置空格）才算；句中出现不算。
 *
 * @param {string} text
 * @returns {number}
 */
export function promptEchoStart(text) {
  const raw = String(text ?? '')
  if (!raw) return -1
  const lines = raw.split('\n')
  let at = 0
  for (const line of lines) {
    const lead = (line.match(/^[ \t]*/) ?? [''])[0].length
    const head = line.slice(lead)
    if (PROMPT_ECHO.some((re) => re.test(head))) return at + lead
    at += line.length + 1
  }
  return -1
}

/**
 * 切掉「时间头 + 后面默写出来的提示词」；没有这个形态就**原样返回**。
 *
 * @param {string} text
 * @returns {string}
 */
export function stripPromptEcho(text) {
  const raw = String(text ?? '')
  if (!raw) return ''
  const at = promptEchoStart(raw)
  if (at < 0) return raw
  return raw.slice(0, at).trimEnd()
}

/**
 * 软信号：正文里出现几个身份文档的小节标题（整行完全相等才算）。
 *
 * 命中 **不**截断——`home\她的身份.md` 里本来就有这些标题，她引用自己设定时
 * 也会中。调用方只在 ≥2 时记一行日志，用来量这种形态出现的频率。
 *
 * @param {string} text
 * @returns {number} 命中的不同标题个数
 */
export function promptEchoHint(text) {
  const raw = String(text ?? '')
  if (!raw) return 0
  const seen = new Set()
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (IDENTITY_TITLES.includes(t)) seen.add(t)
  }
  return seen.size
}
