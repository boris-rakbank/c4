/**
 * Pure string-based rewrites of Mermaid source for the style panel.
 *
 * All functions take a source string and return a new source string.
 */

import { COLORS, classNameFor } from '../styles/palette.js'

// Escape a string for use as a literal in a regex.
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace the leading "type:" token inside `NodeId[...]` brackets.
 * Handles three forms:
 *   NodeId[type: title<br/>...]   → replace `type`
 *   NodeId[bareType]              → replace bareType
 *   NodeId[arbitrary text]        → prepend `newType: `
 * Only the *definition* (with brackets) is touched; bare references in edges are left alone.
 */
export function setNodeType(source, nodeId, newType) {
  const re = new RegExp(`\\b(${esc(nodeId)})\\[([^\\]]*)\\]`, 'g')
  return source.replace(re, (_, id, content) => {
    const trimmed = content.trim()
    // Form A: "type: ..."
    const typeMatch = trimmed.match(/^([\w-]+)\s*:\s*(.+)$/s)
    if (typeMatch) {
      return `${id}[${newType}: ${typeMatch[2]}]`
    }
    // Form B: bare type with no other content (no <br/>)
    if (/^[\w-]+$/.test(trimmed)) {
      return `${id}[${newType}]`
    }
    // Form C: arbitrary content — prepend type
    return `${id}[${newType}: ${content}]`
  })
}

/**
 * Ensure a `classDef <className> ...` line exists. If absent, append it
 * after the last existing classDef line, or at end-of-file otherwise.
 */
export function ensureClassDef(source, className, colorName) {
  const color = COLORS[colorName]
  if (!color) return source

  const lines = source.split('\n')
  const defRe = new RegExp(`^\\s*classDef\\s+${esc(className)}\\b`)
  if (lines.some(l => defRe.test(l))) return source

  const defLine = `    classDef ${className} fill:${color.fill},stroke:${color.stroke},color:${color.color}`

  // Find last classDef line
  let lastDefIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*classDef\s+/.test(lines[i])) lastDefIdx = i
  }
  if (lastDefIdx >= 0) {
    lines.splice(lastDefIdx + 1, 0, defLine)
  } else {
    // Append at end (drop trailing empty line if any)
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push(defLine)
  }
  return lines.join('\n')
}

/**
 * Remove `nodeId` from any existing `class A,B,C foo` lines, then append
 * a new `class <nodeId> <newClassName>` line.
 */
export function setNodeClass(source, nodeId, newClassName) {
  const lines = source.split('\n')
  const out = []

  for (const line of lines) {
    const m = line.match(/^(\s*)class\s+(.+?)\s+(\S+)\s*$/)
    if (!m) {
      out.push(line)
      continue
    }
    const indent = m[1]
    const ids = m[2].split(',').map(s => s.trim()).filter(Boolean)
    const cls = m[3]
    const filtered = ids.filter(id => id !== nodeId)
    if (filtered.length === 0) {
      // Drop the line entirely
      continue
    }
    if (filtered.length === ids.length) {
      out.push(line)
    } else {
      out.push(`${indent}class ${filtered.join(',')} ${cls}`)
    }
  }

  // Append new assignment
  while (out.length && out[out.length - 1].trim() === '') out.pop()
  out.push(`    class ${nodeId} ${newClassName}`)
  return out.join('\n')
}

/**
 * Drop any `classDef X ...` line where no `class ... X` line references it.
 * Keeps the lazy invariant: removed/changed assignments don't leave dead defs.
 */
export function pruneUnusedClassDefs(source) {
  const lines = source.split('\n')

  // Collect all class names referenced by `class ... X` lines
  const used = new Set()
  for (const line of lines) {
    const m = line.match(/^\s*class\s+.+?\s+(\S+)\s*$/)
    if (m) used.add(m[1])
  }

  const out = lines.filter(line => {
    const m = line.match(/^\s*classDef\s+(\S+)\b/)
    if (!m) return true
    return used.has(m[1])
  })
  return out.join('\n')
}

/**
 * High-level: change a node's type and/or color in one shot.
 * - Updates the bracket type token (if newType provided).
 * - Removes old class assignment, adds new one.
 * - Ensures the matching classDef exists.
 * - Prunes any classDef that became unused.
 */
export function applyNodeStyle(source, nodeId, { type, colorName }) {
  let s = source
  if (type) s = setNodeType(s, nodeId, type)
  const className = classNameFor(type, colorName)
  s = setNodeClass(s, nodeId, className)
  s = ensureClassDef(s, className, colorName)
  s = pruneUnusedClassDefs(s)
  return s
}
