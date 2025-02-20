build:
	forge build && cd frontend && pnpm generate-types

devnet:
	make build && cd frontend && docker compose up -d && pnpm deploy-contracts:local

restart:
	make build && cd frontend && docker compose restart && pnpm deploy-contracts:local

down:
	cd frontend && docker compose down

dev:
	cd frontend && pnpm dev --host

deploy-sepolia:
	forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url $sepolia --broadcast --verify