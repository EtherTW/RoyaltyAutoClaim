build:
	forge build && cd frontend && bun run gen-types

gen-types:
	cd frontend && bun run gen-types

prepare-circuit:
	cd frontend && bun run prepare-circuit

deploy:
	cd frontend && bun run deploy

dev:
	cd frontend && bun run dev --host

# Usage: make estimate-vgl-base-sepolia EMAIL=registration RAC=0x...
estimate-vgl-base-sepolia:
	cd frontend && bun run scripts/estimate-verificationGasLimit.ts $(EMAIL) $(RAC) 84532

# Usage: make estimate-vgl-base EMAIL=registration RAC=0x...
estimate-vgl-base:
	cd frontend && bun run scripts/estimate-verificationGasLimit.ts $(EMAIL) $(RAC) 8453