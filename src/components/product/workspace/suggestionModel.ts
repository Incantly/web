import type { DocumentNode } from '@incantly/canvas-core/document'
import type { EditorSuggestion } from '../../../lib/document-editor/suggestions'
import type { NoteProposal, ProposalChange, ProposalDecisionResult } from '../../../lib/api/proposals'

const KNOWN_KINDS = new Set(['editText', 'insertBlocks', 'replaceBlocks', 'deleteBlock', 'moveBlock'])

/** What new content is, by its first block: "table", "list", "equation"… */
const blockNouns: Record<string, string> = {
  table: 'table', bulletList: 'list', orderedList: 'list', checklist: 'checklist', blockquote: 'quote',
  codeBlock: 'code', mathBlock: 'equation', image: 'image', heading: 'heading', horizontalRule: 'divider',
}

function contentNoun(change: Pick<ProposalChange, 'blocks' | 'texts'>, blocks: readonly unknown[] = change.blocks ?? []) {
  const types = blocks.map((block) => String((block as { type?: unknown }).type ?? ''))
  // Name the content by its main block: a heading over a list is still "a list".
  const rich = types.find((type) => blockNouns[type] && type !== 'heading' && type !== 'horizontalRule') ?? types.find((type) => blockNouns[type])
  if (rich) return blockNouns[rich]
  const count = blocks.length || change.texts?.length || 1
  return count > 1 ? `${count} paragraphs` : 'paragraph'
}

function label(change: ProposalChange): string {
  switch (change.kind) {
    case 'editText': return 'Suggested edit'
    case 'insertBlocks': { const noun = contentNoun(change); return /^\d/.test(noun) ? `Suggested ${noun.replace(' ', ' new ')}` : `Suggested new ${noun}` }
    case 'replaceBlocks': {
      const [block] = change.blocks ?? []
      const inPlace = change.nodeIds?.length === 1 && change.blocks?.length === 1 && (block as { id?: unknown } | undefined)?.id === change.nodeIds[0]
      if (inPlace) return 'Suggested edit'
      const noun = contentNoun(change)
      return /^\d|^paragraph$/.test(noun) ? 'Suggested rewrite' : `Suggested rewrite as a ${noun}`
    }
    case 'deleteBlock': return 'Suggested removal'
    case 'moveBlock': return 'Suggested move'
    default: return 'Suggested change'
  }
}

/** `proposalId:changeId`, unique across a note's proposals. */
export function suggestionKey(proposalId: string, changeId: string) {
  return `${proposalId}:${changeId}`
}

export function parseSuggestionKey(key: string): { proposalId: string; changeId: string } {
  const split = key.lastIndexOf(':')
  return { proposalId: key.slice(0, split), changeId: key.slice(split + 1) }
}

/**
 * Every undecided change, oldest proposal first so the note reads top to bottom in the order
 * suggested. New blocks are untrusted JSON: `checkBlocks` passes them through the note's load gate
 * and returns them, or null so the change falls back to its plain `texts`. A kind this app doesn't
 * know becomes `other`: Accept/Reject with its text only.
 */
export function editorSuggestions(proposals: readonly NoteProposal[], checkBlocks: (blocks: unknown[]) => DocumentNode[] | null = () => null): EditorSuggestion[] {
  return [...proposals].reverse().flatMap((proposal) => proposal.changes
    .filter((change) => change.state === null)
    .map((change): EditorSuggestion => {
      const known = KNOWN_KINDS.has(change.kind)
      const blocks = change.blocks?.length ? checkBlocks(change.blocks) ?? undefined : undefined
      return {
        key: suggestionKey(proposal.id, change.id),
        kind: known ? change.kind : 'other',
        nodeId: change.nodeId,
        nodeIds: change.nodeIds,
        baseText: change.baseText,
        baseTexts: change.baseTexts,
        text: change.text,
        texts: change.texts ?? (change.text ? [change.text] : undefined),
        blocks: known ? blocks : undefined,
        position: change.position,
        label: label(change),
        fromWeb: proposal.fromUntrusted,
      }
    }))
}

/** The block a suggestion sits on, for scrolling to it from the chat. */
export function suggestionBlockId(change: ProposalChange): string | undefined {
  return change.nodeId ?? change.nodeIds?.[0] ?? change.position?.afterNodeId ?? change.position?.beforeNodeId
}

const staleReasons: Record<string, string> = {
  target_deleted: 'that paragraph was deleted',
  target_changed: 'that text changed',
  overlapping_edit: 'you edited the same words',
  anchor_deleted: 'the paragraph it sat next to was deleted',
  invalid_position: 'that spot no longer exists',
  not_text: 'that block isn’t text any more',
  invalid_now: 'it no longer applies',
}

/** What to say after a decision: how many changes landed and why any didn't. */
export function decisionNotice(result: Pick<ProposalDecisionResult, 'changes'>, decided: readonly string[]): { tone: 'done' | 'warning'; text: string; accepted: string[] } {
  const outcomes = result.changes.filter((change) => decided.includes(change.id))
  const accepted = outcomes.filter((change) => change.state === 'ACCEPTED').map((change) => change.id)
  const rejected = outcomes.filter((change) => change.state === 'REJECTED').length
  const stale = outcomes.filter((change) => change.state === 'STALE')
  const expired = outcomes.filter((change) => change.state === 'EXPIRED').length
  const parts: string[] = []
  if (accepted.length) parts.push(accepted.length === 1 ? 'Change applied.' : `${accepted.length} changes applied.`)
  if (rejected) parts.push(rejected === 1 ? 'Suggestion dismissed.' : `${rejected} suggestions dismissed.`)
  if (stale.length === 1 && stale[0].reason === 'invalid_now') parts.push('This suggestion no longer applies.')
  else if (stale.length) {
    const reason = staleReasons[stale[0].reason ?? ''] ?? 'that part of the note changed'
    parts.push(stale.length === 1 ? `One change couldn’t be applied because ${reason}. Ask the assistant to redo it.` : `${stale.length} changes couldn’t be applied because the note changed. Ask the assistant to redo them.`)
  }
  if (expired) parts.push(expired === 1 ? 'One suggestion expired.' : `${expired} suggestions expired.`)
  return { tone: stale.length || expired ? 'warning' : 'done', text: parts.join(' ') || 'Nothing changed.', accepted }
}

/** "3 suggested changes" for the review bar. */
export function suggestionCountLabel(count: number) {
  return count === 1 ? '1 suggested change' : `${count} suggested changes`
}
