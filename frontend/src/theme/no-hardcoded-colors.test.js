import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Colors belong in src/theme/tokens.js; everything else uses the theme (see DESIGN.md).
const SRC = join(import.meta.dirname, '..')
const ALLOWED = ['theme/tokens.js', 'theme/index.js']
const COLOR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(jsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('design system', () => {
  it('keeps color values in the theme tokens only', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path))
      .filter((file) => !ALLOWED.includes(file))
      .flatMap((file) => readFileSync(join(SRC, file), 'utf8').split('\n')
        .map((line, i) => (COLOR.test(line) ? `${file}:${i + 1}  ${line.trim()}` : null))
        .filter(Boolean))
    expect(offenders, 'Use theme colors (e.g. "text.secondary", "brand.main") instead').toEqual([])
  })
})
