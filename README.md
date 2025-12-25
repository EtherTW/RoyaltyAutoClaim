## RoyaltyAutoClaim

This is the README for v2. For v1, please check out git commit 851b67b5849ab983d183a8808531b7d80ca5862c

-   [[TEM] 去中心化領稿費機制實驗 1](https://hackmd.io/@nic619/SkZDIp2GJl)
-   [[TEM] 去中心化領稿費機制實驗 2](https://hackmd.io/@nic619/ryKXwRXmge)

### Dev Flow

circuits

```
cd circuits/title_hash
nargo compile
bun run script/genProofTitleHash.ts ../emails/registration.eml
bun run script/genVerifier.ts title_hash
```

contract

```
forge build
forge test
forge fmt
```

frontend

```
make gen-types
make deploy

cd frontend
bun run scripts/gen-proof.ts <EMAIL_FILENAME> <EMAIL_VERIFIER_ADDRESS>
bun run scripts/register.ts <EMAIL_FILENAME> <RAC_ADDRESS>
bun run scripts/update-recipient.ts test-update 0x43024C2e168E4554d71A93e1F8d1a083f8e6624E

(Update frontend .env for VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA)
bun run dev
```

## Contract Development

```
forge test
forge coverage
forge coverage --report lcov
forge test --gas-report
```

-   Ensure the storage layout is empty to avoid storage collision during future upgrades

```
forge inspect ./src/RoyaltyAutoClaim.sol:RoyaltyAutoClaim storage
```

-   If `Error: failed to read artifact source file for...` appears, you need to clean and recompile

```
forge clean
```

### Deployment

Check out `deploy.json` to update the parameters of the deploy script.

```
forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url https://sepolia.base.org --broadcast --verify
```

Deployed Addresses

-   Mainnet: [0xf50b818138e3848C314783FA593fb39653FB0178](https://etherscan.io/address/0xf50b818138e3848C314783FA593fb39653FB0178)
-   Sepolia: [0x66ECf28b049f8b917C58B6e81a999CDF309283eA](https://sepolia.etherscan.io/address/0x66ECf28b049f8b917C58B6e81a999CDF309283eA)

### ZK Email Integration (Circuits)

-   UserOverrideableDKIMRegistry
    -   [contract](https://vscode.blockscan.com/8453/0x0537487ff990df53b29bd3e4b4a4c5c80c17f958)
    -   [address on base](https://basescan.org/address/0x3D3935B3C030893f118a84C92C66dF1B9E4169d6#readProxyContract)
-   Remember to use the correct version when compiling and generating proofs.
    ```
    Noir version: 1.0.0-beta.5+c651df6e2bf5db3966aa0c95abea2fc4c69d4513
    "@aztec/bb.js": "0.84.0",
    "@noir-lang/noir_js": "1.0.0-beta.5",
    ```
-   The frontend scripts currently only implement the title_hash circuit.

### Semaphore Integration

-   Semaphore v2 Verifier
    -   [contract](https://vscode.blockscan.com/8453/0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D)
    -   [address on base](https://basescan.org/address/0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D#readProxyContract)

## Frontend Development

-   Remember to set up `.env` in frontend
-   If the contract has been updated, remember to run `forge build` before `bun run gen-types`
-   Don’t use the alias @ in .ts files, because some scripts depend on functions from the src directory, and running those scripts directly won’t recognize @.
