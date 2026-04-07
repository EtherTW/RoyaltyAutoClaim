# UserOverrideableDKIMRegistry

This document explains how the [UserOverrideableDKIMRegistry](https://basescan.org/address/0x3D3935B3C030893f118a84C92C66dF1B9E4169d6) contract works and how our dapp (EmailVerifier) interacts with it to validate Gmail DKIM public keys.

## Overview

The `UserOverrideableDKIMRegistry` is a DKIM public key hash registry deployed by the [ZK Email](https://zk.email) team. It stores `hash(dkim_public_key)` records per domain and per authorizer. Unlike a simple registry where only the owner can update records, this contract supports a **dual-authorization model** that allows individual dapp operators (user authorizers) to manage their own public key records independently of the main authorizer.

Contract source: [`docs/UserOverrideableDKIMRegistry/UserOverrideableDKIMRegistry.sol`](./UserOverrideableDKIMRegistry/UserOverrideableDKIMRegistry.sol)

## Roles

### Main Authorizer

The `mainAuthorizer` is set by the contract owner (typically the ZK Email team). It manages the **shared pool** of public key records that are available to all users of the registry.

- Can set public key hashes for any domain, but records are subject to a **time delay** (`setTimestampDelay`) before they become fully valid on their own.
- Can revoke public key hashes unilaterally.
- Cannot reactivate a key it has revoked.

### User Authorizer

Any address that is not the `mainAuthorizer` can act as a user authorizer. Each user authorizer manages their own **scoped records** that only apply when validity is checked against their address.

- Can set public key hashes with **immediate** effect (no delay).
- Can revoke public key hashes for their own scope.
- Can **reactivate** a public key hash that was revoked only by the `mainAuthorizer` (this is the "user override" mechanism).

### Contract Owner

- Can change the `mainAuthorizer` address.
- Can upgrade the contract (UUPS proxy).
- Does **not** directly set or revoke public key records.

## How Validity Is Determined

When `isDKIMPublicKeyHashValid(domain, publicKeyHash, authorizer)` is called, the contract computes two thresholds:

### Set Threshold (must be >= 2 for valid)

| Condition | Points |
|---|---|
| `mainAuthorizer` approved AND delay has passed | +2 |
| `mainAuthorizer` approved AND delay has NOT passed | +1 |
| User authorizer approved | +2 |

### Revoke Threshold (must be 0 for valid)

| Condition | Points |
|---|---|
| `mainAuthorizer` revoked | +1 |
| User authorizer revoked | +2 |
| User reactivated (only cancels mainAuthorizer revoke) | -1 |

A public key hash is **valid** when set threshold >= 2 AND revoke threshold == 0.

### Practical Scenarios

| Scenario | Set Threshold | Valid? |
|---|---|---|
| Only `mainAuthorizer` approved, delay passed | 2 | Yes |
| Only `mainAuthorizer` approved, delay NOT passed | 1 | No |
| Only user authorizer approved | 2 | Yes |
| Both approved, delay NOT passed | 3 (1+2) | Yes |
| `mainAuthorizer` approved + revoked by `mainAuthorizer` | revoke=1 | No |
| Above + user reactivated | revoke=0 | Yes (if set >= 2) |
| User authorizer revoked | revoke=2 | No (cannot be reactivated) |

## How Our EmailVerifier Uses It

Our [`EmailVerifier`](../src/EmailVerifier.sol) contract calls the **two-argument** overload:

```solidity
dkimRegistry.isDKIMPublicKeyHashValid(DOMAIN, _proof.pubkeyHash())
```

This overload internally resolves the authorizer by calling `Ownable(msg.sender).owner()` on the calling contract. Since `EmailVerifier` inherits `Ownable`, the **owner of our EmailVerifier contract** becomes the user authorizer.

This means:
- Public key records set by the EmailVerifier's owner are **immediately valid** for our dapp.
- Public key records in the shared pool (set by `mainAuthorizer`) are also valid for our dapp once the delay passes.
- Other users' scoped records do not affect our dapp's validity checks.

## Handling Missing Public Key Records

When Gmail rotates its DKIM keys, the new public key hash may not yet be in the registry's shared pool. There are two ways to resolve this:

### Option 1: Ask the ZK Email Team

Request the ZK Email team to update the shared pool via the `mainAuthorizer`. This benefits all users of the registry, but:
- Requires coordination with the ZK Email team.
- The record is subject to `setTimestampDelay` before it's valid on its own.

### Option 2: Self-Authorize (Recommended for Immediate Unblocking)

The EmailVerifier owner can directly call `setDKIMPublicKeyHash` on the registry:

```
setDKIMPublicKeyHash("gmail.com", pubkeyHash, ownerAddress, "0x")
```

- The empty signature (`"0x"`) works because when `msg.sender == authorizer`, signature verification is skipped.
- The record takes effect **immediately** (no delay) for our dapp.
- The record is **scoped** to the EmailVerifier owner's address and does not affect other dapps.

### Trade-offs

| | Shared Pool (Option 1) | Self-Authorize (Option 2) |
|---|---|---|
| Benefits all users | Yes | No (scoped to our dapp) |
| Immediate effect | No (delay period) | Yes |
| Ongoing maintenance | ZK Email team handles it | Must track Gmail key rotations ourselves |
| Independence | Dependent on ZK Email team | Fully independent |

The recommended approach is to **do both**: self-authorize to unblock users immediately, and also request the ZK Email team to update the shared pool for the long term.

## Admin Tooling

Scripts are available under `frontend/scripts/` for managing DKIM public key records:

- **`check-dkim-registry.ts`** — Check if an email's DKIM public key hash exists in the registry (shared pool + user-scoped) with delay/pending status.
- **`set-dkim-pubkey.ts`** — Set a DKIM public key hash in the user-scoped record on the registry.

See the script headers for usage instructions.
