# Production Deployment

This guide covers deploying the RoyaltyAutoClaim contracts to Base mainnet (or Base Sepolia for testing).

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- A funded deployer wallet on Base
- An [Etherscan API key](https://docs.etherscan.io/) for contract verification (supports V2 multichain)

## Environment Setup

1. Copy `.env.example` to `.env` at the project root and fill in:

    - `PRIVATE_KEY` — deployer wallet private key
    - `ETHERSCAN_API_KEY` — for contract verification on Basescan

2. Create `RoyaltyAutoClaim.json` at the project root:

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

| Field | Description |
|---|---|
| `owner` | Contract owner. Can upgrade the proxy, transfer ownership, change admin, change royalty token, and emergency withdraw. Also acts as the user authorizer for the DKIM registry (see [docs/dkim-registry.md](dkim-registry.md)). |
| `admin` | Registers content submissions on behalf of authors. |
| `token` | ERC-20 token address used for royalty payouts. |
| `dkimRegistry` | [UserOverrideableDKIMRegistry](https://basescan.org/address/0x3D3935B3C030893f118a84C92C66dF1B9E4169d6) deployed by the ZK Email team. See [docs/dkim-registry.md](dkim-registry.md). |
| `emailFromAddress` | The email sender address used for verification (hashed in the contract). |
| `semaphore` | [Semaphore](https://basescan.org/address/0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D) contract for anonymous reviewer voting. |

## Deploy RoyaltyAutoClaim

This deploys three contracts in one batch: `EmailVerifier`, `RoyaltyAutoClaim` (implementation), and `RoyaltyAutoClaimProxy` (the address users interact with).

```bash
source .env

forge script script/deployRoyaltyAutoClaim.s.sol \
 --rpc-url https://mainnet.base.org \
 --broadcast --verify \
 --verifier-url https://api.etherscan.io/v2/api?chainid=8453
```

For Base Sepolia, change the `chainid` parameter to `84532`:

```bash
forge script script/deployRoyaltyAutoClaim.s.sol \
 --rpc-url https://sepolia.base.org \
 --broadcast --verify \
 --verifier-url https://api.etherscan.io/v2/api?chainid=84532
```

Omit `--broadcast` for a dry run.

> Note: Basescan uses the Etherscan V2 API. The `--verifier-url` must point to `https://api.etherscan.io/v2/api?chainid=<CHAIN_ID>` instead of the legacy `https://api.basescan.org/api`.

## Deploy EmailVerifier Only

Use this when you need to redeploy the EmailVerifier independently (e.g., after a circuit change) without redeploying the full contract suite.

1. Create `EmailVerifier.json` at the project root:

```json
{
    "dkimRegistry": "0x3D3935B3C030893f118a84C92C66dF1B9E4169d6",
    "emailFromAddress": "eth.taipei@gmail.com"
}
```

2. Deploy:

```bash
forge script script/deployEmailVerifier.s.sol \
 --rpc-url https://mainnet.base.org \
 --broadcast --verify \
 --verifier-url https://api.etherscan.io/v2/api?chainid=8453
```

3. Update the EmailVerifier address in the RoyaltyAutoClaim contract. The **admin** must call `updateEmailVerifier` on the proxy with the new EmailVerifier address:

```solidity
RoyaltyAutoClaim(proxy).updateEmailVerifier(newEmailVerifierAddress)
```

## Contract Verification

If `--verify` was not used during deployment, verify manually:

```bash
forge verify-contract <CONTRACT_ADDRESS> \
 --rpc-url https://mainnet.base.org \
 --etherscan-api-key $ETHERSCAN_API_KEY \
 --verifier-url https://api.etherscan.io/v2/api?chainid=8453
```

## Post-Deployment: DKIM Registration

After deployment, the email sender's DKIM public key hash must be registered in the on-chain DKIMRegistry. Without this, ZK email proof verification will fail.

The DKIM public key hashes in the shared registry pool are maintained by the ZK Email team, but it can happen that new hashes are not yet registered (e.g., after a Gmail key rotation). In that case, the EmailVerifier owner can self-authorize immediately. See the [Handling Missing Public Key Records](dkim-registry.md#handling-missing-public-key-records) section in `docs/dkim-registry.md` for details.

The `EMAIL` parameter refers to a `.eml` file (without extension) in the `emails/` directory. Download the raw `.eml` file from your email client and place it there.

1. Check if the key is already registered:

```bash
make check-dkim EMAIL=<email_filename>
```

2. If not registered, set it. The `PRIVATE_KEY` in `.env` must belong to the **owner of the EmailVerifier contract**, as the registry scopes user-authorized records to that address.

```bash
make set-dkim EMAIL=<email_filename> CHAIN=base
```

`CHAIN` defaults to `base-sepolia` if not provided. Valid values: `base-sepolia`, `base`.

For a detailed explanation of how the DKIMRegistry works and how our EmailVerifier interacts with it, see [docs/dkim-registry.md](dkim-registry.md).

## Post-Deployment: Frontend Configuration

Update your frontend `.env` with the deployed proxy address:

```
VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE=<proxy-address>
```
