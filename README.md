# RoyaltyAutoClaim

A decentralized royalty distribution system where authors prove content authorship via ZK email verification and claim payouts on-chain. Reviewers vote anonymously using Semaphore, and all user operations are gasless via ERC-4337 account abstraction.

This is the v2 implementation. For v1, see the [v1 tag](https://github.com/EtherTW/RoyaltyAutoClaim/tree/v1).

- [[TEM] 去中心化領稿費機制實驗 1](https://hackmd.io/@nic619/SkZDIp2GJl)
- [[TEM] 去中心化領稿費機制實驗 2](https://hackmd.io/@nic619/ryKXwRXmge)

## Deployed Addresses

v2 is deployed on Base, which is where the [DKIM Registry](https://basescan.org/address/0x3D3935B3C030893f118a84C92C66dF1B9E4169d6) (maintained by ZK Email team) and [Semaphore](https://basescan.org/address/0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D) are available.

| Version | Network | Address |
|---|---|---|
| v2 | Base | [0x3991CB2b0744AEDb8F985E0d1C74d8dAe6a30433](https://basescan.org/address/0x3991cb2b0744aedb8f985e0d1c74d8dae6a30433) |
| v2 | Base Sepolia | [0xEb6cD8eac109FDD4cD69AB43AAfFa50eD885FF65](https://sepolia.basescan.org/address/0xEb6cD8eac109FDD4cD69AB43AAfFa50eD885FF65#readProxyContract) |
| v1 | Ethereum | [0xf50b818138e3848C314783FA593fb39653FB0178](https://etherscan.io/address/0xf50b818138e3848C314783FA593fb39653FB0178) |
| v1 | Sepolia | [0x66ECf28b049f8b917C58B6e81a999CDF309283eA](https://sepolia.etherscan.io/address/0x66ECf28b049f8b917C58B6e81a999CDF309283eA) |

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Foundry](https://book.getfoundry.sh/getting-started/installation) | latest | Smart contract toolchain |
| [Bun](https://bun.sh/) | latest | Frontend and script runner |
| [Noir](https://noir-lang.org/docs/getting_started/quick_start) | 1.0.0-beta.5 | ZK circuit compiler |
| [@aztec/bb.js](https://www.npmjs.com/package/@aztec/bb.js) | 0.84.0 | HONK proving backend |

## Quick Start

Run the frontend locally (defaults to Base Sepolia in dev mode, but works with any supported network as long as you provide the proxy contract address and required API keys):

```bash
# 1. Clone and install
git clone --recurse-submodules https://github.com/EtherTW/RoyaltyAutoClaim.git
cd RoyaltyAutoClaim

# 2. Build contracts and generate TypeScript bindings
make build

# 3. Set up frontend environment
cp frontend/.env.example frontend/.env
# Fill in API keys (see frontend/.env.example for descriptions):
#   VITE_ALCHEMY_API_KEY      — RPC provider
#   VITE_PIMLICO_API_KEY      — ERC-4337 bundler
#   VITE_TENDERLY_*_API_KEY   — event fetching (optional)

# 4. Deploy contracts to Base Sepolia (requires VITE_TEST_PRIVATE_KEY in frontend/.env)
make deploy

# 5. Update frontend/.env with the deployed proxy address
#   VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA=<proxy-address>

# 6. Prepare circuit artifacts for the frontend
make prepare-circuit

# 7. Start the dev server
make dev
```

## Production Deployment

See [docs/deployment.md](docs/deployment.md) for the full guide covering:
- Deploying contracts to Base mainnet
- Contract verification on Basescan
- DKIM public key registration
- Frontend configuration

## Development

### Circuits

When the circuit code changes, recompile and regenerate artifacts:

```bash
cd circuits/title_hash
nargo compile

cd ../..
cd circuits
bun run script/genProofTitleHash.ts ../emails/test.eml
bun run script/genVerifier.ts title_hash
```

The frontend currently only implements the `title_hash` circuit.

### Contracts

```bash
forge build
forge test
forge fmt
```

If the contract has been updated, regenerate TypeScript bindings:

```bash
make build    # runs forge build + bun run gen-types
```

See [Contract Development](#contract-development) for more commands.

### Frontend

```bash
cd frontend
bun i
bun run dev
```

Useful scripts (run from the `frontend/` directory):

```bash
bun run scripts/gen-proof.ts <EMAIL_FILENAME> <EMAIL_VERIFIER_ADDRESS>
bun run scripts/register.ts <EMAIL_FILENAME> <RAC_ADDRESS>
bun run scripts/update-recipient.ts <EMAIL_FILENAME> <RECIPIENT_ADDRESS>
```

Notes:
- Don't use the `@` alias in `.ts` files — scripts that run outside Vite won't resolve it.
- Run `forge build` before `bun run gen-types` when contracts change.

## Contract Development

```bash
forge test                  # run tests
forge test --gas-report     # with gas report
forge coverage --report lcov  # coverage (use with vscode-coverage-gutters)
```

Ensure the storage layout is empty to avoid storage collision during future upgrades:

```bash
forge inspect ./src/RoyaltyAutoClaim.sol:RoyaltyAutoClaim storage
```

If `Error: failed to read artifact source file for...` appears, clean and recompile:

```bash
forge clean
```

### Estimating verificationGasLimit

The UserOp signature is a ZK proof, but the bundler's `estimateGas` runs with a dummy proof, so `verificationGasLimit` must be pinned as a constant in `frontend/src/config.ts`.

Re-estimate whenever the circuit changes:

```bash
make estimate-vgl-base-sepolia EMAIL=test RAC=0xfDDbc7f5D726B20C0F89Aa44C5B03FC71cC035e8
make estimate-vgl-base EMAIL=test_prod RAC=0x3991CB2b0744AEDb8F985E0d1C74d8dAe6a30433
```

### DKIM Public Key Management

For a detailed explanation of how the DKIMRegistry works and how our EmailVerifier interacts with it, see [docs/dkim-registry.md](docs/dkim-registry.md).

The `EMAIL` parameter refers to a `.eml` file (without extension) in the `emails/` directory. Download raw `.eml` files from your email client and place them there.

Check whether an email's DKIM public key hash is registered:

```bash
make check-dkim EMAIL=test4
```

Set a DKIM public key hash. The `PRIVATE_KEY` in `.env` must belong to the **owner of the EmailVerifier contract**:

```bash
make set-dkim EMAIL=test_prod
make set-dkim EMAIL=test_prod CHAIN=base
```

`CHAIN` defaults to `base-sepolia` if not provided. Valid values: `base-sepolia`, `base`.

## Architecture

### ZK Email Integration

- [UserOverrideableDKIMRegistry](https://basescan.org/address/0x3D3935B3C030893f118a84C92C66dF1B9E4169d6) — ZK Email [Deployed Contracts](https://docs.zk.email/account-recovery/deployed-contracts)
- Circuits use Noir + UltraHonk proving system (see [Prerequisites](#prerequisites) for required versions)
- Inspired by [mintmarks.fun](https://github.com/trionlabs/mintmarks.fun)
- For the legacy Circom implementation, see the [zkemail-circom tag](https://github.com/EtherTW/RoyaltyAutoClaim/tree/zkemail-circom)

### Semaphore Integration

- [Semaphore](https://basescan.org/address/0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D) — Semaphore [Deployed Contracts](https://docs.semaphore.pse.dev/deployed-contracts)
- Used for anonymous reviewer voting via zero-knowledge group membership proofs

### RPC Providers

- **Alchemy** — primary RPC for all networks
- **Tenderly** — fetching on-chain contract events (fewer limitations than standard RPC)
- **ERC-4337 bundler**: v1 uses Alchemy (Entrypoint v0.7), v2 uses Pimlico (Entrypoint v0.8)
