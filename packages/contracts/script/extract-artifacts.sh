#!/usr/bin/env bash
set -euo pipefail

# Extract ABI + bytecode from Foundry output into SDK-consumable JSON artifacts.
# Run from packages/contracts/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SDK_ARTIFACTS="$CONTRACT_DIR/../sdk/src/distributor/artifacts"

mkdir -p "$SDK_ARTIFACTS"

cd "$CONTRACT_DIR"
forge build

for contract in TitrateSimple TitrateFull; do
  forge_out="$CONTRACT_DIR/out/${contract}.sol/${contract}.json"

  if [ ! -f "$forge_out" ]; then
    echo "ERROR: $forge_out not found. Run 'forge build' first."
    exit 1
  fi

  # Extract ABI and bytecode
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$forge_out', 'utf8'));
    const artifact = {
      contractName: '$contract',
      abi: data.abi,
      bytecode: data.bytecode.object.startsWith('0x') ? data.bytecode.object : '0x' + data.bytecode.object,
    };
    fs.writeFileSync('$SDK_ARTIFACTS/${contract}.json', JSON.stringify(artifact, null, 2));
  "

  echo "Extracted: $SDK_ARTIFACTS/${contract}.json"
done

for contract in TitrateSimple TitrateFull; do
  cp "$CONTRACT_DIR/src/${contract}.sol" "$SDK_ARTIFACTS/${contract}.sol.txt"
  echo "Copied source: $SDK_ARTIFACTS/${contract}.sol.txt"
done

echo "Done. Artifacts written to $SDK_ARTIFACTS"
