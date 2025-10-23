build:
	forge build && cd frontend && bun run generate-types

start:
	make build && cd frontend && docker compose up -d && bun run deploy-contracts:local

restart:
	make build && cd frontend && docker compose restart && bun run deploy-contracts:local

down:
	cd frontend && docker compose down

up:
	make build && cd frontend && docker compose up -d

dev:
	cd frontend && bun run dev --host

deploy-mainnet:
	forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url $$mainnet --broadcast --verify

deploy-sepolia:
	forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url $$sepolia --broadcast --verify

test-e2e-local:
	make build && cd frontend && bun run test test/e2e-local.test.ts

test-e2e-sepolia:
	make build && cd frontend && bun run test test/e2e-sepolia.test.ts

# Allows to pass the email file name as an argument
# e.g. make proof registration
EMAIL_NAME = $(filter-out $@,$(MAKECMDGOALS))

proof:
	cd frontend && bun run scripts/gen-proof.ts $(EMAIL_NAME)

# Prevents make from complaining about unknown targets when passing arguments
%:
	@: