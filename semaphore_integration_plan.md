# Semaphore Integration Plan for RoyaltyAutoClaim

## Architecture Overview

-   **Replace** address-based reviews entirely with Semaphore anonymous proofs
-   **Support** both direct calls and ERC-4337 UserOperations
-   **Admin-managed** on-chain Semaphore group for reviewer identity commitments
-   **Per-submission scope** to prevent double reviews (hash of submission title)

## Phase 9: Testing & Deployment Considerations

### 9.1 Contract changes require:

1. **New deployment** - Storage layout has changed, cannot upgrade existing contracts
2. **Migration script** - Existing reviewers need to:
    - Generate Semaphore identities (using `@semaphore-protocol/identity`)
    - Share identity commitments with admin
    - Securely store their identity secrets
3. **Updated frontend** to:
    - Generate Semaphore proofs using `@semaphore-protocol/proof`
    - Fetch group members from contract or subgraph
    - Build Merkle tree off-chain for proof generation
    - Download circuit artifacts (semaphore.wasm, semaphore.zkey)

### 9.2 Gas optimization notes:

-   Semaphore proof verification: ~300-500k gas (much higher than address checks)
-   Group updates trigger Merkle tree recalculations
-   Consider batching reviewer additions during initialization
-   May want to implement root history for grace period on group updates

### 9.3 Circuit artifacts:

Semaphore proofs require trusted setup files:

-   `semaphore.wasm` - Circuit WASM for witness generation
-   `semaphore.zkey` - Proving key for proof generation

These can be:

-   Downloaded automatically by `@semaphore-protocol/proof` (default)
-   Hosted on your CDN for faster loading
-   Retrieved from https://github.com/privacy-scaling-explorations/snark-artifacts

### 9.4 Security considerations:

1. **Identity management**: Reviewers must securely store their Semaphore identity secrets
2. **Nullifier tracking**: Ensure nullifiers are bound to both submission and group context
3. **Signal integrity**: Hash (title, royaltyLevel) as signal to prevent proof reuse
4. **Scope design**: Use `keccak256(groupId, title)` to isolate reviews per submission
5. **Root validity**: Consider implementing root history with expiry for group updates

---

## Phase 10: Frontend Integration Requirements

### 10.1 Install Semaphore libraries:

```bash
npm install @semaphore-protocol/identity @semaphore-protocol/group @semaphore-protocol/proof
```

### 10.2 Reviewer identity creation:

```typescript
import { Identity } from '@semaphore-protocol/identity'

// Generate new identity for reviewer
const identity = new Identity()

// Get commitment to share with contract admin
const commitment = identity.commitment

// Securely store identity (localStorage, encrypted storage, etc.)
localStorage.setItem('semaphore-identity', identity.toString())
```

### 10.3 Generating a review proof:

```typescript
import { Identity } from '@semaphore-protocol/identity'
import { Group } from '@semaphore-protocol/group'
import { generateProof } from '@semaphore-protocol/proof'

// Restore reviewer identity
const identity = new Identity(localStorage.getItem('semaphore-identity'))

// Fetch group members from contract or subgraph
const groupMembers = await fetchGroupMembers(reviewerGroupId)
const group = new Group(groupMembers)

// Create signal (hash of title and royalty level)
const signal = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['string', 'uint16'], [title, royaltyLevel]))

// Create scope (hash of groupId and title)
const scope = ethers.utils.keccak256(
	ethers.utils.defaultAbiCoder.encode(['uint256', 'string'], [reviewerGroupId, title]),
)

// Generate proof
const fullProof = await generateProof(identity, group, signal, scope)

// Extract components for contract call
const { merkleTreeRoot, nullifierHash, proof } = fullProof.publicSignals

// Call contract
await contract.reviewSubmission(title, royaltyLevel, merkleTreeRoot, nullifierHash, proof)
```

### 10.4 ERC-4337 UserOperation construction:

```typescript
// The proof needs to be encoded in the callData
const callData = contract.interface.encodeFunctionData('reviewSubmission', [
	title,
	royaltyLevel,
	merkleTreeRoot,
	nullifierHash,
	proof, // uint256[8]
])

// UserOp signature can be minimal since proof validates identity
const userOp = {
	sender: accountAddress,
	callData,
	signature: '0x', // Empty or minimal signature
	// ... other UserOp fields
}
```

## Additional Resources

-   **Semaphore Documentation**: https://docs.semaphore.pse.dev/
-   **Semaphore Contracts**: https://github.com/semaphore-protocol/semaphore/tree/main/packages/contracts
-   **Circuit Artifacts**: https://github.com/privacy-scaling-explorations/snark-artifacts
-   **Example Integration**: See Semaphore Greeter contract in docs for reference implementation
