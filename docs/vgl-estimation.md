# verificationGasLimit (VGL) Estimation

## What is predefined VGL?

When the real UserOp signature is a ZK proof, the bundler's `estimateGas` sees a dummy proof, so we override `verificationGasLimit` with a predefined value. Re-estimate and update whenever the circuit changes.

## AA24 signature error caused by tight VGL

If `PREDEFINED_VGL_BASE` or `PREDEFINED_VGL_BASE_SEPOLIA` in `frontend/src/config.ts` is set too low, the registration (or recipient update) will fail with:

```
ERC4337Error: UserOperation reverted with reason: AA24 signature error
```

This is misleading — it looks like a signature mismatch, but the root cause is the ZK proof verification running out of gas.

## Why AA24 instead of AA23 (out of gas)?

In `EmailVerifier.sol`, the proof verification uses `try/catch`:

```solidity
try this.verify(_proof.proof, _proof.publicInputs) returns (bool success) {
    return success;
} catch {
    return false;
}
```

When `this.verify()` reverts due to out-of-gas, the `catch` block returns `false` instead of propagating the revert. This causes `validateUserOp` to return `SIG_VALIDATION_FAILED` (1), which the EntryPoint reports as **AA24** (signature error) rather than **AA23** (validation revert).

## How to estimate VGL

Run the estimation script with a real ZK proof:

```sh
# Base Sepolia (chainId 84532)
make estimate-vgl-base-sepolia EMAIL=<emailFileName> RAC=<racAddress>

# Base (chainId 8453)
make estimate-vgl-base EMAIL=<emailFileName> RAC=<racAddress>
```

The script outputs both the raw bundler estimate and a 1.5x buffered value. **Always use the 1.5x value**.

## Base estimation

| Raw estimate | 1.5x buffered | Result |
|---|---|---|
| 2,078,676 | 3,118,014 | Use ~3,200,000 |

Update the corresponding constant in `frontend/src/config.ts`