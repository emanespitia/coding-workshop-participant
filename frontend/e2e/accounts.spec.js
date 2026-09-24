import { expect, test } from '@playwright/test'

import { DEMO_PASSWORD, PEOPLE, signIn, signOut } from './helpers'

test('a new employee registers and is signed in straight away', async ({ page }) => {
  const email = `e2e.${Date.now().toString(36)}@acme.inc`
  const person = { email, name: 'Robin Tester' }

  await page.goto('/login')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Full name').fill(person.name)
  await page.getByLabel('Work email').fill('robin@gmail.com')
  await page.getByLabel('Password', { exact: true }).fill('Welcome2026')
  await page.getByLabel('Confirm password').fill('Welcome2026')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Use your @acme.inc work email')).toBeVisible()

  await page.getByLabel('Work email').fill(email)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Hi, Robin' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Report an incident' }).first()).toBeVisible()

  // The account works for a normal sign-in afterwards.
  await signOut(page, person)
  await signIn(page, person, 'Welcome2026')
})

// Changes Nina's password for good, so it can only succeed on a freshly seeded database (local).
test('a new hire must choose a password before using the app', { tag: '@local-only' }, async ({ page }) => {
  await signIn(page, PEOPLE.newHire)
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()
  await expect(page.getByText(/Choose a new password to continue/)).toBeVisible()

  // Other pages send them back until they do.
  await page.goto('/incidents')
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()

  await page.getByLabel('Current password').fill(DEMO_PASSWORD)
  await page.getByLabel('New password', { exact: true }).fill('MyOwnPass2026')
  await page.getByLabel('Confirm new password').fill('MyOwnPass2026')
  await page.getByRole('button', { name: 'Change password' }).click()

  await expect(page.getByRole('heading', { name: 'Hi, Nina' })).toBeVisible()
  await expect(page.getByText('Your new password is set. Welcome!')).toBeVisible()

  // The old password no longer works; the new one does.
  await signOut(page, PEOPLE.newHire)
  await page.getByLabel('Work email').fill(PEOPLE.newHire.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText("don't match")
  await signIn(page, PEOPLE.newHire, 'MyOwnPass2026')
})

test('sign-in explains wrong passwords and disabled accounts', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(PEOPLE.employee.email)
  await page.getByLabel('Password', { exact: true }).fill('not-the-password1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText("That email and password don't match an account.")

  await page.getByLabel('Work email').fill(PEOPLE.deactivated.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('This account has been disabled')
})

test('a session survives a reload, and sign-out ends it', async ({ page }) => {
  await signIn(page, PEOPLE.employee)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hi, Maria' })).toBeVisible()
  await signOut(page, PEOPLE.employee)
  await page.goto('/incidents')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
