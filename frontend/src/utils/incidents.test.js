import { describe, expect, it } from 'vitest'

import { makeIncident, PEOPLE } from '../test/fixtures'
import { transitionAction } from './incidentActions'
import { describeEvent } from './incidentEvents'
import { workflowSteps } from './incidentWorkflow'

describe('describeEvent', () => {
  it.each([
    [{ type: 'created' }, 'reported the incident'],
    [{ type: 'status_changed', from_value: 'in_progress', to_value: 'blocked' }, 'moved it from In progress to Blocked'],
    [{ type: 'assigned', to_value: 'Priya Shah' }, 'assigned it to Priya Shah'],
    [{ type: 'assigned', from_value: 'Diego', to_value: 'Sam' }, 'reassigned it from Diego to Sam'],
    [{ type: 'priority_changed', from_value: 'high', to_value: 'critical' }, 'changed the priority from high to critical'],
    [{ type: 'assignment_rejected', to_value: 'Sam Rivera' }, "turned down Sam Rivera's request to take it"],
    [{ type: 'unassigned', from_value: 'Diego' }, 'unassigned Diego'],
    [{ type: 'escalated' }, 'escalated it'],
    [{ type: 'deescalated' }, 'removed the escalation'],
    [{ type: 'assignment_requested' }, 'asked to take this incident'],
    [{ type: 'updated' }, 'edited the details'],
    [{ type: 'something_new' }, 'something new'],
  ])('%o', (event, text) => {
    expect(describeEvent(event)).toBe(text)
  })
})

describe('workflowSteps', () => {
  const labels = (incident) => workflowSteps(incident).steps.map((s) => s.label)

  it('follows the incident through the workflow', () => {
    expect(workflowSteps(makeIncident({ status: 'open' })).active).toBe(1)
    expect(workflowSteps(makeIncident({ status: 'open' })).steps[1].caption).toBe('Waiting for an engineer')
    expect(workflowSteps(makeIncident({ status: 'resolved', resolved_at: '2026-09-21T00:00:00Z' })).active).toBe(3)
  })

  it('shows blocked as a problem on the in-progress step', () => {
    const { steps } = workflowSteps(makeIncident({ status: 'blocked', blocked_reason: 'Waiting for parts' }))
    expect(steps[1]).toMatchObject({ label: 'Blocked', caption: 'Waiting for parts', error: true })
  })

  it('skips the middle steps for incidents closed without a fix', () => {
    expect(labels(makeIncident({ status: 'closed', closed_at: '2026-09-21T00:00:00Z' }))).toEqual(['Reported', 'Closed'])
    expect(labels(makeIncident({ status: 'closed', resolved_at: '2026-09-20T00:00:00Z' })))
      .toEqual(['Reported', 'In progress', 'Resolved', 'Closed'])
  })
})

describe('transitionAction', () => {
  it('calls closing your own open incident "cancel" and asks why', () => {
    const action = transitionAction(makeIncident(), 'closed', PEOPLE.reporter.id)
    expect(action.label).toBe('Cancel incident')
    expect(action.comment.required).toBe(true)
  })

  it('matches the backend on which moves need a comment', () => {
    const at = (status) => makeIncident({ status })
    expect(transitionAction(at('open'), 'in_progress', 1).comment).toBeUndefined()
    expect(transitionAction(at('in_progress'), 'blocked', 1).comment.required).toBe(true)
    expect(transitionAction(at('in_progress'), 'resolved', 1).comment.required).toBe(true)
    expect(transitionAction(at('resolved'), 'in_progress', 1).comment.required).toBe(true)
    expect(transitionAction(at('resolved'), 'closed', 1).comment.required).toBeFalsy()
    expect(transitionAction(at('blocked'), 'closed', 1).comment.required).toBe(true)
  })
})
