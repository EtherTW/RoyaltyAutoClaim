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

### Feat: Email Registration

- Blueprint RoyaltyAutoClaim: https://registry.zk.email/a8a89855-6453-43e2-ae0a-867c34e0e32b/versions
- `circuits/` directory is from `Download Files > circuit.zip`
- Execute `deployEmailVerifier.s.sol` to deploy verifier on base sepolia
- Execute `make gen-proof` to generate proof.json
- Execute `forge test test/EmailVerifier.t.sol --rpc-url https://sepolia.base.org -vvvv` to test the verifier on base sepolia


## Frontend

- Remember to set up .env in frontend
- If the contract has been updated, remember to run `forge build` before `bun run generate-types`
- We use Pimlico bundler in local devnet but use Alchemy bundler on Sepolia and Mainnet. Check out frontend/src/config.ts BUNDLER_URL.
- For icon, use [lucide-vue-next](https://lucide.dev/icons)
- For Component, use [shadcn-vue](https://www.shadcn-vue.com/docs/components/accordion.html)
- For Notification Component, see [docs](https://kyvg.github.io/vue3-notification/api/)

```
cd frontend
bun run install
bun run generate-types

docker compose up -d
bun run deploy-contracts:local

bun run dev
bun run test test/e2e-local.test.ts

bun run test <path>
bun run vitest -t <test_name>
```