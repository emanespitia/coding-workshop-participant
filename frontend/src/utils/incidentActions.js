/**
 * The buttons for moving an incident through the workflow. The API says which moves
 * the current user may make (`allowed_transitions`); this adds labels and whether a
 * comment is needed (same rules as the backend's workflow.TRANSITIONS).
 */
export function transitionAction(incident, to, userId) {
  const from = incident.status
  const isReporter = incident.reporter?.id === userId

  if (to === 'in_progress') {
    if (from === 'open') return { label: 'Start work', variant: 'contained' }
    if (from === 'blocked') return { label: 'Resume work', variant: 'contained' }
    return {
      label: 'Reopen',
      comment: { title: 'Reopen this incident', label: 'Why is it being reopened?', required: true },
    }
  }
  if (to === 'blocked') {
    return {
      label: 'Mark blocked',
      comment: { title: 'Mark as blocked', label: "What's blocking the work?", required: true },
    }
  }
  if (to === 'resolved') {
    return {
      label: 'Mark resolved',
      variant: 'contained',
      comment: { title: 'Mark as resolved', label: 'What was done to fix it?', required: true },
    }
  }
  if (to === 'closed') {
    if (from === 'open' && isReporter) {
      return {
        label: 'Cancel incident',
        color: 'error',
        comment: {
          title: 'Cancel this incident?',
          intro: "Use this if the problem went away or was reported by mistake. You can't undo it.",
          label: 'Why are you cancelling it?',
          confirm: 'Cancel incident',
          required: true,
        },
      }
    }
    if (from === 'resolved') {
      return { label: 'Close incident', comment: { title: 'Close this incident?', label: 'Comment (optional)' } }
    }
    return {
      label: 'Close incident',
      color: 'error',
      comment: { title: 'Close without resolving?', label: 'Why is it being closed?', required: true },
    }
  }
  return { label: to }
}
