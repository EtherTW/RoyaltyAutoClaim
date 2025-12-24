#!/bin/bash
set -e

echo "Preparing frontend assets..."

# Create public/wasm directory
mkdir -p public/wasm

# Copy WASM files from node_modules (from root)
cp ./node_modules/@noir-lang/acvm_js/web/acvm_js_bg.wasm public/wasm/
cp ./node_modules/@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm public/wasm/

echo "✓ WASM files copied to public/wasm/"

# Copy circuit JSON
cp ../circuits/title_hash/target/title_hash.json public/

echo "✓ Circuit JSON copied to public/"

echo "Assets prepared successfully!"
