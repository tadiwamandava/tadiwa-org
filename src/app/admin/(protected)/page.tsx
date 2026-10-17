import Link from "next/link";

import { NewEntry } from "@/components/admin/new-entry";
import { RebuildSearch } from "@/components/admin/rebuild-search";
import { Panel, Tag } from "@/components/admin/ui";
import { assertAdminAccess } from "@/lib/admin/guard";
import { getIndexStatus } from "@/lib/admin/search-index";
import { contentStore } from "@/lib/admin/store-fs";
import type { EntryKind, EntrySummary } from "@/lib/admin/store";

/**
 * The index, and, more usefully, the to-do queue.
 *
 * The list is sorted so anything unfinished floats to the top: a file that
 * fails the schema first, then anything still carrying a TODO/CONFIRM
 * placeholder, then everything else newest-first. `CONFIRM.md` is a static
 * list that goes stale the moment something is filled in; this one is computed
 * from the files on every request, so it cannot lie.
 */

// The corpus is read from disk on every request. Caching it would mean the
// admin showing a file it has just written as unchanged.
export const dynamic = "force-dynamic";

export default async function AdminIndexPage() {
  await assertAdminAccess();

  const [projects, posts] = await Promise.all([
    contentStore.list("project"),
    contentStore.list("post"),
  ]);

  const all = [...projects, ...posts];
  const unfinished = all.filter((e) => !e.valid || e.placeholders.length > 0);
  const placeholderCount = all.reduce((n, e) => n + e.placeholders.length, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title="Corpus">
          <p className="text-sm text-text">
            {projects.length} project{projects.length === 1 ? "" : "s"} · {posts.length} post
            {posts.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {unfinished.length === 0 ? (
              "Everything validates and nothing carries a placeholder."
            ) : (
              <>
                {unfinished.length} entr{unfinished.length === 1 ? "y" : "ies"} still unfinished ·{" "}
                {placeholderCount} placeholder line{placeholderCount === 1 ? "" : "s"}
              </>
            )}
          </p>
        </Panel>
        <RebuildSearch status={getIndexStatus()} />
      </div>

      <EntryList kind="project" title="Projects" entries={projects} />
      <EntryList kind="post" title="Writing" entries={posts} />
    </div>
  );
}

function EntryList({
  kind,
  title,
  entries,
}: {
  kind: EntryKind;
  title: string;
  entries: EntrySummary[];
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-2 border-b border-border pb-1.5 text-2xs text-muted">
        {title}
        <span className="text-subtle tabular-nums">{entries.length}</span>
      </h2>

      {entries.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nothing here yet.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <EntryRow key={entry.slug} entry={entry} />
          ))}
        </ul>
      )}

      <NewEntry kind={kind} />
    </section>
  );
}

function EntryRow({ entry }: { entry: EntrySummary }) {
  const href =
    entry.kind === "project"
      ? `/admin/projects/${entry.slug}`
      : `/admin/writing/${entry.slug}`;
  const needsWork = !entry.valid || entry.placeholders.length > 0;

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
        <Link
          href={href}
          className={`text-sm underline decoration-dotted underline-offset-4 hover:text-accent ${
            needsWork ? "font-semibold text-text" : "text-muted"
          }`}
        >
          {entry.title}
        </Link>

        {entry.status && <StatusTag status={entry.status} />}
        {entry.draft && <Tag tone="muted">draft</Tag>}

        {!entry.valid && <Tag tone="accent">invalid</Tag>}
        {entry.placeholders.length > 0 && (
          <Tag tone="accent">
            {entry.placeholders.length} todo
          </Tag>
        )}
        {!needsWork && <Tag tone="muted">clean</Tag>}

        <code className="ml-auto font-mono text-2xs text-subtle">{entry.path}</code>
      </div>

      {/* The actual queue: what is wrong, inline, so no drill-down is needed. */}
      {!entry.valid && (
        <ul className="mb-2 space-y-0.5 font-mono text-2xs text-accent">
          {entry.issues.slice(0, 6).map((issue, i) => (
            <li key={i}>
              {issue.path || "(root)"}: {issue.message}
            </li>
          ))}
        </ul>
      )}
      {entry.placeholders.length > 0 && (
        <ul className="mb-2 space-y-0.5 font-mono text-2xs text-subtle">
          {entry.placeholders.slice(0, 4).map((placeholder) => (
            <li key={placeholder.line} className="truncate">
              <span className="tabular-nums">{placeholder.line}</span> {placeholder.text}
            </li>
          ))}
          {entry.placeholders.length > 4 && (
            <li>+{entry.placeholders.length - 4} more</li>
          )}
        </ul>
      )}
    </li>
  );
}

const STATUS_TONE = {
  shipped: "text-shipped",
  building: "text-building",
  planned: "text-planned",
} as const;

function StatusTag({ status }: { status: string }) {
  const tone = STATUS_TONE[status as keyof typeof STATUS_TONE] ?? "text-muted";
  return (
    <span className={`text-2xs ${tone}`}>{status}</span>
  );
}
