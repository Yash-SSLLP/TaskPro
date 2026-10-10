/**
 * A section's form, drawn from its fields in sections.js: text, links,
 * pictures, choices, switches and lists of items (add, remove, ↑/↓).
 */
import { useId } from 'react';
import { Input, Select, Switch, Textarea } from '../../ui';
import { MediaField } from './MediaPicker';
import { ICONS, emptyProps } from './sections';
import { hrefError, LinkFields, ListEditor } from './shared';

export const MARKDOWN_HINT = 'Markdown: **bold**, *italic*, [words](https://…), # heading (## a smaller one), - list. Pictures only from the library (/media/…).';

/**
 * The fields of a section (or of one item in its list). `section` is the
 * section's props, for a field that shows only with some setting.
 */
export function SectionFields({ fields, values, onChange, section }) {
  const props = section ?? values ?? {};
  const set = (key, v) => onChange({ ...values, [key]: v });
  const visible = fields.filter((f) => !f.show || f.show(values || {}, props));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map((f) => (
        <div key={f.key} className={f.half ? 'min-w-0' : 'min-w-0 sm:col-span-2'}>
          <Field field={f} value={values?.[f.key]} onChange={(v) => set(f.key, v)} section={props} />
        </div>
      ))}
    </div>
  );
}

function ListField({ field: f, value, onChange, section }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className="mb-2 text-sm font-medium text-ink">
        {f.label}
      </p>
      {f.kind === 'strings' ? (
        <ListEditor
          items={value || []}
          onChange={onChange}
          max={f.max}
          itemLabel={f.itemLabel}
          newItem=""
          compact
          renderItem={(item, setItem, i) => (
            <Input aria-label={`${f.itemLabel} ${i + 1}`} maxLength={f.itemMax} value={item || ''} onChange={(e) => setItem(e.target.value)} />
          )}
        />
      ) : (
        <ListEditor
          items={value || []}
          onChange={onChange}
          max={f.max}
          itemLabel={f.itemLabel}
          compact={f.compact}
          newItem={() => emptyProps(f.fields)}
          renderItem={(item, setItem) => <SectionFields fields={f.fields} values={item} onChange={setItem} section={section} />}
        />
      )}
    </div>
  );
}

function Field({ field: f, value, onChange, section }) {
  const text = (e) => onChange(e.target.value);
  switch (f.kind) {
    case 'textarea':
      return <Textarea label={f.label} hint={f.hint} maxLength={f.max} rows={f.rows || 3} value={value ?? ''} onChange={text} />;
    case 'markdown':
      return (
        <Textarea
          label={f.label}
          hint={f.hint || MARKDOWN_HINT}
          maxLength={f.max}
          rows={f.rows || 8}
          value={value ?? ''}
          onChange={text}
          className="[&_textarea]:font-mono [&_textarea]:text-[13.5px] [&_textarea]:leading-relaxed"
        />
      );
    case 'href':
      return <Input label={f.label} hint={f.hint} placeholder="/features" maxLength={500} value={value ?? ''} error={hrefError(value)} onChange={text} />;
    case 'link':
      return <LinkFields label={f.label} value={value} onChange={onChange} />;
    case 'image':
      return (
        <div className="space-y-3">
          <MediaField label={f.label} value={value?.media || null} onChange={(id) => onChange({ alt: '', ...value, media: id })} />
          <Input
            label="Alt text"
            optional
            maxLength={200}
            hint="What the picture shows, for people who can’t see it. Empty = the library’s alt text."
            value={value?.alt ?? ''}
            onChange={(e) => onChange({ media: null, ...value, alt: e.target.value })}
          />
        </div>
      );
    case 'select':
      return (
        <Select label={f.label} hint={f.hint} value={value ?? f.options[0].value} onChange={text}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case 'icon':
      return (
        <Select label={f.label} hint={f.hint} value={value ?? ''} onChange={text}>
          <option value="">No icon</option>
          {ICONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      );
    case 'switch':
      return <Switch label={f.label} description={f.hint} checked={!!value} onChange={onChange} />;
    case 'number':
      return (
        <Input
          type="number"
          inputMode="numeric"
          label={f.label}
          hint={f.hint}
          min={f.min}
          max={f.max}
          value={value ?? f.default ?? f.min ?? 0}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            onChange(Number.isFinite(n) ? Math.min(f.max ?? n, Math.max(f.min ?? n, n)) : f.min ?? 0);
          }}
        />
      );
    case 'list':
    case 'strings':
      return <ListField field={f} value={value} onChange={onChange} section={section} />;
    default:
      return <Input label={f.label} hint={f.hint} maxLength={f.max} value={value ?? ''} onChange={text} />;
  }
}
