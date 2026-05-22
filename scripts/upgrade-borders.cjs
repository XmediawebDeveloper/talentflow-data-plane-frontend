/**
 * REVERSE MODE: undo the previous broad border-darkening pass.
 *   - <input>/<select>/<textarea>/<table>/<thead>/<tbody>/<tr>/<th>/<td>:
 *       border-gray-300  -> border-gray-200
 *       border-slate-300 -> border-slate-200
 *   - Everywhere else (card containers):
 *       border-slate-300 -> border-slate-200/80   (only inside class-attr strings)
 *
 * Run: node scripts/upgrade-borders.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git', 'out', 'scripts']);
const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js']);

// JSX-aware: match open tag of these elements across multiple lines.
const ELEMENTS = ['input', 'select', 'textarea', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
const OPEN_TAG_RE = new RegExp('<(' + ELEMENTS.join('|') + ')\\b([^>]*)>', 'gs');

// Only 3 files had border-slate-200/80 → border-slate-300 swaps (cards):
const CARD_FILES = new Set([
  path.join(ROOT, 'app', '(dashboard)', 'dashboard', 'page.tsx'),
  path.join(ROOT, 'components', 'dashboard', 'DashboardQuickAccess.tsx'),
  path.join(ROOT, 'components', 'JobsListing.tsx'),
]);

let totalFiles = 0;
let totalReplacements = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && EXTS.has(path.extname(entry.name))) processFile(full);
  }
}

function processFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const before = src;
  let fileReplacements = 0;

  // 1) Reverse the JSX-aware input/table pass.
  src = src.replace(OPEN_TAG_RE, (match, tag, attrs) => {
    let newAttrs = attrs;
    if (attrs.includes('border-gray-300')) {
      newAttrs = newAttrs.replace(/border-gray-300\b/g, () => {
        fileReplacements++;
        return 'border-gray-200';
      });
    }
    if (newAttrs.includes('border-slate-300') && !newAttrs.includes('border-slate-300/')) {
      newAttrs = newAttrs.replace(/border-slate-300(?![/0-9])/g, () => {
        fileReplacements++;
        return 'border-slate-200';
      });
    }
    if (newAttrs === attrs) return match;
    return `<${tag}${newAttrs}>`;
  });

  // 2) Reverse the card pass for the 3 known card files.
  if (CARD_FILES.has(file)) {
    src = src.replace(/border-slate-300(?![/0-9])/g, () => {
      fileReplacements++;
      return 'border-slate-200/80';
    });
  }

  if (src !== before) {
    fs.writeFileSync(file, src, 'utf8');
    totalFiles++;
    totalReplacements += fileReplacements;
    console.log(`  ${path.relative(ROOT, file)}: ${fileReplacements}`);
  }
}

console.log('Reverting border darkening ...');
walk(ROOT);
console.log(`\nDone. Files changed: ${totalFiles}. Replacements: ${totalReplacements}.`);
