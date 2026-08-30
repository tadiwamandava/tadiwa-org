"use client";

/**
 * The editor shell: state, saving, and the things a form-heavy tool has to get
 * right, a visible dirty state, a keyboard save, and errors attached to the
 * field that caused them.
 *
 * State is one plain object mirroring the frontmatter, plus the body string.
 * It is submitted as a single JSON payload rather than as `FormData`, for two
 * reasons: repeating groups with add/remove/reorder are miserable to express
 * as flat form keys, and browsers submit `<textarea>` content with CRLF line
 * endings, which is invisible in review and fatal inside a YAML block scalar.
 * Reading `.value` in JS gives LF. (The Server Action normalises anyway, it
 * cannot trust this component, or any other caller.)
 *
 * Note the absence of `useEffect` around state: "has this changed" is derived
 * during render, and the post-save baseline is adjusted with the
 * set-state-during-render escape hatch rather than an effect, which is both
 * what React recommends and what this repo's lint config enforces.
 */

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";

import { saveEntryAction } from "@/app/admin/actions";
import type { SavePayload, SaveResult } from "@/lib/admin/action-types";
import type { FieldSpec } from "@/lib/admin/fields";
import { PLACEHOLDER_PATTERN } from "@/lib/admin/placeholders";
import type { EntryKind, Placeholder } from "@/lib/admin/store";
import { FieldControl } from "./field-control";
import {
  buttonClass,
  FieldLabel,
  Help,
  inputClass,
  Panel,
  primaryButtonClass,
  SectionRule,
  Tag,
} from "./ui";

export interface EntryEditorProps {
  kind: EntryKind;
  slug: string;
  path: string;
  publicHref: string;
  fields: FieldSpec[];
  initialFrontmatter: Record<string, unknown>;
  initialBody: string;
  /** YAML comments in the file today. A save will not preserve them. */
  comments: string[];
  placeholders: Placeholder[];
  /** Schema problems the file has right now, before any edit. */
  initialIssues: { path: string; message: string }[];
}

/** The body gate in scripts/check-content.ts. Shown live so it never surprises. */
const MIN_BODY_CHARS = 120;

export function EntryEditor(props: EntryEditorProps) {
  const { kind, slug, path, publicHref, fields } = props;

  const [frontmatter, setFrontmatter] = useState<Record<string, unknown>>(
    props.initialFrontmatter,
  );
  const [body, setBody] = useState(props.initialBody);
  const [result, submit, pending] = useActionState<SaveResult | null, SavePayload>(
    saveEntryAction,
    null,
  );

  const current = JSON.stringify({ frontmatter, body });
  const [baseline, setBaseline] = useState(current);
  const [lastAppliedSave, setLastAppliedSave] = useState<number | null>(null);

  // Adjusting state during render, the supported way to derive from a prop or
  // an action result without an effect. After a successful save, whatever was
  // saved becomes the new "unchanged" baseline.
  if (result?.ok && result.savedAt !== lastAppliedSave) {
    setLastAppliedSave(result.savedAt);
    setBaseline(current);
  }

  const dirty = current !== baseline;

  const errors = useMemo(() => {
    const map = new Map<string, string[]>();
    if (result && !result.ok) {
      for (const issue of result.issues) {
        map.set(issue.path, [...(map.get(issue.path) ?? []), issue.message]);
      }
    }
    return map;
  }, [result]);

  function save() {
    startTransition(() => {
      submit({ kind, slug, frontmatter, body });
    });
  }

  // Cmd/Ctrl+S. Registering a listener is not state, so no lint tension here.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Unsaved work in a dev tool is still work.
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const bodyPlaceholders = body.split("\n").filter((l) => PLACEHOLDER_PATTERN.test(l)).length;
  const unmatchedIssues =
    result && !result.ok ? result.issues.filter((i) => !isRenderedPath(i.path, fields)) : [];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {/* Save bar. Sticky, because the fields below it are long. */}
      <div className="sticky top-0 z-10 -mx-2 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-bg/95 px-2 py-2 backdrop-blur">
        <code className="font-mono text-xs text-muted">{path}</code>
        <Tag tone={dirty ? "accent" : "muted"}>{dirty ? "unsaved" : "saved"}</Tag>
        <div className="ml-auto flex items-center gap-2">
          <Link href={publicHref} className={buttonClass} prefetch={false}>
            View page
          </Link>
          <button type="submit" className={primaryButtonClass} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          <kbd className="font-mono text-2xs text-subtle">⌘S</kbd>
        </div>
      </div>

      <div className="space-y-3">
        {result && !result.ok && (
          <Panel title="Not saved" tone="warn">
            <p className="text-sm text-text">{result.message}</p>
            {result.issues.length > 0 && (
              <ul className="mt-2 space-y-0.5 font-mono text-xs text-text">
                {result.issues.map((issue, i) => (
                  <li key={i}>
                    <span className="text-muted">{issue.path || "(root)"}</span>, {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {unmatchedIssues.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Some of those paths have no control in this form; they come from corpus-level
                rules rather than from a single field.
              </p>
            )}
          </Panel>
        )}

        {result?.ok && !dirty && (
          <Panel title="Saved">
            <p className="text-sm text-text">
              Written to <code className="font-mono">{result.path}</code>. Search results stay
              stale until the index is rebuilt from{" "}
              <Link href="/admin" className="text-accent underline underline-offset-2">
                the admin index
              </Link>
              .
            </p>
            {result.warnings.map((warning, i) => (
              <p key={i} className="mt-1.5 text-xs text-muted">
                {warning}
              </p>
            ))}
          </Panel>
        )}

        {props.comments.length > 0 && (
          <Panel title="YAML comments will not survive a save" tone="warn">
            <p className="text-sm text-text">
              Frontmatter round-trips through a data structure, and comments are not data. Move
              anything you need into a field before saving.
            </p>
            <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted">
              {props.comments.map((comment, i) => (
                <li key={i}>{comment}</li>
              ))}
            </ul>
          </Panel>
        )}

        {props.initialIssues.length > 0 && (
          <Panel title="This file does not currently satisfy the schema" tone="warn">
            <ul className="space-y-0.5 font-mono text-xs text-text">
              {props.initialIssues.map((issue, i) => (
                <li key={i}>
                  <span className="text-muted">{issue.path || "(root)"}</span>, {issue.message}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {props.placeholders.length > 0 && (
          <Panel title={`${props.placeholders.length} placeholder(s) on disk`}>
            <ul className="space-y-0.5 font-mono text-xs text-muted">
              {props.placeholders.map((placeholder) => (
                <li key={placeholder.line}>
                  <span className="text-subtle tabular-nums">{placeholder.line}</span>{" "}
                  {placeholder.text}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <SectionRule>Frontmatter</SectionRule>
      <div className="space-y-4">
        {fields.map((spec) => (
          <FieldControl
            key={spec.key}
            spec={spec}
            path={spec.key}
            value={frontmatter[spec.key]}
            errors={errors}
            onChange={(next) => setFrontmatter((prev) => ({ ...prev, [spec.key]: next }))}
          />
        ))}
      </div>

      <SectionRule>Body (MDX)</SectionRule>
      <FieldLabel htmlFor="entry-body">Body</FieldLabel>
      <textarea
        id="entry-body"
        aria-describedby="entry-body-help"
        className={`${inputClass} mt-1 min-h-120 resize-y font-mono text-xs leading-relaxed`}
        value={body}
        spellCheck={false}
        onChange={(event) => setBody(event.target.value)}
      />
      <Help id="entry-body-help">
        Written back exactly as typed. {body.trim().length.toLocaleString()} chars
        {body.trim().length < MIN_BODY_CHARS &&
          `, check:content fails under ${MIN_BODY_CHARS}`}
        {bodyPlaceholders > 0 && ` · ${bodyPlaceholders} placeholder line(s)`}
      </Help>

      <div className="mt-6 flex items-center gap-2">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!dirty}
          onClick={() => {
            setFrontmatter(props.initialFrontmatter);
            setBody(props.initialBody);
            setBaseline(JSON.stringify({ frontmatter: props.initialFrontmatter, body: props.initialBody }));
          }}
        >
          Revert to file
        </button>
      </div>
    </form>
  );
}

/** Does this Zod path correspond to a control the form actually renders? */
function isRenderedPath(path: string, fields: FieldSpec[]): boolean {
  const [head] = path.split(".");
  return fields.some((field) => field.key === head);
}
