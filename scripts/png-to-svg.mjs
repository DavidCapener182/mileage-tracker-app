#!/usr/bin/env node
/**
 * Converts a PNG to SVG using potrace (bitmap tracing).
 * Usage: node scripts/png-to-svg.mjs [input.png] [output.svg]
 */

import { trace } from 'potrace';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const input = process.argv[2] || resolve(root, 'public/mileage-tracker-pro-icon.png');
const output = process.argv[3] || resolve(root, 'public/mileage-tracker-pro-icon.svg');

// Trace the light (white) parts of the icon so we get the speedometer + road shape
const options = {
  threshold: 200,
  blackOnWhite: false,
  color: '#ffffff',
  background: 'transparent',
};

trace(input, options, (err, svg) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  // Add blue circle background so icon shows white-on-blue (match PNG)
  const withBackground = svg.replace(
    /<svg([^>]*)>/,
    (m) => {
      const viewBoxMatch = m.match(/viewBox="([^"]+)"/);
      const vb = viewBoxMatch ? viewBoxMatch[1] : '0 0 271 271';
      const [,, w, h] = vb.split(/\s+/).map(Number);
      const cx = (w || 271) / 2;
      const cy = (h || 271) / 2;
      const r = Math.min(cx, cy) - 2;
      return m + `\n  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1e40af"/>`;
    }
  );
  writeFileSync(output, withBackground);
  console.log('Wrote:', output);
});
