build:
	forge build && cd frontend && bun run gen-types

build-src:
	forge build src/*

gen-types:
	cd frontend && bun run gen-types

deploy:
	cd frontend && bun run deploy

dev:
	cd frontend && bun run dev --host

# the following has been deprecated

start:
	make build && cd frontend && docker compose up -d && bun run deploy-contracts:local

restart:
	make build && cd frontend && docker compose restart && bun run deploy-contracts:local

down:
	cd frontend && docker compose down

up:
	make build && cd frontend && docker compose up -d

deploy-mainnet:
	forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url $$mainnet --broadcast --verify

deploy-sepolia:
	forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url $$sepolia --broadcast --verify

test-e2e-local:
	make build && cd frontend && bun run test test/e2e-local.test.ts

test-e2e-sepolia:
	make build && cd frontend && bun run test test/e2e-sepolia.test.ts