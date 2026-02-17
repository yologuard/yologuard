#!/usr/bin/env npx tsx

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

type TreeEntry = {
  name: string
  path: string
  isDirectory: boolean
  children: TreeEntry[]
  position: number
}

const MARKERS = {
  START: '<!-- docs-index -->',
  END: '<!-- /docs-index -->',
} as const

const extractMarkdownMeta = (filePath: string): { title: string | null; position: number | null } => {
  const content = readFileSync(filePath, 'utf-8')

  let title: string | null = null
  let position: number | null = null

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch) title = titleMatch[1]
    const positionMatch = frontmatter.match(/^sidebar_position:\s*(\d+)\s*$/m)
    if (positionMatch) position = parseInt(positionMatch[1], 10)
  }

  return { title, position }
}

const buildTree = ({ dirPath, rootPath }: { dirPath: string; rootPath: string }): TreeEntry[] => {
  const entries = readdirSync(dirPath)
    .filter((name) => !name.startsWith('.'))
    .sort()

  const treeEntries = entries
    .map((name) => {
      const fullPath = join(dirPath, name)
      const relativePath = relative(rootPath, fullPath)
      const isDirectory = statSync(fullPath).isDirectory()

      if (isDirectory) {
        return {
          name,
          path: relativePath,
          isDirectory: true,
          children: buildTree({ dirPath: fullPath, rootPath }),
          position: Infinity,
        } satisfies TreeEntry
      }

      if (name.endsWith('.md')) {
        const meta = extractMarkdownMeta(fullPath)
        return {
          name,
          path: relativePath,
          isDirectory: false,
          children: [],
          position: meta.position ?? Infinity,
        } satisfies TreeEntry
      }

      return null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  return treeEntries.sort((a, b) => a.position - b.position)
}

const formatDirectoryEntry = ({ entry, parentPath = '' }: { entry: TreeEntry; parentPath?: string }): string[] => {
  const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name

  const directFiles = entry.children.filter((child) => !child.isDirectory)
  const subdirs = entry.children.filter((child) => child.isDirectory)

  const lines: string[] = []

  if (directFiles.length > 0) {
    const fileNames = directFiles.map((child) => child.name).join(',')
    lines.push(`${currentPath}:{${fileNames}}`)
  }

  for (const subdir of subdirs) {
    lines.push(...formatDirectoryEntry({ entry: subdir, parentPath: currentPath }))
  }

  return lines
}

const generateCompressedIndex = ({ docsDir, rootPath }: { docsDir: string; rootPath: string }): string => {
  const tree = buildTree({ dirPath: docsDir, rootPath: docsDir })

  const header = [
    `[YoloGuard Docs Index]`,
    `root: ${rootPath}`,
    'IMPORTANT: Read relevant docs before making changes',
  ]

  const entries: string[] = []

  for (const entry of tree) {
    if (entry.isDirectory) {
      entries.push(...formatDirectoryEntry({ entry }))
    } else {
      entries.push(`{${entry.name}}`)
    }
  }

  return [...header, ...entries].join('|')
}

const updateFileWithIndex = ({ filePath, index }: { filePath: string; index: string }): void => {
  const wrappedIndex = [MARKERS.START, index, MARKERS.END].join('\n')

  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${wrappedIndex}\n`)
    console.log(`Created ${filePath}`)
    return
  }

  const content = readFileSync(filePath, 'utf-8')

  const hasStartMarker = content.includes(MARKERS.START)
  const hasEndMarker = content.includes(MARKERS.END)

  let newContent: string

  if (hasStartMarker && hasEndMarker) {
    const startIndex = content.indexOf(MARKERS.START)
    const endIndex = content.indexOf(MARKERS.END) + MARKERS.END.length
    newContent = content.slice(0, startIndex) + wrappedIndex + content.slice(endIndex)
    console.log(`Updated existing index in ${filePath}`)
  } else if (hasStartMarker) {
    const startIndex = content.indexOf(MARKERS.START)
    newContent = content.slice(0, startIndex) + wrappedIndex
    console.log(`Fixed malformed index in ${filePath}`)
  } else {
    newContent = `${content.trimEnd()}\n\n${wrappedIndex}\n`
    console.log(`Appended index to ${filePath}`)
  }

  writeFileSync(filePath, newContent)
}

const main = () => {
  const cwd = process.cwd()
  const docsDir = join(cwd, 'docs')

  if (!existsSync(docsDir)) {
    console.error('Error: docs/ directory not found')
    process.exit(1)
  }

  console.log('Generating compressed docs index...')
  const index = generateCompressedIndex({ docsDir, rootPath: './docs' })

  const claudeMdPath = join(cwd, 'CLAUDE.md')
  updateFileWithIndex({ filePath: claudeMdPath, index })

  console.log('\nDone! CLAUDE.md now contains a compressed docs index.')
}

main()
