# 2026-06-06 — Email registration failures (TitleHashMismatch + spurious AA24)

## Summary

A user could not register the submission **「原生抽象帳戶: EIP-8141 Frame Transaction - part II by Kimi」**
on Base mainnet through the dapp. Three attempts failed — two with `TitleHashMismatch`, one with
`AA24 signature error`. Investigation found **three distinct bugs**. The submission was ultimately
registered via the normal ERC-4337 flow with `verificationGasLimit = 4M`:
[tx `0x5ecbbc764f0a8adc9dd1e89c6a23f91057f394924f7dfb8aa4b736cbe67b66b7`](https://basescan.org/tx/0x5ecbbc764f0a8adc9dd1e89c6a23f91057f394924f7dfb8aa4b736cbe67b66b7).

Deployment context: RoyaltyAutoClaim proxy `0x3991CB2b0744AEDb8F985E0d1C74d8dAe6a30433`,
EmailVerifier `0x5fAa05A2ae66B43Dd10a8480352ef1E5b4f66815`, EntryPoint v0.8, bundler Pimlico.

---

## Bug 1 — Invisible U+200A hair spaces in the title → `TitleHashMismatch`

The submission title was copied from Medium, which typographically wraps dashes in
**U+200A HAIR SPACE** characters: `Transaction - part`. Two code paths disagreed on the
title bytes:

- The **circuit** hashes the raw subject bytes (hair spaces included) → `proof.titleHash`
- **`parseEmail`** (frontend/src/lib/circuit-utils.ts) normalizes the decoded subject with
  `replace(/\s+/g, ' ')` — JS `\s` matches U+200A — so the title placed in callData had plain spaces

`keccak256(callData title) != proof.titleHash` → `EmailVerifier` reverts `TitleHashMismatch` (AA23,
decoded in the UI toast). Verified by recomputing keccak over both byte variants — they reproduce the
two on-chain hashes from the failed attempts exactly (`0x293b4faf…`, `0x4cbdd7ec…`).

The full-width colon `：` in attempt 1 was a red herring — both paths preserve it identically.

**Fix:** `EmailGeneratorCard.vue` now sanitizes titles (strip zero-width chars, collapse all Unicode
whitespace to plain spaces) before building the subject, the `ID:` keccak, and validation.

## Bug 2 — Pimlico rejects a valid UserOperation with AA24 at VGL 3.2M

After the title was fixed (attempt 3), registration failed with
`UserOperation reverted with reason: AA24 signature error` at `eth_sendUserOperation`. Every layer
was proven correct (see Evidence):

- The user's exact proof bytes verify `true` on the deployed verifier (`verify()` and `verifyEmail()`)
- The proof's baked userOpHash equals EntryPoint v0.8 `getUserOpHash` for the exact op
- A faithful-EVM fork replay of `validateUserOp` with the exact op, VGL 3.2M and realistic
  `missingAccountFunds` returns `0` (success); measured minimum ≈ 3,007,812 gas
- Resending the user's **exact op** from a clean environment reproduced AA24 at VGL 3,200,000
- The identical flow with VGL 4,000,000 (fresh proof for the new hash) was **accepted and landed**;
  the included `handleOps` tx consumed 3,448,493 gas total

Conclusion: **Pimlico's send-time validation simulation requires substantially more headroom than the
faithful-EVM minimum** — it rejected a provably valid op at 3.2M. Not a contract, frontend, circuit,
DKIM, or user-environment issue. (Earlier theories ruled out by evidence: stale cached circuit —
the user's proofs share all prover-constant limbs with locally generated ones; unregistered Gmail
DKIM key — same registered `pubkey_hash` as passing proofs, and a bad key reverts as AA23, not AA24.)

**Fixes:**
- `PREDEFINED_VGL_BASE` raised 3.2M → 4M (frontend/src/config.ts)
- The email flow in `useContractCallV2.ts` now retries once with `PREDEFINED_VGL + 1M` on AA24
  (regenerating the proof, since the userOpHash commits to the gas limits)

## Bug 3 — `estimate-verificationGasLimit.ts` reports a misleading number

`validateUserOp` deliberately checks the userOpHash **last**, and `EmailVerifier` wraps `verify()` in
`try/catch` (OOG → `return false`). Consequence: during the bundler's binary search, "verify ran out
of gas" and "verify succeeded but the hash check failed" are the same terminal state
(`SIG_VALIDATION_FAILED`), so the search can settle on the cheap OOG path. Observed on Base:
raw estimate **1,327,210** with a real proof — identical to the dummy-proof estimate and far below
the real ~3.0M verify cost. Following the doc's "1.5×" rule (→ 1.99M) would have made every
registration fail.

**Fixes:**
- The script now also bisects the faithful-EVM minimum via `eth_call` of `validateUserOp` (as the
  EntryPoint, success = return value 0) and recommends 1.4× of the max of both numbers
- `docs/vgl-estimation.md` warns about the failure mode and requires confirming any new VGL with a
  real send

---

## Evidence / artifacts

| File | What it is |
|---|---|
| [`artifacts/failed-userop-vgl3.2m-handleops.hex`](./artifacts/failed-userop-vgl3.2m-handleops.hex) | Full `handleOps` calldata of the user's failed attempt (nonce key `0x5698f7c2589ef093`, VGL 3.2M). Resending this exact op reproduced AA24; its proof verifies `true` on-chain. |
| [`artifacts/failed-attempt-console.log`](./artifacts/failed-attempt-console.log) | User's browser console log of the failed attempt (Chrome 148/macOS) |
| [`artifacts/user-proof.hex`](./artifacts/user-proof.hex) / [`artifacts/user-publicinputs.json`](./artifacts/user-publicinputs.json) | Proof + public inputs extracted from the failed op — `verify()` returns `true` on `EmailVerifier@0x5fAa…6815` |
| [`artifacts/user-op-signature.hex`](./artifacts/user-op-signature.hex) | ABI-encoded `(proof, publicInputs)` signature blob of the failed op, used by the replay test |
| [`artifacts/email3-proof-signature.hex`](./artifacts/email3-proof-signature.hex) | Locally generated known-good proof for the same email (default userOpHash) |
| [`test/DebugUserOpReplay.t.sol`](../../test/DebugUserOpReplay.t.sol) | Fork test: the user's exact op passes `validateUserOp` at VGL 3.2M (`validationData == 0`) |
| [`test/DebugEmail3VGL.t.sol`](../../test/DebugEmail3VGL.t.sol) | Fork test: VGL bisection (`minimum ≈ 3,007,812`) |
| [`emails/debug-email3.eml`](../../emails/debug-email3.eml) | The registration email (attempt 3) |

Key on-chain references:

- Failed op baked userOpHash == EP hash: `0x7fc5fece3f13e7934754130bcaaa01afd978d46e5d9f84128a7c188bc8b99647`
- Successful registration: [`0x5ecbbc76…66b7`](https://basescan.org/tx/0x5ecbbc764f0a8adc9dd1e89c6a23f91057f394924f7dfb8aa4b736cbe67b66b7) (block 46967486, VGL 4M)
- DKIM `pubkey_hash` (valid in registry): `0x280b10886d6d3cb6a9f870d942996b420bbfc51e3bd1f430e18690a6859b6d8f`

Run the fork replays (pin to a block before the registration at 46967486, otherwise
`_verifyRegistration` reverts with `AlreadyRegistered`):

```sh
forge test --match-contract "DebugUserOpReplay|DebugEmail3VGL" \
    --fork-url https://mainnet.base.org --fork-block-number 46967000 -vv
```

## Follow-ups

- [ ] Deploy the frontend changes (push to `main` → GH Pages)
- [ ] Consider content-hashing `/RoyaltyAutoClaim/title_hash.json` and `/wasm/*.wasm` (defense in depth; not the cause here)
- [ ] Re-estimate VGL with the improved script next time the circuit changes, and confirm with a real send
