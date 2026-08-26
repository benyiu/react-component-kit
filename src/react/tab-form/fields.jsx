// The form-field primitives the converted tab bodies draw with.
//
// Four bodies were converted one at a time and each grew its own copy of
// these. The markup was always the same; what differed was which props each
// port bothered to keep, because a port only needs what its own tab asks for.
// So the copies are not variants — they are one component seen through four
// keyholes, and the passes that sweep these files (the prefix rename, the deps
// narrowing) had to do their work four times.
//
// What belongs here is decided by a call site, not by the classic widget it
// replaces. FormWidgets.row also took a `className` and FormWidgets.field a
// `labelHtml`; neither is here, because no converted body asks for them and a
// prop with no caller is a prop nobody can be wrong about.
import { useEffect, useId, useRef } from 'react';
import { ENUMS, fAddressTypeLabel } from '../../core/enums.js';

// A row of fields.
//
// `cols` is how many the row means to fit; legacy.css turns cols-2 into two
// that share the width, and its absence into one per line. `hidden` is for a
// row the tab keeps in the document but not on the screen — the transaction
// panel's address selects, which stay put so the collector can still find
// them when the location variant brings them back.
//
// The two never appear together today, and there is no reason they could not.
export function Row({ cols, full, hidden, children }) {
  return (
    <div
      className={`f-field-row${full ? ' f-field-full' : ''}${cols ? ` cols-${cols}` : ''}`}
      style={hidden ? { display: 'none' } : undefined}
    >
      {children}
    </div>
  );
}

// A labelled field.
//
// `labelNode` is for the labels that are not only text — the client's "add a
// name" button, the reference links beside a jurisdiction answer. It wins over
// `label` when both arrive, which is how ClientDataBody has always used it.
//
// `htmlFor` is what makes the label the control's: clicking it focuses the
// control, and a screen reader announces the control by its name rather than
// reading the label as loose text nearby. It is a prop rather than something
// this component derives, because Field cannot see what its child is. Half of
// the call sites put a labelable control in there and half put a click-to-edit
// div or a computed score, and a `for` pointing at a div is inert — it would
// claim an association that does not exist. So the call site, which knows,
// says so. A field that passes nothing renders exactly the label it always did.
//
// `labelId` names the label itself, for the one caller that has to point at it
// from somewhere else: a radio group is named by `aria-labelledby`, not by a
// `for`. Both attributes land on the text label only. `labelNode` is a whole
// <label> the caller wrote, so the caller puts them on it directly.
export function Field({
  label, labelNode, className, htmlFor, labelId, children,
}) {
  return (
    <div className={`f-field${className ? ` ${className}` : ''}`}>
      {labelNode || (label ? <label htmlFor={htmlFor} id={labelId}>{label}</label> : null)}
      {children}
    </div>
  );
}

// A group of radios, one of which is the answer.
//
// The three bodies that had a copy of this did not disagree about the markup.
// They disagreed about where the answer lives, and that disagreement is real:
//
//   - The client and company tabs hold the record as their state, so a group
//     is told what the answer is and reports a new one. It is controlled.
//   - The risk tab's fields are the DOM. `collectData` reads them back,
//     because a half-finished assessment genuinely lives in the controls and
//     re-rendering must not disturb it. Its groups are uncontrolled and there
//     is nowhere to report to.
//
// So the mode is not a flag. It follows from whether the caller gave an
// `onChange`: a group with nowhere to report to has to remember its own
// answer, and one that reports cannot.
//
// The comparison follows from the same fact rather than being a second
// decision. A controlled group's `value` came from the record beside choices
// of its own type. An uncontrolled group's may have come back out of the DOM,
// where a radio's value is always a string — and the risk factors' choices
// are the numbers 1, 3 and 5, so comparing strictly would leave every
// answered factor looking unanswered.
//
// A group has two kinds of label and they are named two different ways. Each
// choice's label *wraps* its radio, so it is already that radio's label and a
// `for` would only restate the nesting — clicking one has always toggled its
// choice. The group's label names the whole question, and there is nothing for
// it to point `for` at: `for` names one control, and aiming it at the first
// radio would both announce "risk rating" as the name of the Low button and
// make clicking the question pick Low. So the group is named the way a group
// is named — `aria-labelledby` on a container carrying `role="radiogroup"`,
// which is the ARIA spelling of fieldset/legend.
//
// It is that spelling rather than the element because legacy.css styles this
// field through `.f-field label` and `.f-option-group`, and swapping the div
// for a fieldset and the label for a legend would restyle every group on the
// form to fix an attribute. The role and the reference are attributes; nothing
// moves.
//
// Both are emitted only when the group has a name to be announced by. A
// `role="radiogroup"` that cannot say what it groups tells a screen reader
// less than the shared `name` attribute already does, so a group with no name
// stays a plain div — and there is no such group left on these four bodies.
//
// `labelledBy` is for a group whose name is an element it does not own. Two
// have one: the client's risk rating, whose label is a node the call site
// wrote because it carries a link to the assessment, and the company's client
// type, which has no label at all and is named by its section heading.
export function RadioGroup({
  name, label, labelNode, labelledBy, className, value, choices, disabled, onChange,
}) {
  const ownLabelId = useId();
  // Field draws its own label only when no labelNode arrived, so the group can
  // only point at the one that is actually on the page.
  const drawsOwnLabel = !labelNode && !!label;
  const groupLabelId = drawsOwnLabel ? ownLabelId : labelledBy;
  return (
    <Field
      label={label}
      labelNode={labelNode}
      labelId={drawsOwnLabel ? ownLabelId : undefined}
      className={className}
    >
      <div
        className="f-option-group"
        role={groupLabelId ? 'radiogroup' : undefined}
        aria-labelledby={groupLabelId}
      >
        {choices.map((choice) => (
          <label className="f-ilabel" key={String(choice.value)}>
            <input
              type="radio"
              name={name}
              value={choice.value}
              disabled={disabled}
              {...(onChange
                ? { checked: choice.value === value, onChange: () => onChange(choice.value) }
                : { defaultChecked: String(choice.value) === String(value) })}
            />
            {' '}
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

// A titled block of fields.
//
// Only the company body had this as a component; the client and risk bodies
// wrote the same two divs by hand. `title` is a node rather than text, which
// is not a widening — two of the call sites already put more than a string in
// that div (the client's name section sets a hint beside the heading, a risk
// category its weight), and a fragment renders exactly what they wrote.
//
// A section with no title is not this. TransactionBody wraps its panel in a
// bare `f-section` and never titles it, and giving that away would mean either
// an empty title div it does not have today or a branch with one caller.
//
// `titleId` names the heading so something inside the section can be named by
// it. One caller needs that: the company tab's client-type group, whose only
// name is the heading above it. It is a prop rather than an id this component
// always generates, because an id exists to be referred to and a heading no
// one refers to would be inventing a name for every section on the form.
//
// The id lands on the title div rather than the section, and the section does
// not become a labelled region. Both would name the group, and the div is the
// element whose text is the name — pointing at the section would make the
// group's accessible name every word in it.
export function Section({ title, titleId, children }) {
  return (
    <div className="f-section">
      <div className="f-section-title" id={titleId}>{title}</div>
      {children}
    </div>
  );
}

// A section whose title carries the button that adds a row to it.
//
// `addAction` arrives whole rather than being built from a form name. What
// opens when it is clicked is the shell's, found by matching the attribute
// against a delegated handler, and a name assembled out of pieces here would
// be a name nobody can grep for.
export function CollectionSection({
  title, addLabel, addAction, collection, children,
}) {
  return (
    <Section
      title={(
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{title}</span>
          <button
            type="button"
            className="f-bo-add"
            data-action={addAction}
            data-collection={collection}
          >
            {addLabel}
          </button>
        </div>
      )}
    >
      {children}
    </Section>
  );
}

// A text control that reports what was typed.
//
// It is uncontrolled on purpose. `defaultValue` seeds it and a re-render
// leaves it alone, so a score updating or a language changing cannot move
// somebody's caret; loading a different record resets it, because the caller
// remounts the subtree by key.
//
// `inputRef` is for the two registration numbers, whose dash mask is a DOM
// binder that needs the element. `inputMode` is for the fields where the
// keyboard should not be the alphabet. `id` is what a Field's label points at,
// and it is the caller's to generate because the caller owns both ends of the
// pair.
//
// `labelledBy` and `ariaLabel` are the other two ways this control can be
// named, for the rows that have no <label> to point at it — a name written in
// a <span> beside it, which `.f-bo-item` has always been. They are the same
// choice RadioGroup makes: point at the element that says the name when there
// is one, and say it outright when there is not. Which of the two a caller
// wants follows from whether the whole name is already on the page, and no
// caller passes both — `aria-labelledby` would win over `aria-label` anyway,
// so passing both would be one of them silently doing nothing.
export function Input({
  id, labelledBy, ariaLabel, type, value, placeholder, onChange, inputMode, style, inputRef,
}) {
  return (
    <input
      id={id}
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      ref={inputRef}
      type={type || 'text'}
      defaultValue={value || ''}
      placeholder={placeholder}
      inputMode={inputMode}
      style={style}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

// The country field: suggestions while typing, a canonical name on the way out.
//
// The dropdown is a body child rather than part of this subtree, which is why
// it is attached imperatively — and torn down here, because nothing else knows
// the input is gone.
//
// The two copies of this were byte-identical, which the work list did not
// expect: it recorded that the client's also reports to `onJurisdiction`. It
// does not. The client *form* passes an onChange that answers the jurisdiction
// question as well as setting the country, and that is a fact about the call
// site, not about this control. What the control knows is that a country was
// settled on and one function wants to hear about it.
//
// `report` holds the latest onChange rather than the effect depending on it,
// so a re-render that hands down a new closure does not tear the autocomplete
// down and rebuild it under someone who is mid-word.
export function CountryInput({
  id, value, placeholder, onChange, bindAutocomplete, normalizeCountryName,
}) {
  const input = useRef(null);
  const report = useRef(onChange);
  report.current = onChange;

  useEffect(() => {
    const element = input.current;
    if (!element || !bindAutocomplete) return undefined;
    const autocomplete = bindAutocomplete(element, (canonical) => {
      element.value = canonical;
      report.current(canonical);
    });
    const suggest = () => autocomplete.show(element.value);
    const settle = () => {
      autocomplete.hide();
      const typed = element.value;
      if (!typed || !typed.trim()) return;
      const canonical = normalizeCountryName ? normalizeCountryName(typed) : typed;
      if (canonical !== typed) element.value = canonical;
      report.current(canonical);
    };
    element.addEventListener('input', suggest);
    element.addEventListener('blur', settle);
    return () => {
      element.removeEventListener('input', suggest);
      element.removeEventListener('blur', settle);
      if (autocomplete.destroy) autocomplete.destroy();
    };
  }, [bindAutocomplete, normalizeCountryName]);

  return (
    <input
      id={id}
      ref={input}
      type="text"
      defaultValue={value || ''}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

// The registry-lookup buttons that sit beside a field. Each opens a dialog and
// fills the record from what comes back, which is the shell's to do.
//
// `title` and `label` arrive as text, already translated. The two copies of
// this disagreed about that — the client's called t() on both inside, the
// company's took them resolved — so a boundary had to be picked, and this
// module already had one. Nothing in fields.jsx calls useT: Section takes a
// title, CollectionSection an addLabel, PersonRow its placeholders, all as
// text. Resolving here would make this the one primitive that reaches for
// context, and split the module's boundary in two.
//
// That is not a departure from the house rule that keys travel and rendering
// resolves them (see features/reviews/body-model.js). It is where the rule's
// boundary falls: a model hands the body keys, the body resolves them, and
// what a primitive receives is text. The client's descriptors still carry keys
// out of the model; ClientDataBody now resolves them on the way in, where it
// already resolves every other label it passes down.
//
// Worth being clear that this fixes nothing, because there was nothing broken.
// The company's call sites call t() during render and re-render on a language
// change, so both copies already retranslated. The defect body-model.js
// describes — text resolved once at build time and never again — is not
// present in either.
export function LookupButtons({ lookups }) {
  return lookups.map((lookup) => (
    <button
      type="button"
      className="f-breg-lookup-btn"
      data-action={lookup.action}
      title={lookup.title}
      key={lookup.action}
    >
      {lookup.label}
    </button>
  ));
}

// A named person on a record — a beneficial owner or an authorized delivery
// person. Both are two names and a button that removes the row.
//
// `removeAction` arrives whole, for the reason CollectionSection's addAction
// does: what answers it is a delegated handler in the shell, and a name this
// component assembled from a namespace would be a name nobody can grep for.
//
// `collection` and `index` are what the record calls this row. They reach the
// button as the attributes the handler reads, and the two Inputs as the first
// two arguments of `onName` — the same pair, said to the two sides that need
// it, which is why neither is derived from the other.
//
// The row's label names the *row* — "Beneficial Owner #2" — and there are two
// controls under it, so it cannot be pointed at either one. `aria-labelledby`
// at the span is what a one-control row does (see RemovableName), and here it
// would announce both inputs as "Beneficial Owner #2": two controls with one
// name is the same defect as none, because it is still not possible to tell
// from the announcement which box the caret is in.
//
// So each input is named by what it actually is, which is the row and the
// language together: "Beneficial Owner #2 English Name". Both halves are text
// this component already receives — the row label and the placeholder, which
// is where the CN/EN distinction has always been said — so the name is
// composed rather than invented, and it stays translated because both halves
// arrive resolved from the call site and change with the language.
//
// It is `aria-label` rather than a reference because there is no element to
// refer to: the language is written in a placeholder attribute, not in the
// page. Inventing a span to hold it would be markup added to a flex row to fix
// an attribute, which is the trade RadioGroup already refused. A placeholder
// is not a name in its own right either — it is the last thing accname looks
// at, some of the readers that use it stop announcing it once there is a value
// in the box, and it says the language without saying which row.
export function PersonRow({
  person, index, label, collection, onName, removeAction, removeTitle,
  cnPlaceholder, enPlaceholder,
}) {
  return (
    <div className="f-bo-item">
      <span className="f-bo-label">{label}</span>
      <Input
        ariaLabel={`${label} ${cnPlaceholder}`}
        value={person.nameCN}
        placeholder={cnPlaceholder}
        onChange={(value) => onName(collection, index, 'nameCN', value)}
      />
      <Input
        ariaLabel={`${label} ${enPlaceholder}`}
        value={person.nameEN}
        placeholder={enPlaceholder}
        onChange={(value) => onName(collection, index, 'nameEN', value)}
      />
      {/* accname takes a button's text content over its `title`, so the name
          this announced was literally "×" and the useful words in the title
          were never read. Every remove button on the form said the same
          punctuation, which is a name that identifies nothing on a form where
          up to eight of them are on screen at once.

          `title` stays: it is the visible tooltip, and a tooltip and a name are
          different jobs. What changes is that the name now says what the button
          removes, composed from the tooltip and the row label the same way the
          two inputs above compose theirs — "移除 實益擁有人 #2". Both halves
          arrive resolved from the call site, so the name stays translated. */}
      <button
        type="button"
        data-action={removeAction}
        data-collection={collection}
        data-item-key={index}
        title={removeTitle}
        aria-label={`${removeTitle} ${label}`}
      >
        ×
      </button>
    </div>
  );
}

// The order the classic selector offered, which is not the enum's order.
//
// It is not exported. Both bodies had a copy and both exported it, and in
// neither case did anything import it — AddressRow was the only reader either
// one had. An export nobody imports is a claim about who may depend on this.
const ADDRESS_TYPE_ORDER = Object.freeze([
  ENUMS.ADDRESS_TYPE.MAIN,
  ENUMS.ADDRESS_TYPE.BUS_PREM,
  ENUMS.ADDRESS_TYPE.CORR,
  ENUMS.ADDRESS_TYPE.TEMP_PREM,
  ENUMS.ADDRESS_TYPE.OTHER,
]);

// An address on a record. The type is a compact native select; the address
// itself always opens the shared editor, which is why it is a click-to-edit
// display rather than an input.
//
// Two actions arrive, both whole. They are not one namespace with two suffixes
// even though `client.` and `company.` is all that separates the copies:
// `address.edit` opens an editor and `form.collection.remove` drops a row, they
// are answered by different handlers, and a component that built either from a
// prefix would leave both unfindable by the name they are registered under.
//
// The collection is not a prop. Both copies wrote `addresses` literally and
// neither ever varied it, unlike PersonRow's, which names two.
//
// Of the two labels only one has a control to name. The type label names the
// select, and points at it — a row is drawn once per address, so the id is
// generated per instance rather than written down, which is also what keeps
// four addresses from sharing one. The detail label names the click-to-edit
// div beside it, and a div is not a labelable element: `for` may only name a
// form control, so pointing at it would be inert and would claim an
// association the page does not have. It is left as it was. Making that
// display a real control is a different change — it would need a role, a tab
// stop and a key handler before a label could mean anything.
export function AddressRow({
  address, index, onType, editAction, removeAction,
  typeLabel, detailLabel, detailPlaceholder, clickTitle, removeTitle,
}) {
  const typeId = useId();
  return (
    <Row full>
      <div
        className="f-field f-address-pair"
        style={{
          display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'flex-end',
        }}
      >
        <div className="f-address-type" style={{ flex: '0 0 140px' }}>
          <label htmlFor={typeId}>{typeLabel}</label>
          <select
            id={typeId}
            style={{ width: '100%' }}
            value={address.type}
            onChange={(event) => onType(index, event.target.value)}
          >
            {ADDRESS_TYPE_ORDER.map((type) => (
              <option value={type} key={type}>{fAddressTypeLabel(type)}</option>
            ))}
          </select>
        </div>
        <div className="f-address-detail" style={{ flex: 1 }}>
          <label>{detailLabel}</label>
          <div
            className={`f-ss-display${address.detail ? '' : ' f-ss-placeholder'}`}
            data-action={editAction}
            data-address-index={index}
            title={clickTitle}
          >
            {address.detail || detailPlaceholder}
          </div>
        </div>
        {/* Same "×" as PersonRow's, named the same way but not from the same
            parts, because an address row has no label of its own. Its two
            labels — "類型" and "營業地址" — are the same words on every row, and
            so is `removeTitle`; there is nothing here that says *which* address
            except the position, and the type it currently holds can repeat.
            So the name is the tooltip and the row's ordinal, "移除地址 #2",
            written the way the dictionary itself numbers rows (`client.f.boItem`
            is "實益擁有人 #{{n}}" in both languages). Position is the only part
            of an address row that is guaranteed to tell it from its neighbour,
            and two remove buttons with one name is the defect this fixes. */}
        <button
          type="button"
          className="f-addr-rm-btn f-address-remove"
          data-action={removeAction}
          data-collection="addresses"
          data-item-key={index}
          title={removeTitle}
          aria-label={`${removeTitle} #${index + 1}`}
          style={{ flexShrink: 0 }}
        >
          ×
        </button>
      </div>
    </Row>
  );
}
