#!/bin/bash

# Generate TypeScript types from contract ABIs
rm -rf src/typechain-v2 && \
typechain --target ethers-v6 \
  --out-dir 'src/typechain-v2' \
  '../out/**/RoyaltyAutoClaimProxy.sol/*.json' \
  '../out/**/RoyaltyAutoClaim.sol/*.json' \
  '../out/**/MockToken.sol/*.json' \
  '../out/**/EmailVerifier.sol/*.json' \
  'abis/ISemaphore.json' \
  'abis/ISemaphoreGroups.json'
