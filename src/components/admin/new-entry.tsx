"use client";

/**
 * "New project" / "New post".
 *
 * Type a title, get a file that is already valid, schema minimums met, corpus
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
        className="block text-2xs text-muted"
      >
        New {kind}, title
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={inputId}
          type="text"
          className={`${inputClass} min-w-0 max-w-96 flex-1 basis-60`}
          value={title}
          placeholder={kind === "project" ? "LSM storage engine" : "Debugging the storage engine"}
          aria-describedby={`${inputId}-slug`}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" className={buttonClass} disabled={pending || slug === ""}>
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
      <p id={`${inputId}-slug`} className="mt-1 break-all font-mono text-xs text-subtle">
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
