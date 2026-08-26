// fEscAttr's single-quote escaping survives a real HTML parse.
//
// This kit's src/ui/html-utils.js is a verbatim extraction (daf5e99) of the
// source project's fEscAttr, and it carried that project's own defect along
// with it: `.replace(/'/g, "\\'")` backslash-escapes a single quote, which is
// JS string-escape syntax, not an HTML escape. HTML attributes have no
// backslash escaping at all, so a browser parsing that markup kept the
// backslash as a literal character, corrupting any apostrophe-bearing value
// (person names, company names, role/tag names) that reached the DOM through
// FormWidgets, on every read-back path that reads it back out (`.value`,
// `.getAttribute()`).
//
// Why this suite exists rather than trusting the existing coverage: nothing
// in this kit's test suite imported fEscAttr or escapeAttr before this file
// — form-widgets.js, list-controls.js and list-presentation.js all call it,
// but list-engine.test.jsx (the only suite exercising list-controls.js /
// list-presentation.js output) never fed it an apostrophe-bearing fixture,
// so the bug had zero coverage in either direction. This suite:
//   1. imports the real fEscAttr directly (no injectable deps object exists
//      between form-widgets.js and html-utils.js to substitute a fake),
//   2. builds real markup through the real FormWidgets (the actual attack
//      surface),
//   3. parses that markup with jsdom into a fresh document, and
//   4. asserts on the parsed DOM's live value — `.value`/`.getAttribute()` —
//      never on the escaped HTML string. Asserting the string is exactly the
//      shape that would hide this: the corrupted string round-trips through
//      a naive string comparison just fine, because the corruption only
//      shows up once a browser actually parses the markup.
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { fEscAttr } from '../src/ui/html-utils.js';
import { FormWidgets } from '../src/ui/form-widgets.js';

function parse(html) {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
}

describe("fEscAttr's single-quote escaping", () => {
  it('round-trips a single apostrophe through a real parse unchanged', () => {
    const raw = "O'Brien";
    const html = '<input id="probe" value="' + fEscAttr(raw) + '">';
    const input = parse(html).getElementById('probe');
    expect(input.value).toBe(raw);
    expect(input.value).not.toMatch(/\\/);
  });

  it('round-trips an apostrophe in a plain attribute read with getAttribute', () => {
    const raw = "role-'staff";
    const html = '<div id="probe" data-role-id="' + fEscAttr(raw) + '"></div>';
    const el = parse(html).getElementById('probe');
    expect(el.getAttribute('data-role-id')).toBe(raw);
  });

  it('round-trips repeated apostrophes beside a double quote, the character fEscAttr does escape', () => {
    const raw = `O'Brien & Sons' "Trading" Co.`;
    const html = '<input id="probe" value="' + fEscAttr(raw) + '">';
    const input = parse(html).getElementById('probe');
    expect(input.value).toBe(raw);
  });

  it("FormWidgets.inputControl's rendered value survives a real parse", () => {
    const html = FormWidgets.inputControl({
      bindAttr: 'data-cfield',
      bind: 'nameEN',
      id: 'nameEN',
      value: "Smith's Trading",
    });
    const input = parse(html).getElementById('nameEN');
    expect(input.value).toBe("Smith's Trading");
    expect(input.getAttribute('data-cfield')).toBe('nameEN');
  });

  it('keeps null and empty values empty (no regression on existing null-handling)', () => {
    expect(fEscAttr(null)).toBe('');
    expect(fEscAttr(undefined)).toBe('');
    const html = '<input id="probe" value="' + fEscAttr('') + '">';
    expect(parse(html).getElementById('probe').value).toBe('');
  });
});
