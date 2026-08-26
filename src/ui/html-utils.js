function fEscHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fEscAttr(value) {
  // Every FormWidgets attribute in this kit is double-quoted, so a literal `'`
  // needs no escaping at all to stay safe there. This still encodes it as
  // `&#39;` (the actual HTML entity), not left bare and not backslash-escaped
  // — `\'` is JS string-escape syntax, not HTML; browsers read it as a
  // literal backslash once the markup is parsed, corrupting any value with an
  // apostrophe in it (person names, company names, role/tag names) on every
  // DOM read-back path that reads `.value`/`.getAttribute()` after the fact.
  // Carried over from the source project's own fEscAttr, byte-identical
  // (verbatim extraction, daf5e99) including this defect — fixed upstream
  // under that project's queue #165, ported here the same way. `&#39;` is the
  // defensive choice: cheap, and it also covers a hypothetical caller that
  // ever wraps an attribute in single quotes, which dropping the replacement
  // outright would not.
  return String(value == null ? '' : value)
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

function fSel(value, expected) {
  return value === expected ? ' selected' : '';
}

export { fEscAttr, fEscHtml, fSel };
