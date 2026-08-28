"use client";

/**
 * "New project" / "New post".
 *
 * Type a title, get a file that is already valid — schema minimums met, corpus
 * invariants satisfied, `status: building` so the shipped/finished rule holds.
 * The placeholder text is deliberate TODO copy, so the entry appears in the
 * unfinished list on this very page the moment it exists.
 *
 * On success the action redirects into the editor, so the only result this
 * component ever renders is a failure.
 */

import { startTransition, useActionState, useState } from "react";

import { createEntryAction } from "@/app/admin/actions";
import type { CreatePayload, CreateResult } from "@/lib/admin/action-types";
import { slugify } from "@/lib/admin/defaults";
import type { EntryKind } from "@/lib/admin/store";
import { buttonClass, inputClass } from "./ui";

export function NewEntry({ kind }: { kind: EntryKind }) {
  const [title, setTitle] = useState("");
  const [result, create, pending] = useActionState<CreateResult | null, CreatePayload>(
    createEntryAction,
    null,
  );

  const slug = slugify(title);
  const inputId = `new-${kind}-title`;

  return (
    <form
      className="mt-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => create({ kind, title }));
      }}
    >
      <label
        htmlFor={inputId}
        className="block font-mono text-2xs tracking-wide text-muted uppercase"
      >
        New {kind} — title
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          type="text"
          className={`${inputClass} max-w-96`}
          value={title}
          placeholder={kind === "project" ? "LSM storage engine" : "What the gate taught me"}
          aria-describedby={`${inputId}-slug`}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" className={buttonClass} disabled={pending || slug === ""}>
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
      <p id={`${inputId}-slug`} className="mt-1 font-mono text-xs text-subtle">
        {slug
          ? `content/${kind === "project" ? "projects" : "writing"}/${slug}.mdx`
          : "The slug comes from the title."}
      </p>
      {result && !result.ok && (
        <p className="mt-1 text-xs text-accent" role="alert">
          {result.message}
        </p>
      )}
    </form>
  );
}
