import { expect, test } from '@playwright/test'

import { choose, PEOPLE, reportIncident, signIn, signOut } from './helpers'

// Two people report the same problem: the second is warned before submitting, reports it
// anyway, and an admin closes it as a duplicate of the first.
test('a similar report is flagged, and an admin closes it as a duplicate', async ({ page }) => {
  const token = Date.now().toString(36)
  const original = `[e2e] Radiator ${token} stone cold`

  await signIn(page, PEOPLE.otherEmployee)
  const originalId = await reportIncident(page, {
    title: original, details: 'The radiator under the window is cold.', category: 'Heating & cooling',
    building: 'HQ Tower', floor: 'Floor 1',
  })
  await signOut(page, PEOPLE.otherEmployee)

  // Maria reports the same radiator and is warned first; she only sees safe details.
  await signIn(page, PEOPLE.employee)
  await page.goto('/incidents/new')
  const second = `[e2e] Radiator ${token} not warming up`
  await page.getByLabel(/What's wrong\?/).fill(second)
  await page.getByLabel(/Details/).fill('Still cold after an hour.')
  await choose(page, 'Kind of problem', 'Heating & cooling')
  await choose(page, 'Building', 'HQ Tower')
  await choose(page, 'Floor', 'Floor 1')
  await page.getByRole('button', { name: 'Report incident' }).click()

  const warning = page.getByRole('dialog', { name: 'This may already be reported' })
  const match = warning.getByRole('listitem').filter({ hasText: original })
  await expect(match).toContainText('HQ Tower · Floor 1 · Heating & cooling')
  await expect(warning).not.toContainText('The radiator under the window is cold.')  // Jane's description stays private
  await warning.getByRole('button', { name: 'Mine is different, report it' }).click()
  await expect(page.getByRole('heading', { name: second })).toBeVisible()
  const secondId = Number(page.url().match(/\/incidents\/(\d+)/)[1])
  await signOut(page, PEOPLE.employee)

  // The admin sees the flag and closes Maria's as a duplicate of Jane's.
  await signIn(page, PEOPLE.admin)
  await page.goto(`/incidents?possible_duplicate=1&q=${encodeURIComponent(token)}`)
  await page.getByRole('link', { name: second }).click()
  const banner = page.getByRole('alert').filter({ hasText: 'Possibly the same problem as' })
  await expect(banner.getByRole('link', { name: `#${originalId} ${original}` })).toBeVisible()
  await banner.getByRole('button', { name: 'Close as duplicate' }).click()
  await expect(page.getByText(/Closed as a duplicate/)).toBeVisible()
  await signOut(page, PEOPLE.admin)

  // Maria is told where the problem is being handled.
  await signIn(page, PEOPLE.employee)
  await page.goto(`/incidents/${secondId}`)
  await expect(page.getByRole('alert').filter({ hasText: 'Closed as a duplicate' })).toContainText(`#${originalId}`)
})
