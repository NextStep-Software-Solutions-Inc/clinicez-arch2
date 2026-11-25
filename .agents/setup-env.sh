#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ensure ~/.bashrc loads in non-interactive shells (BASH_ENV)
touch "$HOME/.bashrc"
if sed --version >/dev/null 2>&1; then
  sed -i '/case \$- in/,/esac/d' "$HOME/.bashrc" 2>/dev/null || true
fi

# 1. Node.js (pinned by .node-version)
NODE_VERSION="24.22.1"
if [ -f "$REPO_ROOT/.node-version" ]; then
  NODE_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/.node-version")"
fi

if [ "$(uname -s)" = "Linux" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
    *) echo "Unsupported Linux architecture: $ARCH" >&2; exit 1 ;;
  esac

  NODE_DIR="$HOME/.local/node/v${NODE_VERSION}"
  if [ ! -x "$NODE_DIR/bin/node" ] || [ "$("$NODE_DIR/bin/node" -v 2>/dev/null || true)" != "v${NODE_VERSION}" ]; then
    mkdir -p "$HOME/.local/node"
    TMP_DIR="$(mktemp -d)"
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
      -o "$TMP_DIR/node.tar.xz"
    tar -xJf "$TMP_DIR/node.tar.xz" -C "$TMP_DIR"
    rm -rf "$NODE_DIR"
    mv "$TMP_DIR/node-v${NODE_VERSION}-linux-${NODE_ARCH}" "$NODE_DIR"
    rm -rf "$TMP_DIR"
  fi
  ln -sfn "$NODE_DIR" "$HOME/.local/node/current"
fi

# 2. Bun (matching CI workflows and bun.lock / bunfig.toml)
BUN_VERSION="1.4.3"
export BUN_INSTALL="$HOME/.bun"
if [ ! -x "$BUN_INSTALL/bin/bun" ] || [ "$("$BUN_INSTALL/bin/bun" --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi

# Persist Bun and Node paths idempotently in ~/.bashrc
if [ -d "$HOME/.local/node/current/bin" ]; then
  export PATH="$HOME/.bun/bin:$HOME/.local/node/current/bin:$PATH"
  grep -qxF 'export BUN_INSTALL="$HOME/.bun"' "$HOME/.bashrc" || echo 'export BUN_INSTALL="$HOME/.bun"' >> "$HOME/.bashrc"
  grep -qxF 'export PATH="$HOME/.bun/bin:$HOME/.local/node/current/bin:$PATH"' "$HOME/.bashrc" || echo 'export PATH="$HOME/.bun/bin:$HOME/.local/node/current/bin:$PATH"' >> "$HOME/.bashrc"
else
  export PATH="$HOME/.bun/bin:$PATH"
  grep -qxF 'export BUN_INSTALL="$HOME/.bun"' "$HOME/.bashrc" || echo 'export BUN_INSTALL="$HOME/.bun"' >> "$HOME/.bashrc"
  grep -qxF 'export PATH="$HOME/.bun/bin:$PATH"' "$HOME/.bashrc" || echo 'export PATH="$HOME/.bun/bin:$PATH"' >> "$HOME/.bashrc"
fi

# 3. .NET 10 SDK (ensure channel 10.0 is available)
if ! command -v dotnet >/dev/null 2>&1 || ! dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; then
  mkdir -p "$HOME/.dotnet"
  curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 10.0 --install-dir "$HOME/.dotnet"
  export DOTNET_ROOT="$HOME/.dotnet"
  export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"
  grep -qxF 'export DOTNET_ROOT="$HOME/.dotnet"' "$HOME/.bashrc" || echo 'export DOTNET_ROOT="$HOME/.dotnet"' >> "$HOME/.bashrc"
  grep -qxF 'export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"' "$HOME/.bashrc" || echo 'export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"' >> "$HOME/.bashrc"
fi

# 4. Install JavaScript/TypeScript monorepo dependencies and deduplicate nested React copies (matches CI)
bun install --frozen-lockfile
rm -rf \
  apps/*/node_modules/react \
  apps/*/node_modules/react-dom \
  apps/*/node_modules/@types/react \
  apps/*/node_modules/@types/react-dom \
  packages/*/node_modules/react \
  packages/*/node_modules/react-dom \
  packages/*/node_modules/@types/react \
  packages/*/node_modules/@types/react-dom

# 5. Restore .NET solution packages
dotnet restore CLINICEZ.sln

echo "Environment ready: node=$(node -v), bun=$(bun --version), dotnet=$(dotnet --version)"
