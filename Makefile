build:
	forge build && cd frontend && bun install && bun run gen-types

gen-types:
	cd frontend && bun run gen-types

prepare-circuit:
	cd frontend && bun run prepare-circuit

deploy:
	cd frontend && bun run deploy

dev:
	cd frontend && bun run dev --host

# Usage: make estimate-vgl-base-sepolia EMAIL=test RAC=0x...
estimate-vgl-base-sepolia:
	cd frontend && bun run scripts/estimate-verificationGasLimit.ts $(EMAIL) $(RAC) 84532

# Usage: make estimate-vgl-base EMAIL=test RAC=0x...
estimate-vgl-base:
	cd frontend && bun run scripts/estimate-verificationGasLimit.ts $(EMAIL) $(RAC) 8453

# Usage: make check-dkim EMAIL=test
check-dkim:
	cd frontend && bun run scripts/check-dkim-pubkey.ts $(EMAIL)

# Usage: make set-dkim EMAIL=test_prod
# Usage: make set-dkim EMAIL=test_prod CHAIN=base
# CHAIN defaults to base-sepolia if not provided
# PRIVATE_KEY is read from .env
set-dkim:
	cd frontend && PRIVATE_KEY=$$(grep '^PRIVATE_KEY=' ../.env | cut -d= -f2-) bun run scripts/set-dkim-pubkey.ts $(EMAIL) $(if $(CHAIN),--chain $(CHAIN),)