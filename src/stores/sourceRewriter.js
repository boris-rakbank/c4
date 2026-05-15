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
 *
 * When `filled` is false, swap `fill` ↔ `stroke` so the node renders
 * as a white box with colored text (and the same colored border).
 */
export function ensureClassDef(source, className, colorName, filled = true) {
  const color = COLORS[colorName]
  if (!color) return source

  const lines = source.split('\n')
  const defRe = new RegExp(`^\\s*classDef\\s+${esc(className)}\\b`)
  if (lines.some(l => defRe.test(l))) return source

  const fillVal   = filled ? color.fill   : color.stroke
  const strokeVal = filled ? color.stroke : color.fill
  const defLine = `    classDef ${className} fill:${fillVal},stroke:${strokeVal},color:${color.color}`

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
 * Replace all `%% @pos <id> <x> <y>` position comments with a fresh set.
 *
 * For each id in `positions`, the comment line is placed immediately above
 * the matching `class <id> ...` line if one exists; otherwise appended at
 * end of source. Old position comments for any id are removed first.
 */
export function setNodePositions(source, positions) {
  // Normalize input to a Map<id, {x, y}>
  const map = positions instanceof Map
    ? new Map(positions)
    : new Map(Object.entries(positions))

  // Step 1: strip every existing %% @pos line.
  const lines = source.split('\n').filter(l => !/^\s*%%\s*@pos\s+/.test(l))

  // Step 2: walk lines; when we hit a single-id `class` line whose id has
  // a saved position, insert the comment immediately above it.
  const out = []
  for (const line of lines) {
    const m = line.match(/^(\s*)class\s+(.+?)\s+(\S+)\s*$/)
    if (m) {
      const ids = m[2].split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length === 1 && map.has(ids[0])) {
        const { x, y } = map.get(ids[0])
        out.push(`${m[1]}%% @pos ${ids[0]} ${Math.round(x)} ${Math.round(y)}`)
        map.delete(ids[0])
      }
    }
    out.push(line)
  }

  // Step 3: any remaining ids (no class line) get appended at end.
  if (map.size > 0) {
    while (out.length && out[out.length - 1].trim() === '') out.pop()
    for (const [id, { x, y }] of map) {
      out.push(`    %% @pos ${id} ${Math.round(x)} ${Math.round(y)}`)
    }
  }

  return out.join('\n')
}

/**
 * Replace all `%% @edge <id> out <side>:<frac> path <x,y> <x,y> ... in <side>:<frac>`
 * comments with a fresh set, one per edge in `routes`.
 *
 * `routes` is a plain object keyed by edgeId (`${fromId}-${toId}`), shape:
 *   { slotOut: { side, fraction }, slotIn: { side, fraction }, points: [{x,y},...] }
 *
 * Each comment is inserted on the line immediately above the matching edge
 * line in the source, mirroring how `setNodePositions` places `@pos` comments.
 * Stale comments for edges no longer present are stripped.
 */
export function setEdgeRoutes(source, routes) {
  // Normalize input to a Map for mutation as we consume entries.
  const map = routes instanceof Map
    ? new Map(routes)
    : new Map(Object.entries(routes))

  // Step 1: strip every existing %% @edge line.
  const lines = source.split('\n').filter(l => !/^\s*%%\s*@edge\s+/.test(l))

  const fmtFrac = f => (Math.round(f * 1000) / 1000).toString()
  const fmtPt = p => `${Math.round(p.x)},${Math.round(p.y)}`

  const buildComment = (indent, edgeId, r) => {
    const out = `${r.slotOut.side}:${fmtFrac(r.slotOut.fraction)}`
    const inn = `${r.slotIn.side}:${fmtFrac(r.slotIn.fraction)}`
    const path = r.points.map(fmtPt).join(' ')
    return `${indent}%% @edge ${edgeId} out ${out} path ${path} in ${inn}`
  }

  // Edge line patterns (mirrors mermaidParser.js):
  //   "A -->|label| B"   /  "A --> B"   /   "A -- label --> B"
  // We extract from-id and to-id and look up `${from}-${to}` in routes.
  const edgePattern = /^(\w+)\s*(?:-{1,2}->|=+>|-\.->)\s*(?:\|.+?\|\s*)?(\w+)/
  const labelBeforeArrow = /^(\w+)\s*--\s+.+?\s*-->\s*(\w+)/
  const indentRe = /^(\s*)/

  // Step 2: walk lines; when we find an edge line compute the N-th
  // occurrence id (matches mermaidParser.edgeIdFor): the first
  // `A -> B` line is `A-B`, the second is `A-B#2`, etc. Insert the
  // matching comment immediately above it.
  const pairCount = new Map() // `${from}-${to}` → running count
  const out = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('%%')) {
      let m = trimmed.match(labelBeforeArrow) || trimmed.match(edgePattern)
      if (m) {
        const base = `${m[1]}-${m[2]}`
        const n = (pairCount.get(base) || 0) + 1
        pairCount.set(base, n)
        const edgeId = n === 1 ? base : `${base}#${n}`
        const r = map.get(edgeId)
        if (r && r.slotOut && r.slotIn && r.points) {
          const indent = (line.match(indentRe) || ['', ''])[1]
          out.push(buildComment(indent, edgeId, r))
          map.delete(edgeId)
        }
      }
    }
    out.push(line)
  }

  // Step 3: any remaining edges (no matching line found — should be rare)
  // get appended at the end so the metadata isn't silently lost.
  if (map.size > 0) {
    while (out.length && out[out.length - 1].trim() === '') out.pop()
    for (const [edgeId, r] of map) {
      if (!r || !r.slotOut || !r.slotIn || !r.points) continue
      out.push(buildComment('    ', edgeId, r))
    }
  }

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
export function applyNodeStyle(source, nodeId, { type, colorName, filled = true }) {
  let s = source
  if (type) s = setNodeType(s, nodeId, type)
  const className = classNameFor(type, colorName, filled)
  s = setNodeClass(s, nodeId, className)
  s = ensureClassDef(s, className, colorName, filled)
  s = pruneUnusedClassDefs(s)
  return s
}

/**
 * Update the bracket content for `nodeId`. Each field in `patch` is
 * optional; undefined keys leave the existing value alone. Empty strings
 * clear that segment (a trailing empty segment is dropped from the
 * rebuilt `<br/>` list so the source stays tidy).
 *
 *   patch = { typeTitle?: string, title?: string, description?: string }
 */
export function setNodeContent(source, nodeId, patch) {
  const re = new RegExp(`\\b(${esc(nodeId)})\\[([^\\]]*)\\]`, 'g')
  return source.replace(re, (_, id, content) => {
    const parts = content.split(/<br\s*\/?>/i).map(p => p.trim())
    // Decompose part 0 into type + typeTitle (matches mermaidParser).
    let type = ''
    let currTypeTitle = ''
    const typeMatch = (parts[0] || '').match(/^([\w-]+)\s*:\s*(.+)$/s)
    if (typeMatch) {
      type = typeMatch[1]
      currTypeTitle = typeMatch[2]
    } else if (/^[\w-]+$/.test(parts[0] || '')) {
      type = parts[0]
    } else {
      currTypeTitle = parts[0] || ''
    }
    const currTitle = parts[1] || ''
    const currDesc  = parts.slice(2).join('<br/>')

    const nextTypeTitle = patch.typeTitle   !== undefined ? patch.typeTitle   : currTypeTitle
    const nextTitle     = patch.title       !== undefined ? patch.title       : currTitle
    const nextDesc      = patch.description !== undefined ? patch.description : currDesc

    const firstPart = type
      ? (nextTypeTitle ? `${type}: ${nextTypeTitle}` : type)
      : nextTypeTitle
    // Drop trailing empty segments so we don't emit "Foo[type: x<br/><br/>]".
    const segments = [firstPart, nextTitle, nextDesc]
    while (segments.length > 1 && segments[segments.length - 1] === '') segments.pop()
    return `${id}[${segments.join('<br/>')}]`
  })
}
