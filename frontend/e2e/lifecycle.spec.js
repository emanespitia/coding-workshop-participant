import { expect, test } from '@playwright/test'

import { choose, navigateTo, PEOPLE, reportIncident, signIn, signOut, statusChip, uniqueTitle } from './helpers'

// The core journey across all three roles, through the real API and database:
// employee reports → admin assigns → engineer starts, updates and resolves → admin closes →
// employee sees the outcome.
test.describe.configure({ mode: 'serial' })

test.describe('Incident lifecycle', () => {
  const title = uniqueTitle('Leaking radiator valve')
  let id

  test('an employee reports an incident with its exact location', async ({ page }) => {
    await signIn(page, PEOPLE.employee)
    id = await reportIncident(page, {
      title,
      details: 'Water is dripping from the radiator valve under the window.',
      category: 'Plumbing',
      urgency: 'High',
      building: 'HQ Tower',
      floor: 'Floor 2',
      seat: '2A-05',
    })

    await expect(page.getByText(/your incident has been reported/)).toBeVisible()
    await expect(statusChip(page, 'Open')).toBeVisible()
    const details = page.getByRole('region', { name: 'Details' })
    await expect(details).toContainText('HQ Tower · Floor 2 · Seat 2A-05')
    await expect(details).toContainText('Not assigned yet')

    // It appears in their own list.
    await navigateTo(page, 'My incidents')
    await expect(page.getByRole('link', { name: title })).toBeVisible()
  })

  test('an admin finds it and assigns the plumbing engineer', async ({ page }) => {
    await signIn(page, PEOPLE.admin)
    await navigateTo(page, 'Incidents')
    await page.getByLabel('Search').fill(title)
    await page.getByLabel('Search').press('Enter')
    await page.getByRole('link', { name: title }).click()

    await page.getByRole('button', { name: 'Assign engineer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Assign an engineer' })
    // The plumbing specialist is suggested first.
    await expect(dialog.getByRole('radio').first()).toHaveAccessibleName(/Diego Martinez/)
    await dialog.getByRole('radio', { name: /Diego Martinez/ }).check()
    await dialog.getByRole('button', { name: 'Assign' }).click()

    await expect(page.getByRole('region', { name: 'Details' })).toContainText('Diego Martinez')
    await expect(page.getByRole('region', { name: 'History' })).toContainText('assigned it to Diego Martinez')
  })

  test('the engineer starts work, posts an update and resolves it', async ({ page }) => {
    await signIn(page, PEOPLE.engineerPlumbing)
    await navigateTo(page, 'My work')
    await page.getByLabel('Search').fill(title)
    await page.getByLabel('Search').press('Enter')
    await page.getByRole('link', { name: title }).click()

    await page.getByRole('button', { name: 'Start work' }).click()
    await expect(statusChip(page, 'In progress')).toBeVisible()

    const notes = page.getByRole('region', { name: /Notes/ })
    await notes.getByLabel('Add a note').fill('On my way with a replacement valve.')
    await notes.getByRole('button', { name: 'Post note' }).click()
    await expect(notes.getByText('On my way with a replacement valve.')).toBeVisible()

    await page.getByRole('button', { name: 'Mark resolved' }).click()
    const dialog = page.getByRole('dialog', { name: 'Mark as resolved' })
    await dialog.getByLabel(/What was done to fix it\?/).fill('Replaced the valve and checked for leaks.')
    await dialog.getByRole('button', { name: 'Mark resolved' }).click()

    await expect(statusChip(page, 'Resolved')).toBeVisible()
    await expect(page.getByText('Replaced the valve and checked for leaks.').first()).toBeVisible()
  })

  test('the admin confirms and closes it', async ({ page }) => {
    await signIn(page, PEOPLE.admin)
    await page.goto(`/incidents/${id}`)
    await page.getByRole('button', { name: 'Close incident' }).click()
    const dialog = page.getByRole('dialog', { name: 'Close this incident?' })
    await dialog.getByRole('button', { name: 'Close incident' }).click()

    await expect(statusChip(page, 'Closed')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close incident' })).toHaveCount(0)
  })

  test('the employee sees the outcome, the update and the full history', async ({ page }) => {
    await signIn(page, PEOPLE.employee)
    await page.goto(`/incidents/${id}`)

    await expect(statusChip(page, 'Closed')).toBeVisible()
    await expect(page.getByText(/Resolution:.*Replaced the valve/)).toBeVisible()
    await expect(page.getByRole('region', { name: /Notes/ })).toContainText('On my way with a replacement valve.')
    await expect(page.getByText('This incident is closed, so notes are read-only.')).toBeVisible()

    const history = page.getByRole('region', { name: 'History' })
    for (const step of [
      'reported the incident',
      'assigned it to Diego Martinez',
      'moved it from Open to In progress',
      'moved it from In progress to Resolved',
      'moved it from Resolved to Closed',
    ]) {
      await expect(history).toContainText(step)
    }
  })
})

test('an engineer asks to take an incident and an admin approves', async ({ page }) => {
  const title = uniqueTitle('Wi-Fi keeps dropping in the lab')

  await signIn(page, PEOPLE.employee)
  const id = await reportIncident(page, {
    title, details: 'Connection drops every few minutes.', category: 'Network & Wi-Fi', building: 'Innovation Lab',
  })
  await signOut(page, PEOPLE.employee)

  // Priya (network specialist) sees it under Available, filtered to her specialties.
  await signIn(page, PEOPLE.engineerNetwork)
  await navigateTo(page, 'Available')
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: title }) })
  await row.getByRole('button', { name: 'Request to take' }).click()
  const ask = page.getByRole('dialog', { name: `Ask to take #${id}?` })
  await ask.getByLabel(/Message for the admin/).fill('Network is my area, I can go now.')
  await ask.getByRole('button', { name: 'Send request' }).click()
  await expect(row.getByText('Requested')).toBeVisible()
  await signOut(page, PEOPLE.engineerNetwork)

  // The admin approves it from the Requests queue.
  await signIn(page, PEOPLE.admin)
  await navigateTo(page, 'Requests')
  const card = page.getByRole('listitem').filter({ hasText: title })
  await expect(card).toContainText('Network is my area, I can go now.')
  await card.getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('dialog', { name: `Assign Priya Shah to #${id}?` }).getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText(`Priya Shah is now assigned to #${id}.`)).toBeVisible()
  await signOut(page, PEOPLE.admin)

  // Priya now has it in My work, and her request shows as approved.
  await signIn(page, PEOPLE.engineerNetwork)
  await navigateTo(page, 'My work')
  await page.getByLabel('Search').fill(title)
  await page.getByLabel('Search').press('Enter')
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await navigateTo(page, 'My requests')
  const decided = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Decided' }) })
  await expect(decided).toContainText(title)
  await expect(decided).toContainText('Approved')
})

test('an admin narrows the incident list by building and floor, with a live count', async ({ page }) => {
  await signIn(page, PEOPLE.admin)
  await navigateTo(page, 'Incidents')
  const count = page.getByRole('heading', { name: 'Incidents', exact: true }).locator('..')
  await expect(count).toContainText(/\d+ incidents in total/)
  const total = Number((await count.textContent()).match(/(\d+) incidents/)[1])

  await choose(page, 'Building', 'Riverside Annex')
  await expect(count).toContainText('Riverside Annex')
  const inAnnex = Number((await count.textContent()).match(/(\d+) incidents?/)[1])
  expect(inAnnex).toBeGreaterThan(0)
  expect(inAnnex).toBeLessThan(total)

  await choose(page, 'Floor', 'Floor 1')
  await expect(count).toContainText('Riverside Annex · Floor 1')
  await expect(page).toHaveURL(/building=\d+&floor=\d+/)
})
