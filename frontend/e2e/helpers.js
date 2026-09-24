import { expect } from '@playwright/test'

/**
 * Password of the seeded demo accounts: Password123 locally; on the deployed site, the one
 * the seed_demo_data task was given or returned (set E2E_PASSWORD).
 */
export const DEMO_PASSWORD = process.env.E2E_PASSWORD || 'Password123'

export const PEOPLE = {
  admin: { email: 'morgan.facilities@acme.inc', name: 'Morgan Facilities', first: 'Morgan' },
  employee: { email: 'maria.garcia@acme.inc', name: 'Maria Garcia', first: 'Maria' },
  otherEmployee: { email: 'jane.doe@acme.inc', name: 'Jane Doe', first: 'Jane' },
  engineerNetwork: { email: 'priya.shah@acme.inc', name: 'Priya Shah', first: 'Priya' },
  engineerPlumbing: { email: 'diego.martinez@acme.inc', name: 'Diego Martinez', first: 'Diego' },
  newHire: { email: 'nina.patel@acme.inc', name: 'Nina Patel', first: 'Nina' },
  deactivated: { email: 'chris.taylor@acme.inc', name: 'Chris Taylor' },
}

/** A title no other test or demo incident uses, marked [e2e] so test data is easy to spot. */
export function uniqueTitle(text) {
  return `[e2e] ${text} ${Date.now().toString(36)}`
}

/** Sign in from the login page and wait for the signed-in app. */
export async function signIn(page, person, password = DEMO_PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(person.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: `Account menu for ${person.name}` })).toBeVisible()
}

export async function signOut(page, person) {
  await page.getByRole('button', { name: `Account menu for ${person.name}` }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
}

/** Follow a link in the main navigation bar. */
export async function navigateTo(page, label) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click()
}

/** Choose an option in a Material UI select (labelled combobox). */
export async function choose(scope, label, option) {
  await scope.getByRole('combobox', { name: label }).click()
  const page = typeof scope.page === 'function' ? scope.page() : scope  // options render at page level
  await page.getByRole('option', { name: option, exact: true }).click()
}

/** Report an incident from the Report page; returns its id. */
export async function reportIncident(page, { title, details, category, urgency, building, floor, seat }) {
  await page.goto('/incidents/new')
  await page.getByLabel(/What's wrong\?/).fill(title)
  await page.getByLabel(/Details/).fill(details)
  await choose(page, 'Kind of problem', category)
  if (urgency) await choose(page, /How urgent is it\?|Priority/, urgency)
  await choose(page, 'Building', building)
  if (floor) await choose(page, 'Floor', floor)
  if (seat) await choose(page, 'Seat or desk', seat)
  await page.getByRole('button', { name: 'Report incident' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  return Number(page.url().match(/\/incidents\/(\d+)/)[1])
}

/** The status chips at the top of an incident page. */
export function statusChip(page, status) {
  return page.getByRole('main').locator('.MuiChip-root', { hasText: new RegExp(`^${status}$`) }).first()
}
