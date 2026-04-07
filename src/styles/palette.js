/**
 * Single source of truth for component styling.
 *
 * Color convention (matches mermaidParser.js inversion):
 *   fill   → background
 *   stroke → font/text color
 *   color  → frame/border color
 */

export const COLORS = {
  Blue:   { fill: '#ffffff', stroke: '#1168bd', color: '#1168bd' },
  Green:  { fill: '#ffffff', stroke: '#3a7d28', color: '#3a7d28' },
  Red:    { fill: '#ffffff', stroke: '#cc0000', color: '#cc0000' },
  Gray:   { fill: '#ffffff', stroke: '#6b6b6b', color: '#6b6b6b' },
  Orange: { fill: '#ffffff', stroke: '#d97706', color: '#d97706' },
  Purple: { fill: '#ffffff', stroke: '#7c3aed', color: '#7c3aed' },
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

// "personRed", "serverAppBlue", etc.
export function classNameFor(type, colorName) {
  return camel(type) + colorName
}

// Reverse: "serverAppRed" → { type: "server-app", colorName: "Red" }
// Returns null if className doesn't match any type+color combo.
export function parseClassName(className) {
  if (!className) return null
  for (const colorName of COLOR_NAMES) {
    if (className.endsWith(colorName)) {
      const camelType = className.slice(0, -colorName.length)
      // Find the type whose camel form matches
      const type = TYPES.find(t => camel(t) === camelType)
      if (type) return { type, colorName }
    }
  }
  return null
}
