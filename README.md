## RoyaltyAutoClaim

- [去中心化領稿費機制實驗 HackMD](https://hackmd.io/@nic619/SkZDIp2GJl?utm_source=substack&utm_medium=email)

## Contract

```
forge test
forge coverage
forge coverage --report lcov 
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

## branch test/send2op

原本合約實作的 signer address 是放在 signature 後方

### commit 100ec717347b5e06ba0831c7d293093feffb2860
新增 send2op.test.ts 測試同時送兩個 userop，預期一個成功一個失敗，失敗是因為 nonce 被成功的 userop 用掉了。

### commit 4b9cfa9f362f173689220574ddb3eb39a5ce4adb
將合約改成 signer address 放在 nonceKey，修正 send2op.test.ts 進行測試，成功平行送出兩個 userop。



