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

## Frontend

- Remember to set up .env in frontend
- If the contract has been updated, remember to run `forge build` before `pnpm generate-types`
- We use Pimlico bundler in local devnet but use Alchemy bundler on Sepolia and Mainnet. Check out frontend/src/config.ts BUNDLER_URL.
- For icon, use [lucide-vue-next](https://lucide.dev/icons)
- For Component, use [shadcn-vue](https://www.shadcn-vue.com/docs/components/accordion.html)


```
cd frontend
pnpm install
pnpm generate-types

docker compose up -d
pnpm deploy-contracts:local

pnpm dev
pnpm test test/e2e-local.test.ts

pnpm test <path>
pnpm vitest -t <test_name>
```