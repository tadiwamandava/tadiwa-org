#!/bin/sh
# Seeds a content volume on first boot, and fails usefully when it cannot.
#
# THE PROBLEM THIS SOLVES. Mounting anything at /app/content SHADOWS whatever
# the image put there. Docker copies the image's files into an empty NAMED
# volume by itself, but it does not do that for a BIND mount, so a host path
# gives a container with no projects, no writing and an empty resume. That
# failure looks like a content bug rather than an empty disk.
#
# THE FAILURE THIS ONE ACTUALLY HIT. The container runs as uid 1001, and a host
# directory created by the operator is owned by root as far as the container is
# concerned, so the copy is denied. The first version let `cp` fail under
# `set -e`, which exited 1 with three lines of cp errors and no clue what to do
# about it. A crash loop is the right outcome, since an empty corpus served as
# if it were the real one is worse, but the message has to say how to fix it.
set -e

CONTENT=/app/content
SEED=/app/content-image

if [ -d "$SEED" ] && [ -z "$(ls -A "$CONTENT" 2>/dev/null)" ]; then
  if ! touch "$CONTENT/.write-probe" 2>/dev/null; then
    echo "FATAL: $CONTENT is mounted but not writable by this container." >&2
    echo "" >&2
    echo "  The image runs as uid 1001 (nextjs). A bind-mounted host directory" >&2
    echo "  is owned by root unless you say otherwise, so the corpus cannot be" >&2
    echo "  seeded and the admin could not write to it either." >&2
    echo "" >&2
    echo "  On the host:  chown -R 1001:1001 <the directory you mounted>" >&2
    echo "" >&2
    echo "  Refusing to start rather than serving a site with no content." >&2
    exit 1
  fi
  rm -f "$CONTENT/.write-probe"

  echo "  $CONTENT is empty, seeding from the image"
  # cp -R, not -a. Preserving ownership and timestamps across a mount the
  # container does not own fails even where writing succeeds, and the file
  # contents are the only thing that matters here.
  cp -R "$SEED"/. "$CONTENT"/
fi

exec "$@"
