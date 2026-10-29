'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { aiApi, type AiCommand, type AnswerCitation } from '../../../lib/api/ai'
import { AppIcon, type IconName } from '../AppIcon'
import type { EvidenceTarget } from '../workspace/ContextSearch'
import { sourceKindMeta, type NoteRecord, type SourceRecord, type SpaceRecord } from '../workspace/model'
import { SidePanel, useMediaQuery } from '../workspace/sidePanel'
import { iconButton } from '../workspace/ui'
import { canRetry, isGroundedAnswer, isPracticeQuestions, locatorLabel, MAX_PROMPT, MIN_PROMPT, resolveCitations, revealSegments, segmentAnswer, textLength, type AnswerSegment, type AssistantTurn, type ResolvedCitation, type ScopeChoice, type ScopeKind, type Turn } from './aiModel'
import { Citation, citationTargetId, type CitationItem } from './Citations'
import { PromptInput, type PromptAction } from './PromptInput'
import { StreamingResponse } from './StreamingResponse'
import { useAssistantChat } from './useAssistantChat'

type Lookup = { notes: NoteRecord[]; sources: SourceRecord[]; target: EvidenceTarget }

export type AssistantContext = { note?: { id: string; title: string }; space?: SpaceRecord }

/** Scopes on offer where the user is. Everything (LIBRARY) is always listed but never picked for them. */
export function scopeChoices({ note, space }: AssistantContext): ScopeChoice[] {
  const choices: ScopeChoice[] = []
  if (note) choices.push({ kind: 'NOTE', scope: { kind: 'NOTE', noteId: note.id }, label: 'This note' })
  if (space?.status === 'ACTIVE') choices.push({ kind: 'SPACE', scope: { kind: 'SPACE', spaceId: space.id }, label: note ? 'This note’s Space' : 'This Space' })
  choices.push({ kind: 'LIBRARY', scope: { kind: 'LIBRARY' }, label: 'All notes and sources' })
  return choices
}

const scopeIcon: Record<ScopeKind, IconName> = { NOTE: 'document', SPACE: 'space', SELECTED_SOURCES: 'library', LIBRARY: 'library' }

const modes: PromptAction[] = [
  { value: 'ask', label: 'Ask with sources', description: 'Answers from your notes and files, cited.', icon: 'quote' },
  { value: 'practice', label: 'Quiz me', description: 'Practice questions from your material.', icon: 'edit' },
]

function suggestions(kind: ScopeKind | undefined): { text: string; command: AiCommand; icon: IconName }[] {
  const subject = kind === 'NOTE' ? 'this note' : kind === 'SPACE' ? 'this Space' : 'my notes'
  return [
    { text: `What are the key ideas in ${subject}?`, command: 'ask', icon: 'sparkles' },
    { text: `Explain the hardest part of ${subject} simply`, command: 'ask', icon: 'quote' },
    { text: `Quiz me on ${subject}`, command: 'practice', icon: 'edit' },
  ]
}

function resetTime(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Each note (or Space, or the rest of the workspace) keeps its own conversation. */
export function threadKey({ note, space }: AssistantContext) {
  return note ? `note:${note.id}` : space ? `space:${space.id}` : 'workspace'
}

/**
 * The AI chat. Docks beside the content from `lg` up, a full-height sheet below. Every question is
 * answered from the user's own material in the chosen scope, with citations back to it.
 */
export function AssistantPanel({ open, onClose, userId, context, notes, sources, target }: { open: boolean; onClose: () => void; userId: string; context: AssistantContext } & Lookup) {
  // Contents mount only while open: the small-screen sheet stays in the DOM when closed, and a
  // hidden answer would otherwise play its reveal unseen. Threads persist per note in session
  // storage, so remounting (or moving to another note) restores the right one.
  const key = threadKey(context)
  return <SidePanel open={open} onClose={onClose} title="Chat" bare>
    {open ? <ChatBody key={key} thread={key} onClose={onClose} userId={userId} context={context} notes={notes} sources={sources} target={target} /> : null}
  </SidePanel>
}

function ChatBody({ thread, onClose, userId, context, notes, sources, target }: { thread: string; onClose: () => void; userId: string; context: AssistantContext } & Lookup) {
  const client = useQueryClient()
  const allowance = useQuery({ queryKey: ['ai-allowance', userId], queryFn: ({ signal }) => aiApi.allowance(signal), staleTime: 60_000, retry: false })
  const chat = useAssistantChat(userId, thread, { onLimitReached: () => void client.invalidateQueries({ queryKey: ['ai-allowance', userId] }) })
  const choices = useMemo(() => scopeChoices(context), [context])
  const [picked, setPicked] = useState<ScopeKind | null>(null)
  // A pick holds while it is on offer; otherwise the narrowest context wins. Everything is only ever an explicit pick.
  const scope = choices.find((choice) => choice.kind === picked) ?? choices.find((choice) => choice.kind !== 'LIBRARY') ?? null
  const [mode, setMode] = useState<AiCommand>('ask')
  const [draft, setDraft] = useState('')
  const limited = allowance.data ? allowance.data.remainingUsd <= 0 : false
  const limitReset = allowance.data ? resetTime(allowance.data.resetsAt) : null
  const lookup = { notes, sources, target }

  const tooShort = draft.trim().length > 0 && draft.trim().length < MIN_PROMPT
  const hint = limited ? `You’ve used today’s AI allowance${limitReset ? `. It resets at ${limitReset}` : ''}.`
    : !scope ? 'Choose what to search first.'
    : tooShort ? 'Type a little more.'
    : draft.length > MAX_PROMPT ? `Keep it under ${MAX_PROMPT.toLocaleString()} characters.` : undefined

  function send(text: string, command: AiCommand = mode) {
    if (!scope || limited) return
    chat.send(text, scope, command)
    setDraft('')
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex min-h-14 shrink-0 items-center gap-1 pl-4 pr-1.5 pt-[env(safe-area-inset-top)] lg:pt-0">
      <p className="min-w-0 flex-1 truncate text-base font-medium text-foreground" aria-hidden="true">Chat</p>
      <button type="button" onClick={onClose} className={iconButton} aria-label="Close chat" title="Close chat"><AppIcon name="close" className="size-5" /></button>
    </header>

    <Thread turns={chat.turns} scope={scope} lookup={lookup} disabled={!scope || limited}
      onSuggest={(text, command) => send(text, command)} onRetry={chat.retry} onClarify={chat.clarify} onRevealed={chat.markRevealed} />

    <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <PromptInput value={draft} onValueChange={setDraft} onSubmit={(text) => send(text)} maxLength={MAX_PROMPT}
        canSubmit={Boolean(scope) && !limited && draft.trim().length >= MIN_PROMPT}
        loading={Boolean(chat.active)} onStop={chat.active ? () => chat.stop(chat.active!) : undefined}
        placeholder={mode === 'practice' ? 'What should the quiz cover?' : 'Ask about your notes…'}
        actions={modes} onAction={(value) => setMode(value as AiCommand)} hint={draft || limited || !scope ? hint : undefined}
        header={mode === 'practice' ? <div className="px-1"><button type="button" onClick={() => setMode('ask')} aria-label="Quiz mode on. Turn off" className="group inline-flex min-h-11 items-center">
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface px-2.5 text-xs font-medium text-foreground transition-colors group-hover:bg-canvas">
            <AppIcon name="edit" className="size-3.5 text-muted" />Quiz me<AppIcon name="close" className="size-3.5 text-muted" /></span></button></div> : null}
        leadingAction={<ScopeMenu choices={choices} value={scope} onChange={setPicked} />} />
    </div>
  </div>
}

function ScopeMenu({ choices, value, onChange }: { choices: ScopeChoice[]; value: ScopeChoice | null; onChange: (kind: ScopeKind) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listId = useId()
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); ref.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey, true)
    const menu = ref.current
    ;(menu?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu?.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus()
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey, true) }
  }, [open])
  return <div ref={ref} className="relative min-w-0">
    <button type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((current) => !current)}
      aria-label={`Searching: ${value?.label ?? 'nothing chosen'}. Change`}
      className={`flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-xl px-2.5 text-sm transition-colors hover:bg-surface ${value ? 'text-muted' : 'font-medium text-foreground'}`}>
      <AppIcon name={value ? scopeIcon[value.kind] : 'search'} className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{value?.label ?? 'Choose what to search'}</span>
      <AppIcon name="chevron" className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? '-rotate-90' : 'rotate-90'}`} />
    </button>
    {open ? <div id={listId} role="menu" aria-label="Search in"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }}
      className="absolute bottom-full left-0 z-30 mb-2 w-60 max-w-[calc(100vw-3rem)] origin-bottom-left animate-[menu-in_160ms_ease-out] rounded-xl border border-default bg-raised p-1.5 shadow-lg motion-reduce:animate-none">
      <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted">Search in</p>
      {choices.map((choice) => <button key={choice.kind} type="button" role="menuitemradio" aria-checked={value?.kind === choice.kind} onClick={() => { onChange(choice.kind); setOpen(false) }}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-surface focus-visible:bg-surface">
        <AppIcon name={scopeIcon[choice.kind]} className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{choice.label}</span>
        {value?.kind === choice.kind ? <AppIcon name="check" className="size-4 shrink-0" /> : null}
      </button>)}
    </div> : null}
  </div>
}

function Thread({ turns, scope, lookup, disabled, onSuggest, onRetry, onClarify, onRevealed }: {
  turns: Turn[]; scope: ScopeChoice | null; lookup: Lookup; disabled: boolean
  onSuggest: (text: string, command: AiCommand) => void
  onRetry: (turn: AssistantTurn) => void
  onClarify: ReturnType<typeof useAssistantChat>['clarify']
  onRevealed: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const last = turns.at(-1)
  const lastKey = last ? `${last.id}:${last.role === 'assistant' ? `${last.state}:${last.progress ?? ''}` : ''}` : ''
  // Follow the conversation while the reader is at the bottom; leave them alone if they scrolled up.
  useEffect(() => {
    const element = scroller.current
    if (!element || !(pinned.current || last?.role === 'user')) return
    element.scrollTo({ top: element.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [lastKey, last?.role])

  const status = last?.role === 'assistant' ? (last.state === 'done' ? 'Answer ready.' : last.state === 'failed' ? last.error : last.state === 'clarify' ? 'The assistant needs you to choose.' : last.state === 'canceled' ? 'Stopped.' : last.progress) : ''

  return <div ref={scroller} onScroll={(event) => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48 }}
    className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <p role="status" aria-live="polite" className="sr-only">{status}</p>
    {turns.length ? <ol className="space-y-6 px-4 py-5" aria-label="Conversation">
      {turns.map((turn) => <li key={turn.id} className="min-w-0">
        {turn.role === 'user' ? <UserBubble text={turn.text} quiz={turn.command === 'practice'} />
          : <AssistantReply turn={turn} lookup={lookup} onRetry={() => onRetry(turn)} onClarify={(option) => onClarify(turn, option)} onRevealed={() => onRevealed(turn.id)} />}
      </li>)}
    </ol> : <Welcome scope={scope} disabled={disabled} onSuggest={onSuggest} />}
  </div>
}

function Welcome({ scope, disabled, onSuggest }: { scope: ScopeChoice | null; disabled: boolean; onSuggest: (text: string, command: AiCommand) => void }) {
  return <div className="flex min-h-full flex-col items-center justify-center px-5 py-10 text-center">
    <span aria-hidden="true" className="grid size-20 place-items-center rounded-full bg-feature-research text-accent ring-8 ring-surface"><AppIcon name="sparkles" className="size-9" strokeWidth={1.4} /></span>
    <h3 className="mt-6 font-display text-[1.75rem] leading-tight tracking-[-0.02em] text-foreground">How can I help?</h3>
    <p className="mt-2 max-w-[18rem] text-sm leading-6 text-muted">{scope ? <>Answers come from <span className="font-medium text-foreground">{scope.label.toLowerCase()}</span>, with sources you can open.</> : 'Choose what to search below, then ask anything about it.'}</p>
    <ul className="mt-7 flex w-full max-w-[20rem] flex-col items-stretch gap-2.5">
      {suggestions(scope?.kind).map((item) => <li key={item.text}>
        <button type="button" disabled={disabled} onClick={() => onSuggest(item.text, item.command)}
          className="flex min-h-12 w-full items-center gap-3 rounded-full border border-default bg-raised py-1.5 pl-1.5 pr-4 text-left text-sm text-foreground transition-[border-color,background-color] hover:border-strong hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted"><AppIcon name={item.icon} className="size-4" /></span>
          <span className="min-w-0 flex-1">{item.text}</span>
        </button>
      </li>)}
    </ul>
  </div>
}

function UserBubble({ text, quiz }: { text: string; quiz: boolean }) {
  return <div className="flex flex-col items-end gap-1">
    {quiz ? <span className="inline-flex items-center gap-1 text-xs text-muted"><AppIcon name="edit" className="size-3" />Quiz</span> : null}
    <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-[0.9375rem] leading-6 text-foreground">{text}</p>
  </div>
}

function Progress({ label }: { label: string }) {
  return <p className="flex items-center gap-2.5 text-sm text-muted">
    <span aria-hidden="true" className="flex gap-1">{[0, 1, 2].map((dot) => <span key={dot} style={{ animationDelay: `${dot * 160}ms` }} className="size-1.5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />)}</span>
    {label}
  </p>
}

function Notice({ tone = 'muted', children, action }: { tone?: 'muted' | 'danger'; children: ReactNode; action?: ReactNode }) {
  return <div className={`rounded-xl border px-3.5 py-3 text-sm leading-6 ${tone === 'danger' ? 'border-danger bg-danger-surface text-danger' : 'border-default bg-surface text-muted'}`}>
    <p className="flex gap-2"><AppIcon name={tone === 'danger' ? 'alert' : 'search'} className="mt-1 size-4 shrink-0" /><span className="min-w-0">{children}</span></p>
    {action ? <div className="mt-2 flex flex-wrap gap-2 pl-6">{action}</div> : null}
  </div>
}

const smallButton = 'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-default bg-raised px-3 text-sm font-medium text-foreground transition-colors hover:border-strong hover:bg-surface'

function AssistantReply({ turn, lookup, onRetry, onClarify, onRevealed }: { turn: AssistantTurn; lookup: Lookup; onRetry: () => void; onClarify: (option: NonNullable<AssistantTurn['options']>[number]) => void; onRevealed: () => void }) {
  if (turn.state === 'sending' || turn.state === 'running') return <Progress label={turn.progress ?? 'Working…'} />
  if (turn.state === 'clarify') return <div className="space-y-2.5">
    <p className="text-sm text-foreground">Did you want…</p>
    <div className="flex flex-col items-start gap-2">{turn.options?.map((option) => <button key={option.command} type="button" onClick={() => onClarify(option)} className={smallButton}>{option.description}</button>)}</div>
  </div>
  if (turn.state === 'failed') return <Notice tone="danger" action={canRetry(turn.failureCode) ? <button type="button" onClick={onRetry} className={smallButton}><AppIcon name="restore" className="size-4" />Try again</button> : null}>{turn.error ?? 'Something went wrong.'}</Notice>
  if (turn.state === 'canceled') return <Notice action={<button type="button" onClick={onRetry} className={smallButton}><AppIcon name="restore" className="size-4" />Ask again</button>}>Stopped.</Notice>
  if (isGroundedAnswer(turn.job)) return <GroundedReply turn={turn} lookup={lookup} onRetry={onRetry} onRevealed={onRevealed} />
  if (isPracticeQuestions(turn.job)) return <PracticeReply turn={turn} lookup={lookup} onRetry={onRetry} />
  return <Notice>This answer can’t be shown here yet.</Notice>
}

function notFound(turn: AssistantTurn, onRetry: () => void) {
  return <Notice action={<button type="button" onClick={onRetry} className={smallButton}><AppIcon name="restore" className="size-4" />Ask again</button>}>
    Your material doesn’t cover this. Add sources to {turn.request.scope.kind === 'NOTE' ? 'this note' : turn.request.scope.kind === 'SPACE' ? 'this Space' : 'your Library'}, or search somewhere wider.
  </Notice>
}

function toItem({ ref, citation, passage }: ResolvedCitation, { notes, sources, target }: Lookup): CitationItem {
  const sourceId = passage?.sourceId ?? citation?.sourceId ?? null
  const noteId = passage?.noteId ?? citation?.noteId ?? null
  const source = sourceId ? sources.find((item) => item.id === sourceId) : undefined
  const note = noteId ? notes.find((item) => item.id === noteId) : undefined
  const where = locatorLabel(passage ?? citation ?? { page: null, startMs: null }, passage?.headingPath)
  return {
    id: ref,
    title: source?.title ?? (note ? note.title || 'Untitled note' : sourceId ? 'Library source' : noteId ? 'Note' : 'Your material'),
    detail: where ?? undefined,
    icon: source ? sourceKindMeta(source.kind).icon : 'document',
    onOpen: sourceId ? () => target.openSource(sourceId) : noteId ? () => target.openNote(noteId) : undefined,
  }
}

/** Renders text and markers. Text is untrusted model output: plain text only. */
function AnswerText({ segments, idPrefix, onCite }: { segments: AnswerSegment[]; idPrefix: string; onCite: (ref: string) => void }) {
  return <p className="whitespace-pre-wrap">{segments.map((segment, index) => segment.kind === 'text'
    ? <span key={index}>{segment.text}</span>
    : <Citation key={index} citationId={segment.ref} index={segment.index} idPrefix={idPrefix} onSelect={onCite} />)}</p>
}

/** Opens the sources list and moves focus to a cited row once it is no longer inert. */
function useCiteFocus(idPrefix: string) {
  const [open, setOpen] = useState(false)
  function cite(ref: string) {
    setOpen(true)
    // The next frame runs after React has committed the open (and removed `inert`).
    requestAnimationFrame(() => {
      const element = document.getElementById(citationTargetId(idPrefix, ref))
      element?.focus({ preventScroll: true })
      element?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
    })
  }
  return { open, setOpen, cite }
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const CHARS_PER_SECOND = 420
const MAX_REVEAL_MS = 1800

/**
 * The answer arrives whole (the backend has no token stream yet), so it is revealed progressively,
 * capped at ~2 s and skipped for reduced motion or when restoring an answer already shown.
 */
function useReveal(total: number, skip: boolean, onDone: () => void) {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const instant = skip || reduce
  const [chars, setChars] = useState(0)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    if (instant) { if (!skip) done.current(); return }
    const rate = Math.max(CHARS_PER_SECOND, (total / MAX_REVEAL_MS) * 1000)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const next = Math.min(total, Math.ceil(((now - start) / 1000) * rate))
      setChars(next)
      if (next < total) frame = requestAnimationFrame(tick)
      else done.current()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [total, instant, skip])
  return instant ? total : chars
}

function GroundedReply({ turn, lookup, onRetry, onRevealed }: { turn: AssistantTurn; lookup: Lookup; onRetry: () => void; onRevealed: () => void }) {
  const result = isGroundedAnswer(turn.job) ? turn.job.result : null
  const idPrefix = `answer-${turn.id}`
  const { segments, order } = useMemo(() => segmentAnswer(result?.answer ?? '', new Set(result?.citations.map((item: AnswerCitation) => item.ref))), [result])
  const total = textLength(segments)
  const chars = useReveal(total, Boolean(turn.revealed), onRevealed)
  const cite = useCiteFocus(idPrefix)
  if (!result) return null
  if (result.sufficiency === 'NOT_FOUND') return notFound(turn, onRetry)
  const items = resolveCitations(order, result.citations, turn.passages).map((item) => toItem(item, lookup))
  const plain = segments.map((segment) => (segment.kind === 'text' ? segment.text : '')).join('').trim()
  return <div className="space-y-2">
    {result.sufficiency === 'PARTIAL' ? <p className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-muted"><AppIcon name="alert" className="size-3.5" />Only partly covered by your material</p> : null}
    <StreamingResponse status={chars < total ? 'streaming' : 'complete'} announce={false} copyText={plain} onRetry={onRetry} sources={items} sourceIdPrefix={idPrefix} sourcesOpen={cite.open} onSourcesOpenChange={cite.setOpen}>
      <AnswerText segments={revealSegments(segments, chars)} idPrefix={idPrefix} onCite={cite.cite} />
    </StreamingResponse>
  </div>
}

function PracticeReply({ turn, lookup, onRetry }: { turn: AssistantTurn; lookup: Lookup; onRetry: () => void }) {
  const result = isPracticeQuestions(turn.job) ? turn.job.result : null
  const idPrefix = `practice-${turn.id}`
  const parsed = useMemo(() => {
    const order: string[] = []
    const questions = (result?.questions ?? []).map((question) => {
      const known = new Set(question.citations.map((item) => item.ref))
      return { question: question.question, answer: segmentAnswer(question.answer, known, order).segments }
    })
    return { questions, order, citations: (result?.questions ?? []).flatMap((question) => question.citations) }
  }, [result])
  const cite = useCiteFocus(idPrefix)
  if (!result) return null
  if (result.sufficiency === 'NOT_FOUND' || !parsed.questions.length) return notFound(turn, onRetry)
  const items = resolveCitations(parsed.order, parsed.citations, turn.passages).map((item) => toItem(item, lookup))
  const copy = parsed.questions.map((item, index) => `${index + 1}. ${item.question}`).join('\n')
  return <StreamingResponse status="complete" announce={false} copyText={copy} onRetry={onRetry} sources={items} sourceIdPrefix={idPrefix} sourcesOpen={cite.open} onSourcesOpenChange={cite.setOpen}>
    <p className="mb-3 text-sm text-muted">{parsed.questions.length} practice {parsed.questions.length === 1 ? 'question' : 'questions'}. Answer in your head, then check.</p>
    <ol className="space-y-2.5">
      {parsed.questions.map((item, index) => <li key={index} className="animate-[citation-in_220ms_ease-out_both] rounded-xl border border-default p-3.5 motion-reduce:animate-none" style={{ animationDelay: `${index * 60}ms` }}>
        <p className="flex gap-2.5 font-medium"><span className="shrink-0 text-muted tabular-nums">{index + 1}.</span><span className="min-w-0 whitespace-pre-wrap">{item.question}</span></p>
        <details className="group mt-2 pl-6">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <AppIcon name="chevron" className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" />Show answer
          </summary>
          <div className="mt-1 text-[0.9375rem]"><AnswerText segments={item.answer} idPrefix={idPrefix} onCite={cite.cite} /></div>
        </details>
      </li>)}
    </ol>
  </StreamingResponse>
}
