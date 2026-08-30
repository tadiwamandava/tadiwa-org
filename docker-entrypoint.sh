#!/bin/sh
# Seeds a content volume on first boot.
#
# THE PROBLEM THIS SOLVES. Mounting a volume at /app/content SHADOWS whatever
# the image put there, so a fresh volume gives a container with an empty
# corpus: a site with no projects, no writing, and a résumé of nothing. That
# failure looks like a broken build rather than an empty disk.
#
# So the image keeps a pristine copy at /app/content-image and this copies it
# in the first time the volume is empty. Afterwards the volume is authoritative
# and is never overwritten, because overwriting it would silently discard
# whatever was edited through /admin.
#
# THE COST, WHICH DEPLOY.md STATES PLAINLY. Once the volume diverges from the
# repo, the deployed corpus and git are two different things, and this script
# will not reconcile them. Running without a volume keeps them identical and
# makes /admin edits last only until the next deploy. Neither is free.
set -e

if [ -d /app/content-image ] && [ -z "$(ls -A /app/content 2>/dev/null)" ]; then
  echo "  content volume is empty, seeding from the image"
  cp -a /app/content-image/. /app/content/
fi

exec "$@"
