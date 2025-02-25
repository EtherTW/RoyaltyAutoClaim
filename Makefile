build:
	forge build && cd frontend && pnpm generate-types

start:
	make build && cd frontend && docker compose up -d && pnpm deploy-contracts:local

restart:
	make build && cd frontend && docker compose restart && pnpm deploy-contracts:local

down:
	cd frontend && docker compose down

up:
	make build && cd frontend && docker compose up -d

dev:
	cd frontend && pnpm dev --host

deploy-sepolia:
	forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url $$sepolia --broadcast --verify

test-e2e-local:
	make build && cd frontend && pnpm test test/e2e-local.test.ts

test-e2e-sepolia:
	make build && cd frontend && pnpm test test/e2e-sepolia.test.ts