## RoyaltyAutoClaim

- [去中心化領稿費機制實驗 HackMD](https://hackmd.io/@nic619/SkZDIp2GJl?utm_source=substack&utm_medium=email)

## Contract

```
forge test
forge coverage
forge coverage --report lcov
forge test --gas-report
```

- 確保 storage layout 為空，避免未來升級時 storage collision 風險

```
forge inspect ./src/RoyaltyAutoClaim.sol:RoyaltyAutoClaim storage
```

- 如果出現 `Error: failed to read artifact source file for...`，需要先清理再重新編譯
```
forge clean
```

### Reference

- https://github.com/consenlabs/ethtaipei2023-aa-workshop
- https://github.com/erc7579/erc7579-implementation


## Frontend

```
cd frontend
pnpm install
pnpm generate-types
```
- 若合約有更新，記得先 `forge build`後再 `pnpm generate-types`，前端測試才會更新

```
pnpm dev
pnpm test 
pnpm test <path>
pnpm vitest -t <test_name>
```

- For icon, use [lucide-vue-next](https://lucide.dev/icons)
- For Component, use [shadcn-vue](https://www.shadcn-vue.com/docs/components/accordion.html)


### Sepolia Development

- use AlchemyBundler

### Local Development

- use PimlicoBundler

```
docker compose up -d
pnpm deploy-contracts:local
```

.env 合約地址改成於 local network 部署的地址
```
VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS=0xa818cA7A4869c7C7101d0Ea5E4c455Ef00e698d5
```

frontend/src/config.ts 要改成 LOCAL
```ts
export const DEFAULT_CHAIN_ID = CHAIN_ID.LOCAL
```



