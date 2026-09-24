/**
 * Before testing the deployed site: wake it up. The first request after a quiet spell starts
 * the Lambda and resumes the paused Aurora database, which can take ~30 s; waiting here keeps
 * that delay out of the first test. Also fails fast with a clear message if the site is down.
 */
export default async function wakeDeployedSite(config) {
  const base = config.projects[0].use.baseURL
  const deadline = Date.now() + 120_000
  let last = 'no response'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/helpdesk/health`)
      if (response.ok) return
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error.message
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error(`${base}/api/helpdesk/health did not answer OK within 2 minutes (${last})`)
}
