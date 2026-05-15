/**
 * Single source of truth for component styling.
 *
 * Color convention (matches mermaidParser.js inversion):
 *   fill   → background
 *   stroke → font/text color
 *   color  → frame/border color
 */

export const COLORS = {
  Blue:   { fill: '#1168bd', stroke: '#ffffff', color: '#1168bd' },
  Green:  { fill: '#3a7d28', stroke: '#ffffff', color: '#3a7d28' },
  Red:    { fill: '#cc0000', stroke: '#ffffff', color: '#cc0000' },
  Gray:   { fill: '#6b6b6b', stroke: '#ffffff', color: '#6b6b6b' },
  Orange: { fill: '#d97706', stroke: '#ffffff', color: '#d97706' },
  Purple: { fill: '#7c3aed', stroke: '#ffffff', color: '#7c3aed' },
}

export const COLOR_NAMES = Object.keys(COLORS)

export const TYPES = [
  'person',
  'system',
  'container',
  'database',
  's3',
  'spa',
  'server-app',
  'aws',
  'bus',
  'directory',
  'boundary',
]

export const DEFAULT_COLOR = 'Blue'

// Convert "server-app" → "serverApp"
function camel(type) {
  return type.replace(/-(\w)/g, (_, c) => c.toUpperCase())
}

// "personRed", "serverAppBlue", "containerBlueOutline", etc.
// Outline (not-filled) variants get an "Outline" suffix.
export function classNameFor(type, colorName, filled = true) {
  return camel(type) + colorName + (filled ? '' : 'Outline')
}

// Reverse: "serverAppRedOutline" → { type: "server-app", colorName: "Red", filled: false }
// Returns null if className doesn't match any type+color combo.
export function parseClassName(className) {
  if (!className) return null
  let filled = true
  let base = className
  if (base.endsWith('Outline')) {
    filled = false
    base = base.slice(0, -'Outline'.length)
  }
  for (const colorName of COLOR_NAMES) {
    if (base.endsWith(colorName)) {
      const camelType = base.slice(0, -colorName.length)
      // Find the type whose camel form matches
      const type = TYPES.find(t => camel(t) === camelType)
      if (type) return { type, colorName, filled }
    }
  }
  return null
}
