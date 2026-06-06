# Email Operation Diagnostics

Tools for debugging failed email registrations / recipient updates (e.g. `TitleHashMismatch`,
`AA24 signature error`). For a worked end-to-end investigation using all of them, see
[incidents/2026-06-06-email-registration-failures](../incidents/2026-06-06-email-registration-failures/README.md).

All scripts take `<emailFileName>` (a file in `emails/`, without `.eml`), the RoyaltyAutoClaim
proxy address, and a chain id (`84532` Base Sepolia / `8453` Base), and run from `frontend/`.

## Decision guide

| Symptom | What to run |
|---|---|
| `TitleHashMismatch(title, hash)` | The title in callData and the raw subject bytes disagree — usually invisible Unicode (hair spaces, zero-width chars) in the title. Compare `keccak256` of both variants. The Email Generator sanitizes titles since 2026-06-06. |
| `AA24 signature error` | Work through the three scripts below, in order. |
| Estimation reverts with a decoded error (`InvalidDKIMPublicKey`, `AlreadyRegistered`, …) | The error names the failing precondition directly — fix that. |

## 1. `verify-email-proof.ts` — is the proof/circuit/verifier stack healthy?

```sh
bun run scripts/verify-email-proof.ts <emailFileName> <racAddress> <chainId>
```

Generates a proof locally and checks it against the **deployed** EmailVerifier via `eth_call`
(no bundler involved): raw `verify()`, full `verifyEmail()` (DKIM registry + fromAddress +
titleHash + proof), and a gas figure.

- `verify() == false` → proof/verifier mismatch (stale circuit artifact vs deployed verifier?)
- `verifyEmail()` reverts → the decoded error names the failing precondition
- both `true` → the ZK side is fine; the failure is in the 4337 layer → continue below

## 2. `check-userop-hash.ts` — does the locally computed userOpHash match the EntryPoint?

```sh
bun run scripts/check-userop-hash.ts <emailFileName> <racAddress> <chainId>
```

Builds the op exactly like the frontend (dummy proof → bundler estimation → predefined VGL) and
compares sendop's `op.hash()` with EntryPoint v0.8 `getUserOpHash`. A mismatch means every proof
bakes the wrong hash → guaranteed AA24.

## 3. `register.ts --vgl` — is the bundler rejecting a valid op for gas reasons?

```sh
bun run scripts/register.ts <emailFileName> <racAddress> <chainId> --vgl 4000000
```

Runs the real ERC-4337 registration with an overridden `verificationGasLimit`. If the default
VGL gets AA24 but a higher value lands, the op was valid and the bundler's send-time simulation
needed more headroom — bump `PREDEFINED_VGL_BASE(_SEPOLIA)` in `frontend/src/config.ts`
(see [vgl-estimation.md](./vgl-estimation.md)). As a bundler-independent fallback,
`register.ts <emailFileName> <racAddress> <chainId> --direct` registers via a plain EOA call
(`PRIVATE_KEY` env), with no userOpHash involved.

## Replaying a failed op from a user's console log

When a send fails, the frontend logs the full `handleOps` calldata to the browser console.
Have the user **right-click the logged hex string → "Copy string contents"** (Chrome's
"Save as…" truncates long strings) and save it to a file. From the blob you can decode the
exact op (the EP hash covers everything except `signature`), extract the proof + public inputs
from the signature, `eth_call verify()` on them in isolation, and replay `validateUserOp` on a
fork as the EntryPoint — see `test/DebugUserOpReplay.t.sol` for the pattern.
