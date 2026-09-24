import { expect, test } from '@playwright/test'

import { PEOPLE, signIn } from './helpers'

/** Call the API as the signed-in user (token from the app's storage) and return the status. */
function apiStatus(page, path, method = 'GET') {
  return page.evaluate(async ([url, verb]) => {
    const { access_token: token } = JSON.parse(localStorage.getItem('helpdesk.tokens'))
    const response = await fetch(`/api/helpdesk${url}`, { method: verb, headers: { Authorization: `Bearer ${token}` } })
    return response.status
  }, [path, method])
}

test('employees only see employee pages, and the API refuses admin actions too', async ({ page }) => {
  await signIn(page, PEOPLE.employee)
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link')).toHaveText(['Dashboard', 'My incidents', 'Report an incident'])

  await page.goto('/users')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()

  // Hiding the page isn't the protection: the backend refuses on its own.
  expect(await apiStatus(page, '/users')).toBe(403)
  expect(await apiStatus(page, '/buildings/1', 'DELETE')).toBe(403)
  expect(await apiStatus(page, '/assignment-requests')).toBe(403)
})

test("employees can't open someone else's incident", async ({ page }) => {
  await signIn(page, PEOPLE.employee)
  await page.goto('/incidents?q=Air conditioning')
  // Jane reported the air-conditioning incident, so Maria's list doesn't show it…
  await expect(page.getByText('No incidents match')).toBeVisible()
  // …and opening an id she can't see reads as not found.
  await page.goto('/incidents/1')
  await expect(page.getByText(/doesn't exist, or you don't have access to it/)).toBeVisible()
})

test('each role gets its own dashboard', async ({ page }) => {
  await signIn(page, PEOPLE.engineerNetwork)
  await expect(page.getByRole('group', { name: 'Your availability' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Matches your specialties' })).toBeVisible()

  await page.goto('/login') // signed in: bounces to the dashboard
  await expect(page.getByRole('heading', { name: 'Hi, Priya' })).toBeVisible()
})

test('the admin overview shows live numbers and charts', async ({ page }) => {
  await signIn(page, PEOPLE.admin)
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Active incidents' })).toContainText(/\d+/)
  await expect(page.getByRole('img', { name: /Line chart of incidents reported and resolved/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Engineer workload' })).toContainText('Priya Shah')

  // A deep link survives a reload.
  await page.goto('/facilities')
  await expect(page.getByRole('heading', { name: 'Facilities' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Facilities' })).toBeVisible()
})
