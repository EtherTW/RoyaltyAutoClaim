## RoyaltyAutoClaim

- [去中心化領稿費機制實驗 HackMD](https://hackmd.io/@nic619/SkZDIp2GJl?utm_source=substack&utm_medium=email)

## Contract

```
forge test
forge coverage
forge coverage --report lcov
forge test --gas-report
```

- Ensure the storage layout is empty to avoid storage collision during future upgrades

```
forge inspect ./src/RoyaltyAutoClaim.sol:RoyaltyAutoClaim storage
```

- If `Error: failed to read artifact source file for...` appears, you need to clean and recompile
```
forge clean
```

### Contract Deployment

```
forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url RPC_URL --broadcast --verify
```

- Mainnet: [0xf50b818138e3848C314783FA593fb39653FB0178](https://etherscan.io/address/0xf50b818138e3848C314783FA593fb39653FB0178)
- Sepolia: [0x66ECf28b049f8b917C58B6e81a999CDF309283eA](https://sepolia.etherscan.io/address/0x66ECf28b049f8b917C58B6e81a999CDF309283eA)

### Contract Upgrade

The contract uses [UUPS proxy](https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable) with [ERC7201 namespaced storage](https://eips.ethereum.org/EIPS/eip-7201). Only the **owner** can authorize upgrades.

Step 1 — Deploy new implementation:
```bash
forge script script/deployNewImpl.s.sol --rpc-url $NETWORK --broadcast --verify
```

Step 2 — Upgrade proxy to the new implementation:
```bash
PROXY_ADDRESS=0x... NEW_IMPL=0x... \
forge script script/upgradeRoyaltyAutoClaim.s.sol --rpc-url $NETWORK --broadcast
```

## Frontend

- Remember to set up .env in frontend
- If the contract has been updated, remember to run `forge build` before `bun generate-types`
- We use Pimlico bundler in local devnet but use Alchemy bundler on Sepolia and Mainnet. Check out frontend/src/config.ts BUNDLER_URL.
- For icon, use [lucide-vue-next](https://lucide.dev/icons)
- For Component, use [shadcn-vue](https://www.shadcn-vue.com/docs/components/accordion.html)
- For Notification Component, see [docs](https://kyvg.github.io/vue3-notification/api/)

```
cd frontend
bun install
bun generate-types

docker compose up -d
bun deploy-contracts:local

bun dev
bun test test/e2e-local.test.ts

bun test <path>
bun vitest -t <test_name>
```