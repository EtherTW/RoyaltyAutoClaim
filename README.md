# RoyaltyAutoClaim

This is the v2 implementation. For v1, please see the [tag v1](https://github.com/EtherTW/RoyaltyAutoClaim/tree/v1)

-   [[TEM] 去中心化領稿費機制實驗 1](https://hackmd.io/@nic619/SkZDIp2GJl)
-   [[TEM] 去中心化領稿費機制實驗 2](https://hackmd.io/@nic619/ryKXwRXmge)

### Deployed Addresses

-   v1 Mainnet: [0xf50b818138e3848C314783FA593fb39653FB0178](https://etherscan.io/address/0xf50b818138e3848C314783FA593fb39653FB0178)
-   v1 Sepolia: [0x66ECf28b049f8b917C58B6e81a999CDF309283eA](https://sepolia.etherscan.io/address/0x66ECf28b049f8b917C58B6e81a999CDF309283eA)

### RPC Providers

This project uses Tenderly to fetch on-chain contract events because it has fewer limitations. Other RPC calls are handled via Alchemy.

For the ERC-4337 bundler:

-   v1 uses Alchemy with Entrypoint v0.7
-   v2 uses Pimlico with Entrypoint v0.8

## Quick Start

The following steps will allow you to run this project’s frontend on localhost.

1. Clone the repository
2. Navigate to the frontend directory
3. Copy the .env file from frontend/.env.example to frontend/.env
4. Install dependencies by running `bun i`
5. Set up deployer private key in .env `VITE_TEST_PRIVATE_KEY`
6. Deploy contracts by running `bun run scripts/deploy.ts` or `bun run deploy`
7. Configure deployed contract address in .env `VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA`
8. Start the dev server by running `bun run dev`

## Deploy the production contracts

1. Copy `.env.example` to `.env` and fill in:

    - `PRIVATE_KEY`
    - `ETHERSCAN_API_KEY`

2. Create `RoyaltyAutoClaim.json`:

```json
{
	"owner": "",
	"admin": "",
	"token": "",
	"dkimRegistry": "0x3D3935B3C030893f118a84C92C66dF1B9E4169d6",
	"emailFromAddress": "eth.taipei@gmail.com",
	"semaphore": "0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D"
}
```

3. Deploy to Base

```bash
forge script script/deployRoyaltyAutoClaim.s.sol \
 --rpc-url https://mainnet.base.org \
 --broadcast --verify
```

## Development Flow

If the circuit code has been modified, we need to run the following scripts to verify that the functionality is working correctly.

circuits

```

cd circuits/title_hash
nargo compile
bun run script/genProofTitleHash.ts ../emails/registration.eml
bun run script/genVerifier.ts title_hash

```

contract

```

forge build
forge test
forge fmt

```

frontend

```

make gen-types
make deploy
make prepare-circuit

cd frontend
bun run scripts/gen-proof.ts <EMAIL_FILENAME> <EMAIL_VERIFIER_ADDRESS>
bun run scripts/register.ts <EMAIL_FILENAME> <RAC_ADDRESS>
bun run scripts/update-recipient.ts test-update 0x43024C2e168E4554d71A93e1F8d1a083f8e6624E

(Update frontend .env for VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA)
bun run dev

```

## Contract Development

```

forge test
forge coverage
forge coverage --report lcov
forge test --gas-report

```

-   Ensure the storage layout is empty to avoid storage collision during future upgrades

```

forge inspect ./src/RoyaltyAutoClaim.sol:RoyaltyAutoClaim storage

```

-   If `Error: failed to read artifact source file for...` appears, you need to clean and recompile

```

forge clean

```

### ZK Email Integration

-   UserOverrideableDKIMRegistry: [0x3D3935B3C030893f118a84C92C66dF1B9E4169d6](https://basescan.org/address/0x3D3935B3C030893f118a84C92C66dF1B9E4169d6)
    -   ZK Email [Deployed Contracts](https://docs.zk.email/account-recovery/deployed-contracts)
-   Remember to use the correct version when compiling and generating proofs.
    ```
    Noir version: 1.0.0-beta.5+c651df6e2bf5db3966aa0c95abea2fc4c69d4513
    "@aztec/bb.js": "0.84.0",
    "@noir-lang/noir_js": "1.0.0-beta.5",
    ```
-   The frontend scripts currently only implement the title_hash circuit.
-   The integration is inspired by the design of [mintmarks.fun](https://github.com/trionlabs/mintmarks.fun)
-   For the legacy Circom implementation, please refer to the [zkemail-circom tag](https://github.com/EtherTW/RoyaltyAutoClaim/tree/zkemail-circom).

### Semaphore Integration

-   Semaphore: [0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D](https://basescan.org/address/0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D)
    -   Semaphore [Deployed Contracts](https://docs.semaphore.pse.dev/deployed-contracts)

## Frontend Development

-   If the contract has been updated, remember to run `forge build` before `bun run gen-types`
-   Don’t use the alias @ in .ts files, because some scripts depend on functions from the src directory, and running those scripts directly won’t recognize @.
