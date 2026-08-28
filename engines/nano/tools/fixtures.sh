#!/usr/bin/env bash
# Regenerates the golden op fixtures.
#
# Uses a dedicated venv rather than whatever `python3` currently resolves to.
# On this machine `brew install emscripten` pulled in python@3.14 and silently
# shadowed the system interpreter, which is exactly how "it worked yesterday"
# happens. The venv pins the interpreter that has numpy.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.venv"
if [ ! -x "$VENV/bin/python" ]; then
  echo "  creating venv…"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet numpy
fi
"$VENV/bin/python" "$HERE/make_fixtures.py"
