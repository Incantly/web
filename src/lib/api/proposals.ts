import { apiFetch } from './client'
import type { Schema } from './types'

export type NoteProposal = Schema<'NoteProposalDto'>
export type ProposalChange = Schema<'ProposalChangeDto'>
export type ProposalDecision = Schema<'ProposalDecisionDto'>
export type ProposalDecisionResult = Schema<'ProposalDecisionResultDto'>
export type ProposalUndoResult = Schema<'ProposalUndoResultDto'>

const id = (value: string) => encodeURIComponent(value)
const proposals = (noteId: string) => `/v1/notes/${id(noteId)}/proposals`

/** `/v1/notes/:noteId/proposals`: the note assistant's suggested edits (docs/agent-note-edits.md). */
export const proposalsApi = {
  /** Proposals still waiting on a decision, newest first (at most 20). */
  async list(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<Schema<'NoteProposalListDto'>>(proposals(noteId), { signal })).data.proposals
  },
  /** Applies accepted changes as one revision. Afterwards load the note at `currentRevisionNumber`; never reapply locally. */
  async decide(noteId: string, proposalId: string, body: ProposalDecision) {
    return (await apiFetch<ProposalDecisionResult>(`${proposals(noteId)}/${id(proposalId)}/decisions`, { method: 'POST', body, maxAttempts: 2 })).data
  },
  /** Reverses one accepted change as a new revision; 409 PROPOSAL_UNDO_STALE once the block changed. */
  async undo(noteId: string, proposalId: string, changeId: string) {
    return (await apiFetch<ProposalUndoResult>(`${proposals(noteId)}/${id(proposalId)}/changes/${id(changeId)}/undo`, { method: 'POST', maxAttempts: 2 })).data
  },
}
