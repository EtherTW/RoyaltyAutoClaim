build:
	forge build && cd frontend && bun run gen-types

gen-types:
	cd frontend && bun run gen-types

deploy:
	cd frontend && bun run deploy

dev:
	cd frontend && bun run dev --host