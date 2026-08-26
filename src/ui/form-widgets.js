import { t } from '../core/i18n.js';
import { fEscAttr, fEscHtml } from './html-utils.js';

// These widgets used to offer their callers a second way to say what a control
// is called: an i18n key alongside the text, emitted as a `data-i18n*` for the
// DOM applier to resolve after the markup was in the document. It was the only
// mechanism a body that nothing rebuilds had, and it went wrong in both the
// ways this refactor keeps finding — every caller also passed a hardcoded
// Chinese literal, five of which had drifted from the dictionary entry they
// duplicated, and every label that *didn't* pass a key was frozen with no
// mechanism at all.
//
// Three of the four offers now have no callers and are deleted: `labelI18n`,
// `radioGroup`'s per-choice `i18n`, and `placeholderI18n` on a textarea, which
// never had one. Each body that used them either became React or started
// rebuilding its markup on the language signal, which makes a plain t() at
// build time the mechanism.
//
// `placeholderI18n` survives on inputControl for two static-page slots
// (`pfUserInput`, `fDocSearch`) hydrated once at load, where nothing redraws
// and the applier genuinely is the only mechanism. It resolves the key into
// the placeholder *as well*, so the literal beside it is a dead fallback
// rather than a second source of truth.
function translate(key, literal) {
  if (key) return t(key);
  return literal == null ? '' : literal;
}

function placeholderAttribute(cfg) {
  var text = translate(cfg.placeholderI18n, cfg.placeholder);
  return text ? ' placeholder="' + fEscAttr(text) + '"' : '';
}

function actionAttributes(action, data) {
  if (!action) return '';
  var attributes = ' data-action="' + fEscAttr(action) + '"';
  Object.keys(data || {}).forEach(function(key) {
    var attrName = key.replace(/[A-Z]/g, function(letter) {
      return '-' + letter.toLowerCase();
    });
    attributes += ' data-' + attrName + '="' + fEscAttr(data[key]) + '"';
  });
  return attributes;
}

// Renderer-agnostic form widgets. Binding attributes stay configurable while
// legacy data-field, data-cfield and data-cmfield collectors are migrated.
const FormWidgets = {
  bindAttr: function(cfg) {
    return cfg.bind !== undefined && cfg.bind !== null && cfg.bind !== ''
      ? ' ' + (cfg.bindAttr || 'data-cfield') + '="' + fEscAttr(cfg.bind) + '"'
      : '';
  },
  inputControl: function(cfg) {
    return '<input' + this.bindAttr(cfg) + (cfg.id ? ' id="' + fEscAttr(cfg.id) + '"' : '') + (cfg.className ? ' class="' + fEscAttr(cfg.className) + '"' : '') + ' type="' + fEscAttr(cfg.type || 'text') + '" value="' + fEscAttr(cfg.value || '') + '"' + placeholderAttribute(cfg) + (cfg.placeholderI18n ? ' data-i18n-ph="' + fEscAttr(cfg.placeholderI18n) + '"' : '') + (cfg.inputmode ? ' inputmode="' + fEscAttr(cfg.inputmode) + '"' : '') + (cfg.style ? ' style="' + fEscAttr(cfg.style) + '"' : '') + (cfg.checked ? ' checked' : '') + (cfg.disabled ? ' disabled' : '') + (cfg.attrs || '') + '>';
  },
  selectControl: function(cfg) {
    return '<select' + this.bindAttr(cfg) + (cfg.id ? ' id="' + fEscAttr(cfg.id) + '"' : '') + (cfg.className ? ' class="' + fEscAttr(cfg.className) + '"' : '') + (cfg.style ? ' style="' + fEscAttr(cfg.style) + '"' : '') + (cfg.disabled ? ' disabled' : '') + (cfg.attrs || '') + '>' + (cfg.options || '') + '</select>';
  },
  // A label, and what it is the label *of*.
  //
  // Until now it was neither: a bare `<label>` beside a control rather than
  // attached to it, which is loose text to a screen reader and an inert tap
  // target to a thumb. 309b31b fixed exactly this on the React side and every
  // word of its reasoning applies here, because these are the widgets that side
  // was ported from — the gap was never drift, it was one gap in both
  // renderers.
  //
  // `htmlFor` is a caller's to supply, for 309b31b's reason: `field` cannot see
  // what its child is. Its three direct callers hand it an opaque `content`
  // string, and of those, two pass no label at all while the third
  // (features/settings/view.js:88) puts a textarea in there. `for` may only
  // name a form control; aimed at a div it is inert and writing it anyway would
  // claim an association the page has not got. So the call site, which knows,
  // says so.
  //
  // The wrappers below are different, and this is where the string renderer
  // parts company with React's `Field`: `input`, `select`, `inputWithActions`
  // and `signatureField` *build* their control, so they can see it is labelable
  // and pass `htmlFor` themselves. What they cannot invent is the id. They pass
  // the one the caller gave the control and nothing else, because these widgets
  // are shared by nine renderers whose panels can be in the document together,
  // and the field key they bind by is deliberately not unique across them:
  // every collector scopes its query to its own panel root (see
  // react/tab-form/CompanyMemberForm.jsx:52 — "the classic factory did this
  // generically for every `[data-cfield]` it could find anywhere"). An id
  // derived from that key would claim a uniqueness the app has taken care not
  // to rely on, and two labels resolving to one control is the defect this
  // change exists to remove.
  //
  // `labelId` names the label itself, for the caller that has to point at it
  // from somewhere else rather than from the control — which is radioGroup,
  // below, for the reason set out there.
  label: function(cfg) {
    if (!cfg.label && !cfg.labelHtml) return '';
    return '<label' + (cfg.htmlFor ? ' for="' + fEscAttr(cfg.htmlFor) + '"' : '') + (cfg.labelId ? ' id="' + fEscAttr(cfg.labelId) + '"' : '') + '>' + (cfg.labelHtml || fEscHtml(cfg.label == null ? '' : cfg.label)) + '</label>';
  },
  field: function(cfg) {
    return '<div class="f-field' + (cfg.className ? ' ' + fEscAttr(cfg.className) : '') + '">' + this.label(cfg) + (cfg.content || '') + '</div>';
  },
  row: function(fields, cfg) {
    cfg = cfg || {};
    return '<div class="f-field-row' + (cfg.full ? ' f-field-full' : '') + (cfg.cols ? ' cols-' + cfg.cols : '') + (cfg.className ? ' ' + fEscAttr(cfg.className) : '') + '"' + (cfg.hidden ? ' style="display:none"' : '') + '>' + fields.join('') + '</div>';
  },
  textareaControl: function(cfg) {
    return '<textarea' + this.bindAttr(cfg) + (cfg.id ? ' id="' + fEscAttr(cfg.id) + '"' : '') + (cfg.className ? ' class="' + fEscAttr(cfg.className) + '"' : '') + (cfg.rows ? ' rows="' + fEscAttr(cfg.rows) + '"' : '') + placeholderAttribute(cfg) + (cfg.style ? ' style="' + fEscAttr(cfg.style) + '"' : '') + (cfg.disabled ? ' disabled' : '') + (cfg.attrs || '') + '>' + fEscHtml(cfg.value || '') + '</textarea>';
  },
  input: function(cfg) {
    return this.field({
      label: cfg.label,
      labelHtml: cfg.labelHtml,
      className: cfg.className,
      htmlFor: cfg.id,
      content: this.inputControl(cfg),
    });
  },
  inputWithActions: function(cfg) {
    return this.field({
      label: cfg.label,
      labelHtml: cfg.labelHtml,
      className: cfg.className,
      htmlFor: cfg.id,
      content: '<div style="display:flex;gap:6px;">' + this.inputControl({
        bind: cfg.bind,
        bindAttr: cfg.bindAttr,
        id: cfg.id,
        type: cfg.type,
        value: cfg.value,
        placeholder: cfg.placeholder,
        placeholderI18n: cfg.placeholderI18n,
        inputmode: cfg.inputmode,
        disabled: cfg.disabled,
        attrs: cfg.attrs,
        style: 'flex:1;',
      }) + (cfg.actions || '') + '</div>',
    });
  },
  select: function(cfg) {
    return this.field({
      label: cfg.label,
      labelHtml: cfg.labelHtml,
      className: cfg.className,
      htmlFor: cfg.id,
      content: this.selectControl(cfg),
    });
  },
  // A group is named as a group.
  //
  // This is the case 309b31b singled out and it is the one place here that
  // needs no id from a caller. A group's label names the *question*, and a
  // `for` on it could only reach one radio — which would announce the question
  // as the name of the first choice and make clicking the question answer it.
  // So the group gets `role="radiogroup"` and `aria-labelledby`, which is the
  // ARIA spelling of fieldset/legend, chosen over the elements for the reason
  // given there and rechecked here: `#cddFormPanel .f-field label` and
  // `.f-option-group` are how these fields are styled, and swapping the div for
  // a fieldset and the label for a legend would restyle every group on every
  // form to fix an attribute. Attributes move nothing.
  //
  // The id it points at is derived from the group's `name`, which is the one
  // key on these widgets that *is* document-unique by necessity rather than by
  // convention: radios sharing a name with no form owner between them are one
  // group, so two groups with one name are already a single broken group. Every
  // one of the eight call sites passes one. It is hyphenated, which is what
  // keeps it clear of everything already written down: all 277 id literals in
  // src/ and in the page markup are camelCase, and not one contains a hyphen,
  // so nothing a stylesheet or the shell names can be reached by this. The
  // other hyphenated ids in the tree are generated too, under prefixes of their
  // own (`fReviewRowLabel-`, `fReviewControl-`), so they cannot meet this one
  // either.
  //
  // Both attributes are emitted only when there is a label to be announced by.
  // A `role="radiogroup"` that cannot say what it groups tells a reader less
  // than the shared `name` already does.
  radioGroup: function(cfg) {
    var choices = cfg.choices || [];
    var groupLabelId = (cfg.label || cfg.labelHtml) && cfg.name
      ? 'fRadioGroupLabel-' + cfg.name
      : '';
    var html = '<div class="f-option-group"' + (groupLabelId ? ' role="radiogroup" aria-labelledby="' + fEscAttr(groupLabelId) + '"' : '') + '>';
    for (var i = 0; i < choices.length; i++) {
      var choice = choices[i];
      // inputControl owns the value attribute. Supplying it again in attrs
      // would make browsers retain an empty first value for every radio.
      html += '<label class="f-ilabel">' + this.inputControl({
        bind: cfg.bind,
        bindAttr: cfg.bindAttr,
        type: 'radio',
        value: choice.value,
        checked: choice.value === cfg.value,
        disabled: cfg.disabled,
        attrs: ' name="' + fEscAttr(cfg.name) + '"' +
          actionAttributes(choice.action, choice.data),
      }) + ' <span>' + fEscHtml(choice.label == null ? '' : choice.label) + '</span></label>';
    }
    return this.field({
      label: cfg.label,
      labelHtml: cfg.labelHtml,
      labelId: groupLabelId,
      className: cfg.className,
      content: html + '</div>',
    });
  },
  checkbox: function(cfg) {
    return '<label class="f-ilabel">' + this.inputControl({
      bind: cfg.bind,
      bindAttr: cfg.bindAttr,
      id: cfg.id,
      className: cfg.inputClassName,
      type: 'checkbox',
      value: cfg.value,
      checked: cfg.checked,
      disabled: cfg.disabled,
      attrs: cfg.attrs,
    }) + ' ' + fEscHtml(cfg.label || '') + '</label>';
  },
  // A signature line: who signed and when. Both halves are real controls, so
  // this names them the same way `input` and `select` do — the label points at
  // the id the caller gave, and says nothing when there is none.
  signatureField: function(cfg) {
    var control = cfg.kind === 'select'
      ? this.selectControl(cfg)
      : this.inputControl(cfg);
    return '<div class="f-sig-box">' + this.label({
      label: cfg.label,
      labelHtml: cfg.labelHtml,
      htmlFor: cfg.id,
    }) + control + '</div>';
  },
  // No `htmlFor` here, and that is the decision rather than an omission. What
  // this draws is a `<div class="f-ss-display">` that opens an editor when it
  // is clicked, and `for` may only name a form control: aimed at a div it is
  // inert, and writing it anyway would claim an association the page has not
  // got. 309b31b left the React click-to-edits alone for the same reason.
  // Making one a real control is a different change — it would need a role, a
  // tab stop and a key handler before a label could mean anything.
  clickToEdit: function(cfg) {
    return this.field({
      label: cfg.label,
      className: cfg.className,
      content: '<div class="f-ss-display' + (!cfg.value ? ' f-ss-placeholder' : '') + (cfg.locked ? ' f-ss-locked' : '') + '"' + this.bindAttr(cfg) + (cfg.id ? ' id="' + fEscAttr(cfg.id) + '"' : '') + (!cfg.locked && cfg.action ? actionAttributes(cfg.action, cfg.data) + ' title="' + fEscAttr(cfg.title || '') + '"' : '') + '>' + fEscHtml(cfg.value || cfg.placeholder || '') + '</div>',
    });
  },
};

export { FormWidgets };
