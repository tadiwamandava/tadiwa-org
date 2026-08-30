"use client";

/**
 * One `FieldSpec` -> one control. Recursive, so nested arrays fall out of it.
 *
 * There is no switch on field NAME anywhere in this file. Every decision,
 * input vs textarea, select vs checkbox group, whether a repeating group can
 * be reordered, comes from the spec that `src/lib/admin/fields.ts` derived
 * from the Zod schema. That is what makes it impossible for a new schema field
 * to be missing from the editor: nobody has to remember to add it here.
 *
 * Accessibility is not optional in a form this dense. Every control has a real
 * `<label for>`, every help string and error is wired through
 * `aria-describedby`, and every add/remove/reorder button says which row it
 * acts on, "Move decision 2 up", not "↑".
 */

import type { FieldSpec } from "@/lib/admin/fields";
import { buttonClass, FieldError, FieldLabel, Help, inputClass } from "./ui";

/** A blank value of the right shape, for a newly added row. */
export function blankValue(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case "string":
    case "date":
      return "";
    case "number":
      return typeof spec.defaultValue === "number" ? spec.defaultValue : 0;
    case "boolean":
      return typeof spec.defaultValue === "boolean" ? spec.defaultValue : false;
    case "enum":
      return spec.options[0];
    case "string-list":
    case "enum-list":
    case "object-list":
      return [];
    case "record-number":
      return {};
  }
}

/**
 * A blank row for an object-list.
 *
 * Optional fields with no default are left absent rather than seeded with "",
 * so an untouched optional field is written as absent rather than as an empty
 * string that the schema would have to tolerate.
 */
export function blankItem(spec: Extract<FieldSpec, { kind: "object-list" }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of spec.fields) {
    if (field.optional && field.defaultValue === undefined) continue;
    out[field.key] = blankValue(field);
  }
  return out;
}

const domId = (path: string) => `f-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`;

export interface ControlProps {
  spec: FieldSpec;
  /** Runtime dotted path including indices, `decisions.0.why`. */
  path: string;
  value: unknown;
  errors: Map<string, string[]>;
  onChange: (next: unknown) => void;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Label + help + error scaffolding shared by every leaf control. */
function Field({
  spec,
  path,
  errors,
  children,
}: ControlProps & { children: (ids: { id: string; describedBy?: string }) => React.ReactNode }) {
  const id = domId(path);
  const helpId = spec.help ? `${id}-help` : undefined;
  const messages = errors.get(path) ?? [];
  const errorId = messages.length > 0 ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <FieldLabel htmlFor={id} required={!spec.optional}>
        {spec.label}
      </FieldLabel>
      <div className="mt-1">{children({ id, describedBy })}</div>
      {spec.help && helpId && <Help id={helpId}>{spec.help}</Help>}
      {errorId && <FieldError id={errorId} messages={messages} />}
    </div>
  );
}

export function FieldControl(props: ControlProps) {
  const { spec, path, value, errors, onChange } = props;

  switch (spec.kind) {
    case "string": {
      const text = typeof value === "string" ? value : "";
      return (
        <Field {...props}>
          {({ id, describedBy }) =>
            spec.multiline ? (
              <textarea
                id={id}
                aria-describedby={describedBy}
                className={`${inputClass} min-h-20 resize-y leading-relaxed`}
                value={text}
                rows={3}
                maxLength={spec.maxLength}
                onChange={(e) => onChange(e.target.value)}
              />
            ) : (
              <input
                id={id}
                type="text"
                aria-describedby={describedBy}
                className={inputClass}
                value={text}
                maxLength={spec.maxLength}
                onChange={(e) => onChange(e.target.value)}
              />
            )
          }
        </Field>
      );
    }

    case "date": {
      const text = typeof value === "string" ? value : "";
      // A date input silently shows nothing for a value it cannot parse, which
      // would look like "this field is empty" and lose the real content on the
      // next save. Anything malformed gets a text box instead, so it is
      // visible and fixable.
      const parseable = text === "" || /^\d{4}-\d{2}-\d{2}$/.test(text);
      return (
        <Field {...props}>
          {({ id, describedBy }) => (
            <input
              id={id}
              type={parseable ? "date" : "text"}
              aria-describedby={describedBy}
              className={`${inputClass} max-w-48`}
              value={text}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </Field>
      );
    }

    case "number": {
      return (
        <Field {...props}>
          {({ id, describedBy }) => (
            <input
              id={id}
              type="number"
              inputMode="numeric"
              aria-describedby={describedBy}
              className={`${inputClass} max-w-32 tabular-nums`}
              value={typeof value === "number" ? String(value) : typeof value === "string" ? value : ""}
              step={spec.integer ? 1 : "any"}
              min={spec.min}
              max={spec.max}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return onChange(undefined);
                const n = Number(raw);
                // Keep an unparseable value as text so the schema reports it
                // rather than the control silently discarding a keystroke.
                onChange(Number.isNaN(n) ? raw : n);
              }}
            />
          )}
        </Field>
      );
    }

    case "boolean": {
      const id = domId(path);
      const helpId = spec.help ? `${id}-help` : undefined;
      return (
        <div>
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="checkbox"
              aria-describedby={helpId}
              className="size-4 accent-accent"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
            <label htmlFor={id} className="text-sm text-text">
              {spec.label}
            </label>
          </div>
          {spec.help && helpId && <Help id={helpId}>{spec.help}</Help>}
          <FieldError id={`${id}-error`} messages={errors.get(path) ?? []} />
        </div>
      );
    }

    case "enum": {
      return (
        <Field {...props}>
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              className={`${inputClass} max-w-64`}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
            >
              {spec.optional && <option value="">, not set,</option>}
              {spec.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </Field>
      );
    }

    case "enum-list": {
      const selected = asArray(value).filter((v): v is string => typeof v === "string");
      const groupId = domId(path);
      const helpId = spec.help ? `${groupId}-help` : undefined;
      return (
        <fieldset aria-describedby={helpId}>
          <legend className="font-mono text-2xs tracking-wide text-muted uppercase">
            {spec.label}
            {!spec.optional && <span className="ml-1 text-accent">*</span>}
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {spec.options.map((option) => {
              const id = `${groupId}-${option}`;
              return (
                <div key={option} className="flex items-center gap-1.5">
                  <input
                    id={id}
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={selected.includes(option)}
                    onChange={(e) =>
                      // Append rather than re-derive from the option order, so
                      // toggling one value does not silently reorder the rest.
                      onChange(
                        e.target.checked
                          ? [...selected, option]
                          : selected.filter((v) => v !== option),
                      )
                    }
                  />
                  <label htmlFor={id} className="font-mono text-xs text-text">
                    {option}
                  </label>
                </div>
              );
            })}
          </div>
          {spec.help && helpId && <Help id={helpId}>{spec.help}</Help>}
          <FieldError id={`${groupId}-error`} messages={errors.get(path) ?? []} />
        </fieldset>
      );
    }

    case "string-list": {
      const items = asArray(value);
      const groupId = domId(path);
      const helpId = spec.help ? `${groupId}-help` : undefined;
      const atMax = spec.maxItems !== undefined && items.length >= spec.maxItems;
      return (
        <fieldset aria-describedby={helpId}>
          <ListLegend spec={spec} count={items.length} />
          <ul className="mt-1.5 space-y-1.5">
            {items.map((item, index) => {
              const itemPath = `${path}.${index}`;
              const id = domId(itemPath);
              return (
                <li key={index} className="flex items-start gap-1.5">
                  <label htmlFor={id} className="sr-only">
                    {spec.label} {index + 1}
                  </label>
                  {spec.multiline ? (
                    <textarea
                      id={id}
                      rows={2}
                      className={`${inputClass} min-h-16 resize-y leading-relaxed`}
                      value={typeof item === "string" ? item : ""}
                      onChange={(e) =>
                        onChange(items.map((v, i) => (i === index ? e.target.value : v)))
                      }
                    />
                  ) : (
                    <input
                      id={id}
                      type="text"
                      className={inputClass}
                      value={typeof item === "string" ? item : ""}
                      onChange={(e) =>
                        onChange(items.map((v, i) => (i === index ? e.target.value : v)))
                      }
                    />
                  )}
                  <RowButtons
                    label={`${spec.label} ${index + 1}`}
                    index={index}
                    count={items.length}
                    onMove={(to) => onChange(move(items, index, to))}
                    onRemove={() => onChange(items.filter((_, i) => i !== index))}
                  />
                  <FieldError id={`${id}-error`} messages={errors.get(itemPath) ?? []} />
                </li>
              );
            })}
          </ul>
          <AddButton
            label={spec.label}
            disabled={atMax}
            onAdd={() => onChange([...items, ""])}
          />
          {spec.help && helpId && <Help id={helpId}>{spec.help}</Help>}
          <FieldError id={`${groupId}-error`} messages={errors.get(path) ?? []} />
        </fieldset>
      );
    }

    case "object-list": {
      const items = asArray(value);
      const groupId = domId(path);
      const helpId = spec.help ? `${groupId}-help` : undefined;
      const atMax = spec.maxItems !== undefined && items.length >= spec.maxItems;
      return (
        <fieldset aria-describedby={helpId}>
          <ListLegend spec={spec} count={items.length} />
          {spec.help && helpId && <Help id={helpId}>{spec.help}</Help>}
          <FieldError id={`${groupId}-error`} messages={errors.get(path) ?? []} />

          <ul className="mt-2 space-y-2.5">
            {items.map((item, index) => {
              const row = (item ?? {}) as Record<string, unknown>;
              const heading = String(row[spec.titleField] ?? "").trim();
              return (
                <li key={index} className="rounded border border-border bg-surface p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-1.5">
                    <p className="truncate font-mono text-2xs tracking-wide text-muted uppercase">
                      {spec.label} {index + 1}
                      {heading && <span className="ml-2 normal-case">{heading}</span>}
                    </p>
                    <RowButtons
                      label={`${spec.label} ${index + 1}`}
                      index={index}
                      count={items.length}
                      onMove={(to) => onChange(move(items, index, to))}
                      onRemove={() => onChange(items.filter((_, i) => i !== index))}
                    />
                  </div>
                  <div className="space-y-2.5">
                    {spec.fields.map((child) => (
                      <FieldControl
                        key={child.key}
                        spec={child}
                        path={`${path}.${index}.${child.key}`}
                        value={row[child.key]}
                        errors={errors}
                        onChange={(next) =>
                          onChange(
                            items.map((v, i) =>
                              i === index
                                ? { ...((v ?? {}) as Record<string, unknown>), [child.key]: next }
                                : v,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <AddButton
            label={spec.label}
            disabled={atMax}
            onAdd={() => onChange([...items, blankItem(spec)])}
          />
        </fieldset>
      );
    }

    case "record-number": {
      const record = (value ?? {}) as Record<string, unknown>;
      const groupId = domId(path);
      const helpId = spec.help ? `${groupId}-help` : undefined;
      const min = spec.min ?? 0;
      const max = spec.max ?? 3;
      const scale = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <fieldset aria-describedby={helpId}>
          <legend className="font-mono text-2xs tracking-wide text-muted uppercase">
            {spec.label}
          </legend>
          {spec.help && helpId && <Help id={helpId}>{spec.help}</Help>}
          <div className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {spec.options.map((option) => {
              const id = `${groupId}-${option}`;
              const current = record[option];
              return (
                <div key={option} className="flex items-center justify-between gap-2">
                  <label htmlFor={id} className="font-mono text-xs text-muted">
                    {option}
                  </label>
                  <select
                    id={id}
                    className="rounded-sm border border-border-strong bg-bg px-1.5 py-0.5 text-xs text-text tabular-nums"
                    value={typeof current === "number" ? String(current) : ""}
                    onChange={(e) => {
                      const next = { ...record };
                      if (e.target.value === "") delete next[option];
                      else next[option] = Number(e.target.value);
                      onChange(next);
                    }}
                  >
                    <option value="">, </option>
                    {scale.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          <FieldError id={`${groupId}-error`} messages={errors.get(path) ?? []} />
        </fieldset>
      );
    }
  }
}

function ListLegend({ spec, count }: { spec: FieldSpec; count: number }) {
  const min = "minItems" in spec ? spec.minItems : undefined;
  const max = "maxItems" in spec ? spec.maxItems : undefined;
  const bounds = [
    min !== undefined ? `min ${min}` : null,
    max !== undefined ? `max ${max}` : null,
  ].filter(Boolean);
  return (
    <legend className="font-mono text-2xs tracking-wide text-muted uppercase">
      {spec.label}
      {!spec.optional && <span className="ml-1 text-accent">*</span>}
      <span className="ml-2 text-subtle tabular-nums">
        {count}
        {bounds.length > 0 && ` · ${bounds.join(", ")}`}
      </span>
    </legend>
  );
}

function RowButtons({
  label,
  index,
  count,
  onMove,
  onRemove,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        className={buttonClass}
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <span aria-hidden>↑</span>
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      >
        <span aria-hidden>↓</span>
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}

function AddButton({
  label,
  disabled,
  onAdd,
}: {
  label: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button type="button" className={`${buttonClass} mt-2`} disabled={disabled} onClick={onAdd}>
      + Add {label.toLowerCase()}
    </button>
  );
}
