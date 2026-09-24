import { expect, test } from '@playwright/test'

import { choose, PEOPLE, signIn, uniqueTitle } from './helpers'

// Runs on a phone-sized screen (Pixel 7): menu instead of the nav bar, cards instead of tables.
test('an employee reports an incident from their phone', async ({ page }) => {
  const title = uniqueTitle('Broken blind in the meeting room')
  await signIn(page, PEOPLE.employee)

  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Report an incident' }).click()

  await page.getByLabel(/What's wrong\?/).fill(title)
  await page.getByLabel(/Details/).fill('The blind is stuck halfway down.')
  await choose(page, 'Kind of problem', 'Furniture')
  await choose(page, 'Building', 'Riverside Annex')
  await page.getByRole('button', { name: 'Report incident' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My incidents' }).click()
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Incidents' }).getByRole('link', { name: title })).toBeVisible()
})
