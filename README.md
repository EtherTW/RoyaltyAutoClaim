## RoyaltyAutoClaim

- [去中心化領稿費機制實驗 HackMD](https://hackmd.io/@nic619/SkZDIp2GJl?utm_source=substack&utm_medium=email)

## Contract Test

```
forge test
forge coverage
forge coverage --report lcov 
```

確保 storage layout 為空，避免未來升級時 storage collision 風險
```
forge inspect ./src/RoyaltyAutoClaim.sol:RoyaltyAutoClaim storage
```

## Frontend

- For icon, use [lucide-vue-next](https://lucide.dev/icons)
- For Component, use [shadcn-vue](https://www.shadcn-vue.com/docs/components/accordion.html)
- Vue 3 + Vite + TypeScript + TailwindCSS


## Reference

- https://github.com/consenlabs/ethtaipei2023-aa-workshop
- https://github.com/erc7579/erc7579-implementation
