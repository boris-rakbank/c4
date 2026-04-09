/**
 * Convert a Mermaid `sequenceDiagram` source to a `graph TD` flowchart
 * source that the app's existing parser can consume.
 *
 * Pure module — no Vue / Pinia dependencies.
 *
 * Handles:
 *   - `sequenceDiagram` header
 *   - `participant ID [as Label]` → `system`-type node
 *   - `actor ID [as Label]` → `person`-type node
 *   - messages `A -> B : label` (all arrow variants)
 *   - dashed arrows (`-->>`, `-->`, `--x`) flagged as responses and
 *     conditionally filtered
 *   - flattens `alt/else/opt/loop/par/and/break/rect/critical`: inner
 *     messages are kept, the control keywords themselves are dropped
 *   - drops `Note ...`, `activate`, `deactivate`, `autonumber`, `title`
 *
 * Implicit participants (names used in messages but never declared)
 * are auto-added as `system` nodes.
 */

const CONTROL_KEYWORDS = new Set([
  'alt', 'else', 'opt', 'loop', 'par', 'and', 'break',
  'rect', 'critical', 'option', 'end',
])

const SKIP_KEYWORDS = /^(note\b|activate\b|deactivate\b|title\b|link\b|links\b|properties\b|details\b)/i

// One of the participant/actor declaration patterns:
//   participant Foo
//   participant Foo as Foo Bar
//   actor U as User
const DECL_RE = /^(participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/i

// Sequence-diagram arrow forms:
//   -> -->  ->>  -->>  -x --x  -) --)
// The arrow is the longest run of `-`, optional second `-`, then one of
// `> >> x )` (with optional trailing `>` for `>>`).
// Prefix `--` means dashed (response).
const MESSAGE_RE = /^(\w+)\s*(-{1,2}(?:>>?|x|\)))\s*(\w+)\s*(?::\s*(.*))?$/

function sanitizeId(id) {
  return id.replace(/[^A-Za-z0-9_]/g, '_')
}

function escapeLabel(s) {
  // Mermaid flowchart node brackets don't like `]`; the parser splits on
  // `<br/>` so `<` / `>` outside that marker are risky too.
  return String(s)
    .replace(/\]/g, ')')
    .replace(/<br\s*\/?>/gi, ' ')
    .trim()
}

export function convertSequenceToGraph(source, { showResponses = false } = {}) {
  const rawLines = String(source || '').split('\n')

  // Map<id, { type: 'person'|'system', label: string }>
  const participants = new Map()
  // Array<{ from, to, label, isResponse }>
  const messages = []
  // Mermaid `autonumber` directive: if present anywhere in the source we
  // prepend a step index to each emitted edge label, matching how a
  // rendered sequence diagram would show the step number. Mermaid also
  // allows `autonumber <start> [<step>]` to customize the starting value
  // and increment (e.g. `autonumber 10 5` → 10, 15, 20...).
  let autonumber = false
  let autonumberStart = 1
  let autonumberStep = 1

  const addParticipant = (id, type, label) => {
    const sid = sanitizeId(id)
    const existing = participants.get(sid)
    if (!existing) {
      participants.set(sid, { type, label: label || id })
      return
    }
    // Upgrade system → person if we later see an `actor` decl for the same id.
    if (type === 'person' && existing.type !== 'person') {
      existing.type = 'person'
    }
    if (label && existing.label === existing.label && label !== id) {
      existing.label = label
    }
  }

  for (const raw of rawLines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('%%')) continue
    if (/^sequenceDiagram\b/i.test(line)) continue
    const autonumMatch = line.match(/^autonumber(?:\s+(\d+)(?:\s+(\d+))?)?\s*$/i)
    if (autonumMatch) {
      autonumber = true
      if (autonumMatch[1]) autonumberStart = parseInt(autonumMatch[1], 10)
      if (autonumMatch[2]) autonumberStep  = parseInt(autonumMatch[2], 10)
      continue
    }
    if (SKIP_KEYWORDS.test(line)) continue

    // Control keywords: drop the line itself, keep nested content.
    const firstWord = line.split(/\s+/)[0].toLowerCase()
    if (CONTROL_KEYWORDS.has(firstWord)) continue

    // Participant / actor declaration
    const declMatch = line.match(DECL_RE)
    if (declMatch) {
      const kind = declMatch[1].toLowerCase()
      const id = declMatch[2]
      const label = declMatch[3]?.trim() || id
      addParticipant(id, kind === 'actor' ? 'person' : 'system', label)
      continue
    }

    // Message line
    const msgMatch = line.match(MESSAGE_RE)
    if (msgMatch) {
      const from = sanitizeId(msgMatch[1])
      const to = sanitizeId(msgMatch[3])
      const arrow = msgMatch[2]
      const label = escapeLabel(msgMatch[4] ?? '')
      // Auto-declare implicit participants.
      if (!participants.has(from)) addParticipant(from, 'system', msgMatch[1])
      if (!participants.has(to))   addParticipant(to,   'system', msgMatch[3])
      const isResponse = /^--/.test(arrow)
      // `position` is the 0-based index in the original sequence, assigned
      // before response filtering, so numbers match what a rendered
      // sequence diagram would show regardless of whether responses are
      // kept in the converted graph.
      messages.push({ from, to, label, isResponse, position: messages.length })
      continue
    }
    // Anything else is silently ignored.
  }

  // Filter responses if requested.
  const finalMessages = showResponses
    ? messages
    : messages.filter(m => !m.isResponse)

  // Emit graph source.
  const out = ['graph TD']
  for (const [id, p] of participants) {
    const labelTxt = escapeLabel(p.label)
    out.push(`    ${id}[${p.type}: ${labelTxt}<br/>${labelTxt}]`)
  }
  for (const m of finalMessages) {
    const stepNumber = autonumberStart + m.position * autonumberStep
    const numberPrefix = autonumber ? `${stepNumber}. ` : ''
    const combined = `${numberPrefix}${m.label}`.trim()
    if (combined) {
      out.push(`    ${m.from} -->|${combined}| ${m.to}`)
    } else {
      out.push(`    ${m.from} --> ${m.to}`)
    }
  }
  return out.join('\n')
}
