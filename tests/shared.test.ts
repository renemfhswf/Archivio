import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatCount,
  formatDuration,
  shortenPath
} from '../src/shared/format'
import {
  extensionOf,
  isSamePath,
  nextNumberedName,
  numberedName,
  parentPath,
  sanitizeFileName,
  splitName
} from '../src/shared/naming'
import {
  buildDuplicateGroups,
  newestKeeper,
  recomputeReportTotals,
  suggestedKeeper,
  wastedBytes
} from '../src/shared/duplicates'
import type { HashedFile } from '../src/shared/duplicates'
import { csvEscape, toCsv } from '../src/shared/csv'

describe('format', () => {
  it('formats byte sizes with German separators', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(-1)).toBe('–')
    expect(formatBytes(Number.NaN)).toBe('–')
  })

  it('formats counts and durations', () => {
    expect(formatCount(1234567)).toBe('1.234.567')
    expect(formatDuration(500)).toBe('500 ms')
    expect(formatDuration(42_000)).toBe('42 s')
    expect(formatDuration(125_000)).toBe('2 min 5 s')
    expect(formatDuration(3_720_000)).toBe('1 h 2 min')
    expect(formatDuration(-5)).toBe('–')
  })

  it('shortens long paths while keeping the end', () => {
    const path = 'C:\\Users\\Beispiel\\Dokumente\\Archiv\\2024\\Rechnungen\\Januar\\datei.pdf'
    const shortened = shortenPath(path, 40)
    expect(shortened.length).toBeLessThanOrEqual(40)
    expect(shortened).toContain('datei.pdf')
  })

  it('returns short paths unchanged', () => {
    expect(shortenPath('C:\\Test', 40)).toBe('C:\\Test')
  })
})

describe('naming', () => {
  it('splits names into base and extension', () => {
    expect(splitName('bericht.pdf')).toEqual({
      base: 'bericht',
      extension: '.pdf'
    })
    expect(splitName('archiv.tar.gz')).toEqual({
      base: 'archiv.tar',
      extension: '.gz'
    })
    expect(splitName('ohne-endung')).toEqual({
      base: 'ohne-endung',
      extension: ''
    })
    expect(splitName('.versteckt')).toEqual({
      base: '.versteckt',
      extension: ''
    })
  })

  it('numbers duplicate names', () => {
    expect(numberedName('bild.jpg', 1)).toBe('bild.jpg')
    expect(numberedName('bild.jpg', 2)).toBe('bild (2).jpg')
    expect(numberedName('ohne-endung', 3)).toBe('ohne-endung (3)')
  })

  it('finds the next free numbered name case-insensitively', () => {
    expect(nextNumberedName('bild.jpg', new Set())).toBe('bild.jpg')
    expect(nextNumberedName('bild.jpg', new Set(['BILD.JPG']))).toBe(
      'bild (2).jpg'
    )
    expect(
      nextNumberedName('bild.jpg', new Set(['bild.jpg', 'bild (2).jpg']))
    ).toBe('bild (3).jpg')
  })

  it('sanitizes file names for Windows', () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j')).toBe('a_b_c_d_e_f_g_h_i_j')
    expect(sanitizeFileName('name. ')).toBe('name')
    expect(sanitizeFileName('CON')).toBe('_CON')
    expect(sanitizeFileName('')).toBe('unbenannt')
  })

  it('compares paths according to the platform', () => {
    expect(isSamePath('C:\\Test\\A.txt', 'c:/test/a.txt', 'win32')).toBe(true)
    expect(isSamePath('/tmp/A', '/tmp/a', 'linux')).toBe(false)
  })

  it('derives extensions and parent paths', () => {
    expect(extensionOf('Foto.JPG')).toBe('jpg')
    expect(extensionOf('ohne')).toBe('')
    expect(parentPath('C:\\Users\\Test\\a.txt')).toBe('C:\\Users\\Test')
    expect(parentPath('/home/user/a.txt')).toBe('/home/user')
    expect(parentPath('/')).toBeNull()
  })
})

function hashed(
  path: string,
  hash: string,
  size: number,
  modifiedMs: number
): HashedFile {
  const parts = path.split('/')
  return {
    path,
    name: parts[parts.length - 1],
    dir: parts.slice(0, -1).join('/'),
    size,
    modifiedMs,
    hash
  }
}

describe('duplicate grouping', () => {
  it('calculates wasted bytes', () => {
    expect(wastedBytes(100, 1)).toBe(0)
    expect(wastedBytes(100, 3)).toBe(200)
    expect(wastedBytes(100, 0)).toBe(0)
  })

  it('groups only files with identical size and hash', () => {
    const groups = buildDuplicateGroups([
      hashed('/a/eins.txt', 'aaa', 10, 1000),
      hashed('/b/eins-kopie.txt', 'aaa', 10, 2000),
      hashed('/c/zwei.txt', 'bbb', 10, 3000),
      hashed('/d/drei.txt', 'aaa', 11, 4000)
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(2)
    expect(groups[0].size).toBe(10)
    expect(groups[0].wastedBytes).toBe(10)
    expect(groups[0].files.map((file) => file.name)).toEqual([
      'eins.txt',
      'eins-kopie.txt'
    ])
  })

  it('sorts groups by wasted bytes descending', () => {
    const groups = buildDuplicateGroups([
      hashed('/a/1.txt', 'h1', 5, 1),
      hashed('/b/1.txt', 'h1', 5, 1),
      hashed('/c/2.txt', 'h2', 50, 1),
      hashed('/d/2.txt', 'h2', 50, 1),
      hashed('/e/2.txt', 'h2', 50, 1)
    ])
    expect(groups.map((group) => group.size)).toEqual([50, 5])
  })

  it('suggests oldest and newest keeper', () => {
    const files = [
      { path: '/a/alt.txt', name: 'alt.txt', dir: '/a', size: 1, modifiedMs: 100 },
      { path: '/b/neu.txt', name: 'neu.txt', dir: '/b', size: 1, modifiedMs: 900 },
      { path: '/c/mitte.txt', name: 'mitte.txt', dir: '/c', size: 1, modifiedMs: 500 }
    ]
    expect(suggestedKeeper(files)).toBe('/a/alt.txt')
    expect(newestKeeper(files)).toBe('/b/neu.txt')
    expect(suggestedKeeper([])).toBeNull()
  })

  it('recomputes report totals', () => {
    const groups = buildDuplicateGroups([
      hashed('/a/x.txt', 'same', 20, 1),
      hashed('/b/x.txt', 'same', 20, 1),
      hashed('/c/y.txt', 'same', 20, 1)
    ])
    expect(recomputeReportTotals(groups)).toEqual({
      totalBytes: 60,
      wastedBytes: 40
    })
  })
})

describe('csv', () => {
  it('escapes separators and quotes', () => {
    expect(csvEscape('einfach')).toBe('einfach')
    expect(csvEscape('mit;semikolon')).toBe('"mit;semikolon"')
    expect(csvEscape('mit"zitat')).toBe('"mit""zitat"')
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(42)).toBe('42')
  })

  it('builds CRLF separated rows', () => {
    const csv = toCsv([
      ['Name', 'Größe'],
      ['a;b.txt', 12]
    ])
    expect(csv).toBe('Name;Größe\r\n"a;b.txt";12')
    expect(toCsv([['a', 'b']], ',')).toBe('a,b')
  })
})
