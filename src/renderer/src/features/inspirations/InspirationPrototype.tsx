// Throwaway question: which of three inspiration layouts best supports capture,
// finding an idea, and continuing it? Existing renderer route, ?variant=A|B|C.
import { useEffect, useRef, useState } from 'react'
import { PrototypeSwitcher, prototypeNames } from '../../components/PrototypeSwitcher'
import type { PrototypeVariant } from '../../components/PrototypeSwitcher'
import './inspiration-prototype.css'

type Idea = {
  id: string
  text: string
  date: string
  time: string
  topics: string[]
  additions: { text: string; time: string }[]
}
const seed: Idea[] = [
  {
    id: '1',
    text: '让桌面便签成为一个随手记录的入口，想到什么就先留下来。',
    date: '2026-10-28',
    time: '10:42',
    topics: ['myTodo', '记录体验'],
    additions: [
      {
        text: '不需要先选主题，也不要求一开始就想清楚。记录之后再慢慢整理。',
        time: '10月28日 10:48'
      },
      { text: '补充入口要始终可见。看完之前的想法，可以直接接着写。', time: '10月28日 11:06' }
    ]
  },
  {
    id: '2',
    text: '把每周反复出现的工作整理成习惯，减少每天重新规划的时间。',
    date: '2026-10-28',
    time: '09:35',
    topics: ['工作方法'],
    additions: []
  },
  {
    id: '3',
    text: '为积累了一段时间的灵感做一次回看，看看哪些想法开始有了共同方向。',
    date: '2026-10-28',
    time: '09:12',
    topics: ['记录体验'],
    additions: [
      { text: '先保留日期与主题两种入口，看看真实使用时更常用哪一种。', time: '10月28日 09:20' }
    ]
  },
  {
    id: '4',
    text: '给项目交接留一个很短的上下文：正在做什么、下一步是什么。',
    date: '2026-10-27',
    time: '16:20',
    topics: ['工作方法'],
    additions: []
  },
  {
    id: '5',
    text: '灵感可以同时属于多个主题，不用为了分类复制同一段内容。',
    date: '2026-10-26',
    time: '14:08',
    topics: ['myTodo', '记录体验'],
    additions: []
  },
  {
    id: '6',
    text: '把模糊的产品构想保留下来，等需要的时候再继续补充。',
    date: 'history',
    time: '',
    topics: [],
    additions: []
  }
]
const dateGroups = [
  '2026-10-28',
  '2026-10-27',
  '2026-10-26',
  '2026-10-25',
  '2026-10-24',
  '2026-10-23',
  '2026-10-22',
  'history'
]
const dateLabel = (key: string) =>
  key === '2026-10-28'
    ? '今天'
    : key === 'history'
      ? '历史灵感'
      : key === '2026-10-27'
        ? '昨天 · 10月27日'
        : `${Number(key.slice(5, 7))}月${Number(key.slice(8))}日`
const readVariant = (): PrototypeVariant => {
  const key = new URLSearchParams(location.search).get('variant')
  return key === 'B' || key === 'C' ? key : 'A'
}

export function InspirationPrototype() {
  const [variant, setVariant] = useState(readVariant)
  const [ideas, setIdeas] = useState<Idea[]>(() => structuredClone(seed))
  const [topics, setTopics] = useState(['myTodo', '记录体验', '工作方法'])
  const [view, setView] = useState<'date' | 'topic'>('date')
  const [expanded, setExpanded] = useState<string[]>(['2026-10-28'])
  const [activeGroup, setActiveGroup] = useState('2026-10-28')
  const [selection, setSelection] = useState<{ id: string; group: string } | null>({
    id: '1',
    group: '2026-10-28'
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [addition, setAddition] = useState('')
  const [picker, setPicker] = useState<string | null>(null)
  const [newTopic, setNewTopic] = useState('')
  const [notice, setNotice] = useState('示例数据 · 刷新后恢复')
  const capture = useRef<HTMLInputElement>(null)
  const selected = ideas.find((idea) => idea.id === selection?.id)
  const groups = (view === 'date' ? dateGroups : [...topics, '未归主题']).map((key) => ({
    key,
    label: view === 'date' ? dateLabel(key) : key,
    items: ideas.filter((idea) =>
      view === 'date'
        ? idea.date === key
        : key === '未归主题'
          ? !idea.topics.length
          : idea.topics.includes(key)
    )
  }))
  const changeVariant = (value: PrototypeVariant) => {
    const url = new URL(location.href)
    url.searchParams.set('variant', value)
    history.replaceState(null, '', url)
    setVariant(value)
  }
  useEffect(() => {
    const pop = () => setVariant(readVariant())
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  const update = (id: string, fn: (idea: Idea) => Idea) =>
    setIdeas((items) => items.map((idea) => (idea.id === id ? fn(idea) : idea)))
  const toggleView = (next: 'date' | 'topic') => {
    setView(next)
    setExpanded(next === 'date' ? ['2026-10-28'] : [])
    setActiveGroup(next === 'date' ? '2026-10-28' : topics[0])
    setSelection(null)
    setPicker(null)
  }
  const toggleTopic = (idea: Idea, topic: string) => {
    update(idea.id, (item) => ({
      ...item,
      topics: item.topics.includes(topic)
        ? item.topics.filter((t) => t !== topic)
        : [...item.topics, topic]
    }))
    setNotice('已更新主题 · 仅本次预览')
  }
  const rename = (key: string, name: string) => {
    const value = name.trim()
    if (!value || value === key || topics.includes(value)) return
    setTopics((items) => items.map((t) => (t === key ? value : t)))
    setIdeas((items) =>
      items.map((i) => ({ ...i, topics: i.topics.map((t) => (t === key ? value : t)) }))
    )
    setExpanded((items) => items.map((t) => (t === key ? value : t)))
    if (activeGroup === key) setActiveGroup(value)
    if (selection?.group === key) setSelection({ ...selection, group: value })
  }
  const choose = (idea: Idea, group: string) => {
    setSelection(
      selection?.id === idea.id && selection.group === group ? null : { id: idea.id, group }
    )
    setAddition('')
    setPicker(null)
  }
  const detail = (inline = false) =>
    selected && (
      <aside className={`ip-detail ${inline ? 'ip-inline-detail' : ''}`} aria-label="灵感详情">
        <header>
          <span>{inline ? '继续这个想法' : '灵感详情'}</span>
          <button onClick={() => setSelection(null)} aria-label="返回灵感列表">
            {inline ? '收起 ↑' : '← 返回列表'}
          </button>
        </header>
        <div className="ip-detail-scroll">
          {!inline && (
            <>
              <p className="ip-eyebrow">
                原始想法 · {dateLabel(selected.date)} {selected.time}
              </p>
              <p className="ip-original">{selected.text}</p>
              <div className="ip-tags">
                {selected.topics.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </>
          )}
          <h3>
            补充 <small>{selected.additions.length}</small>
          </h3>
          {selected.additions.length ? (
            selected.additions.map((item, index) => (
              <div className="ip-addition" key={index}>
                <time>{item.time}</time>
                <p>{item.text}</p>
              </div>
            ))
          ) : (
            <p className="ip-muted">还没有补充，接着写一点。</p>
          )}
        </div>
        <form
          className="ip-append"
          onSubmit={(event) => {
            event.preventDefault()
            if (!addition.trim()) return
            update(selected.id, (idea) => ({
              ...idea,
              additions: [...idea.additions, { text: addition.trim(), time: '本次预览 · 刚刚' }]
            }))
            setAddition('')
            setNotice('补充已记录 · 仅本次预览')
          }}
        >
          <textarea
            aria-label="补充想法"
            placeholder="接着想，接着写…"
            value={addition}
            onChange={(e) => setAddition(e.target.value)}
          />
          <div>
            <small>围绕同一个想法，慢慢展开</small>
            <button className="primary-button" disabled={!addition.trim()}>
              添加补充 ↗
            </button>
          </div>
        </form>
      </aside>
    )
  const row = (idea: Idea, group: string) => {
    const key = `${group}:${idea.id}`
    const active = selection?.id === idea.id && selection.group === group
    return (
      <div key={key} className={`ip-entry ${active ? 'is-selected' : ''}`}>
        <div className="ip-entry-main">
          <time>{idea.time || '较早'}</time>
          <div className="ip-entry-content">
            {editing === key ? (
              <textarea
                autoFocus
                defaultValue={idea.text}
                aria-label="编辑原始想法"
                onBlur={(e) => {
                  if (e.target.value.trim())
                    update(idea.id, (i) => ({ ...i, text: e.target.value.trim() }))
                  setEditing(null)
                  setNotice('正文已保存 · 仅本次预览')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditing(null)
                    e.preventDefault()
                  }
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }}
              />
            ) : (
              <button className="ip-body" title="点击原地编辑" onClick={() => setEditing(key)}>
                {idea.text}
              </button>
            )}
            <div className="ip-entry-meta">
              <div className="ip-tags">
                {idea.topics.map((t) => (
                  <span key={t}>{t}</span>
                ))}
                {!idea.topics.length && <small>未归主题</small>}
              </div>
              <div className="ip-actions">
                <button
                  className="ip-topic-action"
                  onClick={() => setPicker(picker === key ? null : key)}
                >
                  归主题
                </button>
                <button aria-expanded={active} onClick={() => choose(idea, group)}>
                  补充{idea.additions.length ? ` ${idea.additions.length}` : ''} ↗
                </button>
              </div>
            </div>
            {picker === key && (
              <div className="ip-topic-picker">
                <strong>归入主题</strong>
                {topics.map((t) => (
                  <label key={t}>
                    <input
                      type="checkbox"
                      checked={idea.topics.includes(t)}
                      onChange={() => toggleTopic(idea, t)}
                    />
                    {t}
                  </label>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = newTopic.trim()
                    if (!name) return
                    if (!topics.includes(name)) setTopics([...topics, name])
                    if (!idea.topics.includes(name)) toggleTopic(idea, name)
                    setNewTopic('')
                  }}
                >
                  <input
                    aria-label="新主题"
                    placeholder="新主题名称"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                  />
                  <button>添加</button>
                </form>
                <button onClick={() => setPicker(null)}>完成</button>
              </div>
            )}
          </div>
        </div>
        {variant === 'B' && active && detail(true)}
      </div>
    )
  }
  const groupHeading = (group: (typeof groups)[number], rail = false) => (
    <div className={`ip-group-heading ${!group.items.length ? 'ip-empty-group' : ''}`}>
      <button
        aria-expanded={rail ? activeGroup === group.key : expanded.includes(group.key)}
        onClick={() =>
          rail
            ? setActiveGroup(group.key)
            : setExpanded((items) =>
                items.includes(group.key)
                  ? items.filter((k) => k !== group.key)
                  : [...items, group.key]
              )
        }
      >
        <span>{rail ? '○' : expanded.includes(group.key) ? '⌄' : '›'}</span>
        <strong>{group.label}</strong>
        <small>{group.items.length}</small>
      </button>
      {view === 'topic' && group.key !== '未归主题' && (
        <details className="ip-rename">
          <summary aria-label={`管理主题${group.key}`}>···</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('topic') as HTMLInputElement
              rename(group.key, input.value)
              e.currentTarget.closest('details')?.removeAttribute('open')
            }}
          >
            <input name="topic" defaultValue={group.key} aria-label="重命名主题" />
            <button>改名</button>
          </form>
        </details>
      )}
    </div>
  )
  const list = (rail = false) => (
    <div className="ip-list">
      {groups
        .filter((g) => !rail || g.key === activeGroup)
        .map((group) => (
          <section key={group.key}>
            {!rail && groupHeading(group)}
            {(rail || expanded.includes(group.key)) && (
              <>
                {!group.items.length && <p className="ip-empty">这一天还没有灵感</p>}
                {group.items.map((idea) => row(idea, group.key))}
              </>
            )}
          </section>
        ))}
    </div>
  )
  const shared = { list, detail, groups, groupHeading, selected: Boolean(selected) }
  return (
    <section className={`workbench ip-prototype ip-${variant}`}>
      <aside className="workbench-sidebar">
        <div className="workbench-brand">
          <span className="brand-mark">✓</span>
          <strong>myTodo</strong>
        </div>
        <nav className="workbench-nav" aria-label="主导航">
          <strong className="space-label">我的空间</strong>
          {[
            ['□', '任务'],
            ['↻', '习惯'],
            ['♧', '灵感']
          ].map(([icon, label]) => (
            <button
              key={label}
              aria-current={label === '灵感' ? 'page' : undefined}
              onClick={() => setNotice('当前原型仅探索灵感页')}
            >
              <span className="ip-nav-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
          <button className="nav-settings" onClick={() => setNotice('当前原型仅探索灵感页')}>
            ⚙ 设置
          </button>
          <button onClick={() => setNotice('当前原型仅探索灵感页')}>
            ▤ 桌面便签 <span className="nav-arrow">↗</span>
          </button>
        </nav>
      </aside>
      <main className="workbench-main ip-main">
        <header className="workbench-header">
          <div>
            <p className="ip-eyebrow">留住念头，慢慢展开</p>
            <h1>
              灵感 <small>{ideas.length}</small>
            </h1>
          </div>
          <button className="primary-button" onClick={() => capture.current?.focus()}>
            ＋ 新增灵感
          </button>
        </header>
        <div className="ip-toolbar">
          <div className="ip-segment" role="group" aria-label="归集视角">
            <button aria-pressed={view === 'date'} onClick={() => toggleView('date')}>
              按日期
            </button>
            <button aria-pressed={view === 'topic'} onClick={() => toggleView('topic')}>
              按主题
            </button>
          </div>
          <span className="ip-muted">
            {view === 'date' ? '按最初记录的时间' : '同一灵感可归入多个主题'}
          </span>
        </div>
        <form
          className="ip-capture"
          onSubmit={(e) => {
            e.preventDefault()
            if (!draft.trim()) return
            const id = crypto.randomUUID()
            setIdeas((items) => [
              {
                id,
                text: draft.trim(),
                date: '2026-10-28',
                time: '刚刚',
                topics: [],
                additions: []
              },
              ...items
            ])
            setDraft('')
            setView('date')
            setExpanded((items) => [...items, '2026-10-28'])
            setActiveGroup('2026-10-28')
            setNotice('新灵感已记录 · 仅本次预览')
            capture.current?.focus()
          }}
        >
          <span>＋</span>
          <input
            ref={capture}
            aria-label="新灵感"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="记下一个想法…"
          />
          <button disabled={!draft.trim()}>记录 ↵</button>
        </form>
        <div className="ip-layout-caption">
          {variant} / {prototypeNames[variant]}
          <span>
            {
              {
                A: '列表与详情并排，保留浏览位置',
                B: '补充在原位展开，沿着内容继续阅读',
                C: '先选分组，再集中阅读其中的想法'
              }[variant]
            }
          </span>
        </div>
        {variant === 'A' ? (
          <VariantA {...shared} />
        ) : variant === 'B' ? (
          <VariantB {...shared} />
        ) : (
          <VariantC {...shared} activeGroup={activeGroup} />
        )}
        <p className="ip-notice" role="status">
          {notice}
        </p>
      </main>
      <PrototypeSwitcher
        current={variant}
        onChange={changeVariant}
        state={{
          variant,
          view,
          activeGroup,
          expanded,
          selection,
          editing,
          picker,
          ideas,
          topics,
          draft,
          addition
        }}
      />
    </section>
  )
}

type LayoutProps = {
  list: (rail?: boolean) => React.ReactNode
  detail: (inline?: boolean) => React.ReactNode
  selected: boolean
  groups: { key: string; label: string; items: Idea[] }[]
  groupHeading: (group: LayoutProps['groups'][number], rail?: boolean) => React.ReactNode
}
export function VariantA({ list, detail, selected }: LayoutProps) {
  return (
    <div className={`ip-split ${selected ? 'ip-has-detail' : ''}`}>
      {list()}
      {detail()}
    </div>
  )
}
export function VariantB({ list }: LayoutProps) {
  return <div className="ip-notebook">{list()}</div>
}
export function VariantC({
  list,
  detail,
  groups,
  groupHeading,
  activeGroup,
  selected
}: LayoutProps & { activeGroup: string }) {
  return (
    <div className={`ip-explorer ${selected ? 'ip-has-detail' : ''}`}>
      <nav className="ip-group-rail" aria-label="分组导航">
        {groups.map((g) => (
          <div key={g.key} className={g.key === activeGroup ? 'is-active' : ''}>
            {groupHeading(g, true)}
          </div>
        ))}
      </nav>
      <div className="ip-explorer-content">
        <h2>{groups.find((g) => g.key === activeGroup)?.label}</h2>
        {list(true)}
      </div>
      {detail()}
    </div>
  )
}
