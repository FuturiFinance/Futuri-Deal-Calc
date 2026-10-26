#!/usr/bin/env bash
# Runs the Firestore security rules tests against the local emulator.
#
#   npm run test:rules
#
# The emulator is a Java program and firebase-tools requires JDK 21 or newer.
# macOS ships Java 8 and Homebrew's openjdk is keg-only, so rather than editing
# anyone's shell profile we find a suitable JDK here and put it on PATH for this
# process only.
set -uo pipefail

cd "$(dirname "$0")/.."

# Major version of a java binary, or 0 if it will not run.
# Handles both "1.8.0_371" (-> 8) and "21.0.13" (-> 21).
java_major() {
  local out
  out="$("$1" -version 2>&1 | head -1)" || { echo 0; return; }
  local v
  v="$(printf '%s' "$out" | sed -E 's/^[^"]*"([0-9]+)\.?([0-9]+)?.*/\1 \2/')"
  local maj="${v%% *}" min="${v##* }"
  if [ "$maj" = "1" ] && [ -n "$min" ]; then echo "$min"; else echo "${maj:-0}"; fi
}

# Candidates in preference order. /usr/libexec/java_home is included but NOT
# trusted: with only a Java 8 JVM registered it still answers `-v 21+` with the
# Java 8 path and exit 0, so every candidate is version-checked below.
candidates=()
command -v java >/dev/null 2>&1 && candidates+=("$(command -v java)")
if [ -x /usr/libexec/java_home ]; then
  for want in 24 23 22 21; do
    h="$(/usr/libexec/java_home -v "$want" 2>/dev/null)" && candidates+=("$h/bin/java")
  done
fi
for d in /opt/homebrew/opt/openjdk@24 /opt/homebrew/opt/openjdk@23 \
         /opt/homebrew/opt/openjdk@22 /opt/homebrew/opt/openjdk@21 \
         /opt/homebrew/opt/openjdk /usr/local/opt/openjdk@21 \
         /usr/local/opt/openjdk /usr/lib/jvm/java-21-openjdk-amd64; do
  [ -x "$d/bin/java" ] && candidates+=("$d/bin/java")
done

JAVA_BIN=""
for c in "${candidates[@]:-}"; do
  [ -x "$c" ] || continue
  if [ "$(java_major "$c")" -ge 21 ] 2>/dev/null; then JAVA_BIN="$c"; break; fi
done

if [ -z "$JAVA_BIN" ]; then
  echo "No JDK 21+ found. The Firestore emulator needs one." >&2
  echo "  macOS:  brew install openjdk@21" >&2
  exit 1
fi

export JAVA_HOME="$(cd "$(dirname "$JAVA_BIN")/.." && pwd)"
export PATH="$JAVA_HOME/bin:$PATH"
echo "Using JDK: $(java -version 2>&1 | head -1)"

# demo-* project ids never touch a real Firebase project and need no login.
exec npx firebase emulators:exec \
  --only firestore \
  --project demo-futuri-rules \
  "node tools/firestore-rules.test.mjs"
