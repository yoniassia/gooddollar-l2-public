#!/usr/bin/env bash
# install-anvil-service.sh
# Installs and starts the Anvil devnet systemd service with state persistence.
# Must be run as root (or with sudo) on the devnet VM.
#
# GOO-365: adds --dump-state so chain state survives container/VM restarts.
#
# Usage: sudo bash infra/devnet/install-anvil-service.sh

set -euo pipefail

STATE_DIR="/home/opc/anvil-data"
SERVICE_NAME="anvil-devnet"
SERVICE_SRC="$(cd "$(dirname "$0")" && pwd)/anvil-devnet.service"
SERVICE_DST="/etc/systemd/system/${SERVICE_NAME}.service"

echo "[anvil-devnet] Installing state-persistent Anvil devnet (GOO-365)..."

# 1. Create state directory
mkdir -p "$STATE_DIR"
chown opc:opc "$STATE_DIR"
echo "  State dir: $STATE_DIR"

# 2. Snapshot current state from running Anvil (if it's still up)
if curl -s -X POST http://localhost:8545 \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    >/dev/null 2>&1; then
    echo "  Live Anvil detected — dumping current state before switch..."
    curl -s -X POST http://localhost:8545 \
        -H 'Content-Type: application/json' \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"anvil_dumpState\",\"params\":[],\"id\":1}" \
        -o /tmp/anvil-state-snapshot.json
    echo "  Snapshot written to /tmp/anvil-state-snapshot.json"
    echo "  NOTE: This is a raw state snapshot, not the --dump-state file format."
    echo "  The new service will start fresh on first boot with --dump-state."
fi

# 3. Install service file
cp "$SERVICE_SRC" "$SERVICE_DST"
chmod 644 "$SERVICE_DST"
echo "  Service installed: $SERVICE_DST"

# 4. Stop the bare Anvil process (if running without systemd)
if pgrep -f "anvil.*port.*8545" >/dev/null 2>&1; then
    echo "  Stopping bare Anvil process..."
    pkill -f "anvil.*port.*8545" || true
    sleep 2
fi

# 5. Reload systemd and enable + start the service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

sleep 2
systemctl status "$SERVICE_NAME" --no-pager

echo ""
echo "[anvil-devnet] Done. State will be saved to $STATE_DIR/state.json every 60s"
echo "  Check logs: journalctl -u $SERVICE_NAME -f"
echo "  State file: $STATE_DIR/state.json"
echo ""
echo "  On next restart, Anvil auto-loads $STATE_DIR/state.json (same --dump-state flag"
echo "  acts as --load-state when the file already exists)."
