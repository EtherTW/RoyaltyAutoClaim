# RoyaltyAutoClaim

This is the v2 implementation. For v1, please see the [tag v1](https://github.com/EtherTW/RoyaltyAutoClaim/tree/v1)

- [[TEM] 去中心化領稿費機制實驗 1](https://hackmd.io/@nic619/SkZDIp2GJl)
- [[TEM] 去中心化領稿費機制實驗 2](https://hackmd.io/@nic619/ryKXwRXmge)

### Deployed Addresses

- v2 Base Mainnet: [0x3991CB2b0744AEDb8F985E0d1C74d8dAe6a30433](https://basescan.org/address/0x3991cb2b0744aedb8f985e0d1c74d8dae6a30433)
- v2 Base Sepolia: [0xEb6cD8eac109FDD4cD69AB43AAfFa50eD885FF65](https://sepolia.basescan.org/address/0xEb6cD8eac109FDD4cD69AB43AAfFa50eD885FF65#readProxyContract)
- v1 Mainnet: [0xf50b818138e3848C314783FA593fb39653FB0178](https://etherscan.io/address/0xf50b818138e3848C314783FA593fb39653FB0178)
- v1 Sepolia: [0x66ECf28b049f8b917C58B6e81a999CDF309283eA](https://sepolia.etherscan.io/address/0x66ECf28b049f8b917C58B6e81a999CDF309283eA)

### RPC Providers

This project uses Tenderly to fetch on-chain contract events because it has fewer limitations. Other RPC calls are handled via Alchemy.

For the ERC-4337 bundler:

- v1 uses Alchemy with Entrypoint v0.7
- v2 uses Pimlico with Entrypoint v0.8

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
 --broadcast --verify \
 --verifier-url https://api.etherscan.io/v2/api?chainid=8453
```

4. Verify contracts (if `--verify` was not used during deployment)

```bash
forge verify-contract <CONTRACT_ADDRESS> \
 --rpc-url https://mainnet.base.org \
 --etherscan-api-key $ETHERSCAN_API_KEY \
 --verifier-url https://api.etherscan.io/v2/api?chainid=8453
```

> Note: Basescan now uses the Etherscan V2 API. The `--verifier-url` must point to `https://api.etherscan.io/v2/api?chainid=8453` instead of the legacy `https://api.basescan.org/api`.

## Deploy the Email Verifier contract

1. Copy `.env.example` to `.env` and fill in:
    - `PRIVATE_KEY`
    - `ETHERSCAN_API_KEY`

2. Create `EmailVerifier.json`:

```json
{
	"dkimRegistry": "0x3D3935B3C030893f118a84C92C66dF1B9E4169d6",
	"emailFromAddress": "eth.taipei@gmail.com"
}
```

3. Deploy to Base

```bash
forge script script/deployEmailVerifier.s.sol \
 --rpc-url https://mainnet.base.org \
 --broadcast --verify \
 --verifier-url https://api.etherscan.io/v2/api?chainid=8453
```

## Check DKIM Registration

After deployment, verify that the email sender's DKIM public key hash is registered in the on-chain DKIMRegistry. Without this, ZK email proof verification will fail.

The `EMAIL` parameter refers to a `.eml` file (without extension) in the `emails/` directory. These are raw email files from the sender whose DKIM key needs to be registered. To use your own emails, download the `.eml` file from your email client and place it in `emails/`.

```bash
make check-dkim EMAIL=<email_filename>
```

If the key is not registered, set it. The `PRIVATE_KEY` in `.env` must belong to the **owner of the EmailVerifier contract**, as the registry scopes user-authorized records to that address (see [docs/dkim-registry.md](docs/dkim-registry.md) for details).

```bash
make set-dkim EMAIL=<email_filename> CHAIN=base
```

See the [DKIM Public Key Management](#dkim-public-key-management) section for more details.

## Development Flow

If the circuit code has been modified, we need to run the following scripts to verify that the functionality is working correctly.

circuits

```

cd circuits/title_hash
nargo compile

cd circuits
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

### Estimating verificationGasLimit (vgl)

The UserOp signature is a ZK proof, but the bundler's estimateGas runs with a
dummy proof, so verificationGasLimit must be pinned as a constant. The two
constants live in frontend/src/config.ts

Re-estimate whenever the circuit changes:

```
make estimate-vgl-base-sepolia EMAIL=test RAC=0xfDDbc7f5D726B20C0F89Aa44C5B03FC71cC035e8
make estimate-vgl-base EMAIL=test_prod RAC=0x3991CB2b0744AEDb8F985E0d1C74d8dAe6a30433
```

Then copy the printed verificationGasLimit into the matching constant.

### DKIM Public Key Management

For a detailed explanation of how the DKIMRegistry works and how our EmailVerifier interacts with it, see [docs/dkim-registry.md](docs/dkim-registry.md).

The `EMAIL` parameter refers to a `.eml` file (without extension) in the `emails/` directory. Download raw `.eml` files from your email client and place them there.

Check whether an email's DKIM public key hash is registered in the DKIMRegistry:

```
make check-dkim EMAIL=test4
```

Set a DKIM public key hash in the registry. The `PRIVATE_KEY` in `.env` must belong to the **owner of the EmailVerifier contract**:

```
make set-dkim EMAIL=test_prod
make set-dkim EMAIL=test_prod CHAIN=base
```

`CHAIN` defaults to `base-sepolia` if not provided. Valid values: `base-sepolia`, `base`.

## Contract Development

```
forge test
forge test --gas-report
```

When used with the VS Code extension `ryanluker.vscode-coverage-gutters`, running `Coverage Gutters: Display Coverage` lets you see which functions are not yet covered by tests on the RoyaltyAutoClaim.sol.

```
forge coverage --report lcov
```

Ensure the storage layout is empty to avoid storage collision during future upgrades

```
forge inspect ./src/RoyaltyAutoClaim.sol:RoyaltyAutoClaim storage
```

If `Error: failed to read artifact source file for...` appears, you need to clean and recompile

```
forge clean
```

### ZK Email Integration

- UserOverrideableDKIMRegistry: [0x3D3935B3C030893f118a84C92C66dF1B9E4169d6](https://basescan.org/address/0x3D3935B3C030893f118a84C92C66dF1B9E4169d6)
    - ZK Email [Deployed Contracts](https://docs.zk.email/account-recovery/deployed-contracts)
- Remember to use the correct version when compiling and generating proofs.
    ```
    Noir version: 1.0.0-beta.5+c651df6e2bf5db3966aa0c95abea2fc4c69d4513
    "@aztec/bb.js": "0.84.0",
    "@noir-lang/noir_js": "1.0.0-beta.5",
    ```
- The frontend scripts currently only implement the title_hash circuit.
- The integration is inspired by the design of [mintmarks.fun](https://github.com/trionlabs/mintmarks.fun)
- For the legacy Circom implementation, please refer to the [zkemail-circom tag](https://github.com/EtherTW/RoyaltyAutoClaim/tree/zkemail-circom).

### Semaphore Integration

- Semaphore: [0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D](https://basescan.org/address/0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D)
    - Semaphore [Deployed Contracts](https://docs.semaphore.pse.dev/deployed-contracts)

## Frontend Development

- If the contract has been updated, remember to run `forge build` before `bun run gen-types`
- Don’t use the alias @ in .ts files, because some scripts depend on functions from the src directory, and running those scripts directly won’t recognize @.
