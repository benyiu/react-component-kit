// Every class this kit renders must have at least one rule that a consumer can
// actually reach.
//
// A kit is cut out of a host application, and CSS is where that shows. A rule
// like `#cddFormPanel .f-address-pair { ... }` is real styling in the host and
// nothing at all in a new project, because the new project has no
// #cddFormPanel. The class looks styled to every grep — the stylesheet names it
// — and the element renders unstyled. That is the same trap the source project
// documents as "this class has no rules ≠ this element is unstyled", read in
// the other direction: the stylesheet mentioning a class does not mean the
// class is styled HERE.
//
// So this test sorts every rendered class into one of three buckets and pins
// the membership. It does not demand the buckets be empty — some of these are
// genuinely inherited from the host and a consumer has to restyle them. What it
// refuses is silent drift: a class moving into ANCHORED or UNREACHED without
// anyone deciding that is what should happen.
//
// The two buckets are separate on purpose, because the remedy differs. An
// ANCHORED class has styling that exists and needs an ancestor you can supply —
// wrap the widget in the named id and it works. An UNREACHED class has no
// styling in this kit at all; the rules live in a host stylesheet the kit does
// not ship, or nowhere.
//
// It runs in the vitest lane despite touching no component, because that lane
// is what `npm test` runs first and a styling guard nobody runs is not a guard.
// It uses node:assert rather than expect() so its failure messages stay the
// instructions they are.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Rendered vocabulary: what the kit's own components put on elements.
// ---------------------------------------------------------------------------
function kitSources() {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push([path.slice(KIT.length + 1), readFileSync(path, 'utf8')]);
    }
  })(join(KIT, 'src'));
  return out;
}

// Literal class names only. A name built by concatenation — `'badge-' + kind`
// — yields a fragment, and a fragment scanned as a class name is how a scanner
// reports half a name as dead. Anything containing an interpolation marker is
// dropped rather than guessed at.
function renderedClasses(sources) {
  const found = new Map();
  const add = (name, file) => {
    if (!name || /[${}]/.test(name)) return;
    if (!found.has(name)) found.set(name, new Set());
    found.get(name).add(file);
  };
  for (const [file, src] of sources) {
    for (const m of src.matchAll(/className\s*=\s*["'`]([^"'`]+)["'`]/g)) m[1].split(/\s+/).forEach((c) => add(c, file));
    for (const m of src.matchAll(/className:\s*["'`]([^"'`]+)["'`]/g)) m[1].split(/\s+/).forEach((c) => add(c, file));
    for (const m of src.matchAll(/class\s*=\s*\\?["']([^"'\\]+)\\?["']/g)) m[1].split(/\s+/).forEach((c) => add(c, file));
    for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\(([^)]*)\)/g)) {
      for (const lit of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) lit[1].split(/\s+/).forEach((c) => add(c, file));
    }
  }
  return found;
}

function renderedIds(sources) {
  const ids = new Set();
  for (const [, src] of sources) {
    for (const m of src.matchAll(/\bid\s*=\s*["'`]([A-Za-z_][-\w]*)["'`]/g)) ids.add(m[1]);
    for (const m of src.matchAll(/getElementById\(\s*["'`]([A-Za-z_][-\w]*)["'`]/g)) ids.add(m[1]);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Every selector in the kit's stylesheets, one per comma-separated alternative.
// @media blocks are transparent here: a rule inside one still styles the class,
// just at some widths.
// ---------------------------------------------------------------------------
function kitSelectors() {
  const out = [];
  const dir = join(KIT, 'src', 'styles');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const prelude = m[1].trim();
      if (!prelude || prelude.startsWith('@')) continue;
      for (const one of prelude.split(',')) {
        const sel = one.trim().replace(/\s+/g, ' ');
        if (sel) out.push({ sel, file: name });
      }
    }
  }
  return out;
}

// Exact boundary. `.f-btn` must not be satisfied by `.f-btn-col`, and a BEM
// modifier must not vouch for a base class with no rules of its own.
const mentions = (selector, cls) =>
  new RegExp(`\\.${cls.replace(/-/g, '\\-')}(?![-\\w])`).test(selector);

// A class counts as styled if it appears ANYWHERE in the selector, not only as
// the subject. `.auth-terms label { ... }` styles the label because the wrapper
// carries the class — the wrapper is load-bearing even though no declaration
// lands on it. An earlier version of this check looked only at the rightmost
// compound and reported four such classes as unstyled; that heuristic is why
// this comment exists.
const idsIn = (selector) => [...selector.matchAll(/#([A-Za-z_][-\w]*)/g)].map((m) => m[1]);

// ---------------------------------------------------------------------------
// The pins. Every entry names why it is here and what a consumer must do.
// ---------------------------------------------------------------------------

// Styled only through a host id this kit never renders. The rules ship; they
// need an ancestor the source application provides and a new project does not.
const ANCHORED = new Map([
  ['f-bo-item', '#cmPanelInfo'],
  ['f-bo-label', '#cmPanelInfo'],
  ['f-bo-add', '#cmPanelInfo'],
  ['f-addr-rm-btn', '#cmPanelInfo'],
]);

// No rule in this kit targets them at all.
const UNREACHED = new Map([
  // the address-pair family's rules are all #cddFormPanel/#cmPanelInfo scoped
  // and live in the host's review.css, which this kit does not ship
  ['f-address-pair', 'host review.css, panel-scoped'],
  ['f-address-type', 'host review.css, panel-scoped'],
  ['f-address-detail', 'host review.css, panel-scoped'],
  ['f-address-remove', 'host review.css, panel-scoped'],
  // real UNSCOPED styling exists in the host's screening-form.css — this is the
  // one entry a consumer can fix by copying rules rather than by restyling
  ['f-breg-lookup-btn', 'host screening-form.css, unscoped — copyable'],
  // signature box: #cddFormPanel-scoped in the host's review.css
  ['f-sig-box', 'host review.css, panel-scoped'],
  // dead in the source project too: no rule anywhere, in any stylesheet
  ['c-tab-count', 'no rule anywhere, including the source project'],
  // a concatenation fragment, not a class: `'f-list-shell--' + variant`
  ['f-list-shell--', 'not a class — a prefix fragment the scanner cannot resolve'],
]);

test('every class the kit renders has reachable styling', () => {
  const sources = kitSources();
  const rendered = renderedClasses(sources);
  const ids = renderedIds(sources);
  const selectors = kitSelectors();

  assert.ok(rendered.size > 50,
    `only ${rendered.size} rendered classes found — the scanner stopped reading the source, `
    + 'which would make every assertion below vacuously true');
  assert.ok(selectors.length > 200,
    `only ${selectors.length} selectors parsed — the stylesheet reader is broken, and an empty `
    + 'selector list would report every class as unreached');

  const anchored = new Map();
  const unreached = [];
  for (const [cls, files] of rendered) {
    const targeting = selectors.filter((r) => mentions(r.sel, cls));
    if (!targeting.length) { unreached.push({ cls, files: [...files] }); continue; }
    const reachable = targeting.filter((r) => idsIn(r.sel).every((id) => ids.has(id)));
    if (!reachable.length) {
      anchored.set(cls, [...new Set(targeting.flatMap((r) => idsIn(r.sel)))].map((i) => `#${i}`).join(' / '));
    }
  }

  // Both directions, so the pins cannot rot in either. A class that leaves the
  // list is as much a change as one that joins it: leaving means someone gave
  // it reachable styling, and the entry should go rather than linger.
  for (const [cls, needs] of anchored) {
    assert.ok(ANCHORED.has(cls),
      `.${cls} is styled only through ${needs}, which this kit never renders, and it is not in `
      + 'ANCHORED. Either give it a rule a consumer can reach, or add it with the id it needs.');
  }
  for (const cls of ANCHORED.keys()) {
    assert.ok(anchored.has(cls),
      `.${cls} is pinned as ANCHORED but now has reachable styling — remove the entry and bank it.`);
  }

  const unreachedNames = unreached.map((u) => u.cls).sort();
  for (const cls of unreachedNames) {
    assert.ok(UNREACHED.has(cls),
      `.${cls} is rendered by ${rendered.get(cls) && [...rendered.get(cls)].join(', ')} and no rule in this `
      + 'kit targets it. Ship the rule, or record it in UNREACHED with where its styling lives.');
  }
  for (const cls of UNREACHED.keys()) {
    assert.ok(unreachedNames.includes(cls),
      `.${cls} is pinned as UNREACHED but something styles it now — remove the entry.`);
  }
});
