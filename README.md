## RoyaltyAutoClaim

- [去中心化領稿費機制實驗 HackMD](https://hackmd.io/@nic619/SkZDIp2GJl?utm_source=substack&utm_medium=email)


### Rules

Owner
- 升級合約
- 指定 Admin
- 更改稿費幣種
- 轉移所有權
- 領出所有代幣

Admin
- 更新 reviewers
- 登記投稿
- 更新投稿的收款地址
- 撤銷投稿

Reviewer
- 更新投稿的稿費等級

Submitter
- 領取稿費

## Contract Test

```
forge test
forge coverage
forge coverage --report lcov 
```

## Frontend

- For icon, use [lucide-vue-next](https://lucide.dev/icons)
- For Component, use [shadcn-vue](https://www.shadcn-vue.com/docs/components/accordion.html)
- Vue 3 + Vite + TypeScript + TailwindCSS


## Reference

- https://github.com/consenlabs/ethtaipei2023-aa-workshop
- https://github.com/erc7579/erc7579-implementation
