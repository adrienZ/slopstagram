#!/bin/bash
# Cloud environment setup script for slopstagram.
# Runs once per new session, from the directory ABOVE the repository.
# Installs the Node version pinned in .nvmrc and the npm dependencies.
set -euo pipefail

cd slopstagram

export NVM_DIR="${NVM_DIR:-/opt/nvm}"
# nvm.sh is not safe under `set -u`, so relax it while sourcing and running nvm.
set +u
. "$NVM_DIR/nvm.sh"
nvm install                       # reads .nvmrc
nvm alias default "$(cat .nvmrc)" # new shells pick this version
nvm use >/dev/null
set -u

# Make later shells (the ones that run the agent's commands) use the pinned version.
LINE='export NVM_DIR="${NVM_DIR:-/opt/nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use default >/dev/null'
for rc in "$HOME/.bashrc" "$HOME/.profile"; do
  grep -qxF "$LINE" "$rc" 2>/dev/null || echo "$LINE" >> "$rc"
done

node -v
npm ci
