/** Form rules shared by several pages. Password rules match the backend (app/core/security.py). */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const EMAIL_DOMAIN = 'acme.inc'

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_RULES = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { label: 'A letter and a number', test: (p) => /[a-z]/i.test(p) && /\d/.test(p) },
]

/** A message for sign-in or registration failures that aren't about one field. */
export function describeAuthError(error) {
  if (error.code === 'NETWORK_ERROR' || error.code === 'ACCOUNT_DISABLED') return error.message
  if (error.status >= 500) return 'The helpdesk is having trouble right now. Try again in a moment.'
  return error.message
}

/** The first password rule `password` breaks, as an error message, or undefined. */
export function passwordError(password) {
  if (!password) return 'Choose a password'
  const broken = PASSWORD_RULES.find((rule) => !rule.test(password))
  return broken ? `Password needs: ${broken.label.toLowerCase()}` : undefined
}

/** Map the API's snake_case field names onto a form's field names. */
export function mapFieldErrors(fields = {}, names = {}) {
  return Object.fromEntries(Object.entries(fields).map(([name, message]) => [names[name] ?? name, message]))
}
