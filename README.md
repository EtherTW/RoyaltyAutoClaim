## RoyaltyAutoClaim

-   [[TEM] 去中心化領稿費機制實驗 1](https://hackmd.io/@nic619/SkZDIp2GJl)
-   [[TEM] 去中心化領稿費機制實驗 2](https://hackmd.io/@nic619/ryKXwRXmge)

## Contract

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

### Contract Deployment

```
forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url RPC_URL --broadcast --verify
```

-   Mainnet: [0xf50b818138e3848C314783FA593fb39653FB0178](https://etherscan.io/address/0xf50b818138e3848C314783FA593fb39653FB0178)
-   Sepolia: [0x66ECf28b049f8b917C58B6e81a999CDF309283eA](https://sepolia.etherscan.io/address/0x66ECf28b049f8b917C58B6e81a999CDF309283eA)

### Feat: Email Registration

-   zkemail blueprint: https://registry.zk.email/a8a89855-6453-43e2-ae0a-867c34e0e32b/versions
-   `circuits/circuit.zip` is from the blueprint `Download Icon > circuit.zip`
-   Execute `make proof registration` to generate the proof.json for a file named `registration` in the emails folder.
-   UserOverrideableDKIMRegistry
    -   [contract](https://vscode.blockscan.com/8453/0x0537487ff990df53b29bd3e4b4a4c5c80c17f958)
    -   [address on base](https://basescan.org/address/0x3D3935B3C030893f118a84C92C66dF1B9E4169d6#readProxyContract)

Test Commands

```
forge script script/deployRegistrationVerifier.s.sol --rpc-url https://sepolia.base.org --broadcast --verify
cast send --account dev --rpc-url https://sepolia.base.org 0xaCf34e475Ef850AF607ECA2563C07542F5D2F47a --value 0.0003ether
cd frontend
bun run scripts/register.ts registration 0xaCf34e475Ef850AF607ECA2563C07542F5D2F47a
bun run scripts/update-recipient.ts recipient-update 0xaCf34e475Ef850AF607ECA2563C07542F5D2F47a
```

## Frontend

### Notices

-   Don’t use the alias @ in .ts files, because some scripts depend on functions from the src directory, and running those scripts directly won’t recognize @.

### Notes

-   Remember to set up .env in frontend
-   If the contract has been updated, remember to run `forge build` before `bun run generate-types`
-   We use Pimlico bundler in local devnet but use Alchemy bundler on Sepolia and Mainnet. Check out frontend/src/config.ts BUNDLER_URL.
-   For icon, use [lucide-vue-next](https://lucide.dev/icons)
-   For Component, use [shadcn-vue](https://www.shadcn-vue.com/docs/components/accordion.html)
-   For Notification Component, see [docs](https://kyvg.github.io/vue3-notification/api/)

### v1

```
cd frontend
bun run install
bun run generate-types

docker compose up -d
bun run deploy-contracts:local

bun run dev
bun run test test/e2e-local.test.ts
bun run test test/e2e-sepolia.test.ts

bun run test <path>
bun run vitest -t <test_name>
```

### v2

```
bun run check
bun run gen-types
bun run test test/e2e-base-sepolia.test.ts
```
