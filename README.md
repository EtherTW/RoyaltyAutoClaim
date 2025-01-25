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

- 有時出現奇怪錯誤，需要先清理再重新編譯
```
forge clean
```

## Frontend

```
cd frontend
pnpm install
pnpm generate-types
```
- 若合約有更新，記得先 `forge build`後再 `pnpm generate-types`，前端測試才會更新

### Local dev net

- anvil http://localhost:8545
- alto http://localhost:4337

```
docker compose up -d
```

```
pnpm test 
pnpm test <path>
pnpm test -t <test_name>
```


- For icon, use [lucide-vue-next](https://lucide.dev/icons)
- For Component, use [shadcn-vue](https://www.shadcn-vue.com/docs/components/accordion.html)


## Reference

- https://github.com/consenlabs/ethtaipei2023-aa-workshop
- https://github.com/erc7579/erc7579-implementation
