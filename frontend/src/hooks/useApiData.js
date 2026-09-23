import { useCallback, useEffect, useState } from 'react'

import { api } from '../services/api'

/**
 * Load JSON from the API and keep it in state.
 *
 * Returns { data, error, loading, reload, setData }. Pass `null` as the path to skip
 * loading. While reloading, the previous data stays on screen.
 */
export function useApiData(path) {
  const [state, setState] = useState({ path: null, version: -1, data: null, error: null })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!path) return undefined
    let active = true
    api.get(path).then(
      (data) => active && setState({ path, version, data, error: null }),
      (error) => active && setState({ path, version, data: null, error }),
    )
    return () => {
      active = false
    }
  }, [path, version])

  const current = state.path === path
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback((update) => {
    setState((s) => ({ ...s, data: typeof update === 'function' ? update(s.data) : update }))
  }, [])

  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: Boolean(path) && (!current || state.version !== version),
    reload,
    setData,
  }
}
