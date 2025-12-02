# Semaphore Integration Plan for RoyaltyAutoClaim

## Architecture Overview

- **Replace** address-based reviews entirely with Semaphore anonymous proofs
- **Support** both direct calls and ERC-4337 UserOperations
- **Admin-managed** on-chain Semaphore group for reviewer identity commitments
- **Per-submission scope** to prevent double reviews (hash of submission title)

---

## Phase 1: Dependencies & Interfaces

### 1.1 Install Semaphore contracts package
- Add `@semaphore-protocol/contracts` to dependencies
- Verify compatible Solidity version (0.8.30)

### 1.2 Add ISemaphore interface import
```solidity
import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
```

---

## Phase 2: Storage Structure Changes

### 2.1 Modify `Configs` struct (Lines 86-93)

**REMOVE:**
```solidity
mapping(address => bool) reviewers;
```

**ADD:**
```solidity
ISemaphore semaphore;           // Semaphore verifier contract reference
uint256 reviewerGroupId;        // Semaphore group ID for authorized reviewers
```

### 2.2 Modify `MainStorage` struct (Lines 107-112)

**REMOVE:**
```solidity
mapping(string => mapping(address => bool)) hasReviewed;
```

**ADD:**
```solidity
mapping(string => mapping(uint256 => bool)) nullifierUsed;  // Track nullifiers per submission
```

### 2.3 Update transient storage constants

**REMOVE:**
```solidity
uint256 private constant TRANSIENT_SIGNER_SLOT = ...;
```

**ADD:**
```solidity
uint256 private constant TRANSIENT_NULLIFIER_SLOT = ...;  // Store nullifierHash instead of address
```

---

## Phase 3: Core Review Function Changes

### 3.1 Replace `reviewSubmission()` function signature (Line 365)

**OLD:**
```solidity
function reviewSubmission(string memory title, uint16 royaltyLevel) public
```

**NEW:**
```solidity
function reviewSubmission(
    string memory title,
    uint16 royaltyLevel,
    uint256 merkleTreeRoot,
    uint256 nullifierHash,
    uint256[8] calldata proof
) public
```

### 3.2 Remove obsolete functions

- `updateReviewers(address[], bool[])` (Lines 250-259) - No longer needed
- `isReviewer(address)` (Lines 567-569) - No longer needed
- `_getUserOpSigner()` (Lines 532-543) - Replace with `_getUserOpNullifier()`

### 3.3 Add new reviewer management functions

```solidity
function addReviewerToGroup(uint256 identityCommitment) external onlyAdminOrEntryPoint {
    _getMainStorage().configs.semaphore.addMember(
        _getMainStorage().configs.reviewerGroupId,
        identityCommitment
    );
    emit ReviewerAdded(identityCommitment);
}

function removeReviewerFromGroup(
    uint256 identityCommitment,
    uint256[] calldata proofSiblings
) external onlyAdminOrEntryPoint {
    _getMainStorage().configs.semaphore.removeMember(
        _getMainStorage().configs.reviewerGroupId,
        identityCommitment,
        proofSiblings
    );
    emit ReviewerRemoved(identityCommitment);
}

function updateReviewerInGroup(
    uint256 oldCommitment,
    uint256 newCommitment,
    uint256[] calldata proofSiblings
) external onlyAdminOrEntryPoint {
    _getMainStorage().configs.semaphore.updateMember(
        _getMainStorage().configs.reviewerGroupId,
        oldCommitment,
        newCommitment,
        proofSiblings
    );
    emit ReviewerUpdated(oldCommitment, newCommitment);
}
```

---

## Phase 4: Validation Logic Updates

### 4.1 Replace `_requireReviewable()` logic (Lines 374-383)

**OLD:**
```solidity
function _requireReviewable(string memory title, uint16 royaltyLevel, address caller) internal view {
    require(isReviewer(caller), Unauthorized(caller));
    require(submissions(title).status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());
    require(
        royaltyLevel == ROYALTY_LEVEL_20 || royaltyLevel == ROYALTY_LEVEL_40 ||
        royaltyLevel == ROYALTY_LEVEL_60 || royaltyLevel == ROYALTY_LEVEL_80,
        InvalidRoyaltyLevel(royaltyLevel)
    );
    require(!hasReviewed(title, caller), AlreadyReviewed());
}
```

**NEW:**
```solidity
function _requireReviewable(
    string memory title,
    uint16 royaltyLevel,
    uint256 merkleTreeRoot,
    uint256 nullifierHash,
    uint256[8] calldata proof
) internal view {
    MainStorage storage $ = _getMainStorage();

    // Check submission status
    require($.submissions[title].status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());

    // Validate royalty level
    require(
        royaltyLevel == ROYALTY_LEVEL_20 || royaltyLevel == ROYALTY_LEVEL_40 ||
        royaltyLevel == ROYALTY_LEVEL_60 || royaltyLevel == ROYALTY_LEVEL_80,
        InvalidRoyaltyLevel(royaltyLevel)
    );

    // Check nullifier hasn't been used for this submission
    require(!$.nullifierUsed[title][nullifierHash], NullifierAlreadyUsed());

    // Compute the scope (externalNullifier) for this submission
    uint256 scope = uint256(keccak256(abi.encodePacked($.configs.reviewerGroupId, title)));

    // Verify Semaphore proof
    // Note: The signal should be hash of (title, royaltyLevel) to bind the vote
    uint256 signal = uint256(keccak256(abi.encodePacked(title, royaltyLevel)));

    $.configs.semaphore.verifyProof(
        $.configs.reviewerGroupId,
        merkleTreeRoot,
        signal,
        nullifierHash,
        scope,
        proof
    );
}
```

### 4.2 Update `_reviewSubmission()` internal function (Lines 385-391)

**OLD:**
```solidity
function _reviewSubmission(string memory title, uint16 royaltyLevel, address reviewer) internal {
    MainStorage storage $ = _getMainStorage();
    $.hasReviewed[title][reviewer] = true;
    $.submissions[title].reviewCount++;
    $.submissions[title].totalRoyaltyLevel += royaltyLevel;
    emit SubmissionReviewed(title, reviewer, royaltyLevel, title);
}
```

**NEW:**
```solidity
function _reviewSubmission(string memory title, uint16 royaltyLevel, uint256 nullifierHash) internal {
    MainStorage storage $ = _getMainStorage();
    $.nullifierUsed[title][nullifierHash] = true;
    $.submissions[title].reviewCount++;
    $.submissions[title].totalRoyaltyLevel += royaltyLevel;
    emit SubmissionReviewed(title, nullifierHash, royaltyLevel, title);
}
```

---

## Phase 5: ERC-4337 Integration

### 5.1 Modify `validateUserOp()` for reviewSubmission (Lines 501-516)

**OLD:**
```solidity
else if (selector == this.reviewSubmission.selector) {
    (string memory title, uint16 royaltyLevel) = abi.decode(userOp.callData[4:], (string, uint16));
    _requireReviewable(title, royaltyLevel, appendedSigner);

    assembly {
        tstore(TRANSIENT_SIGNER_SLOT, appendedSigner)
    }

    if (signer != appendedSigner) {
        return SIG_VALIDATION_FAILED;
    }
    return 0;
}
```

**NEW:**
```solidity
else if (selector == this.reviewSubmission.selector) {
    (
        string memory title,
        uint16 royaltyLevel,
        uint256 merkleTreeRoot,
        uint256 nullifierHash,
        uint256[8] memory proof
    ) = abi.decode(
        userOp.callData[4:],
        (string, uint16, uint256, uint256, uint256[8])
    );

    // Verify the Semaphore proof
    _requireReviewable(title, royaltyLevel, merkleTreeRoot, nullifierHash, proof);

    // Store nullifier in transient storage for use in reviewSubmission
    assembly {
        tstore(TRANSIENT_NULLIFIER_SLOT, nullifierHash)
    }

    // No ECDSA signature validation needed for Semaphore proofs
    return 0;
}
```

### 5.2 Add `_getUserOpNullifier()` helper function

**NEW:**
```solidity
function _getUserOpNullifier() internal view returns (uint256) {
    uint256 nullifierHash;
    assembly {
        nullifierHash := tload(TRANSIENT_NULLIFIER_SLOT)
    }
    require(nullifierHash != 0, ZeroNullifier());
    return nullifierHash;
}
```

### 5.3 Update `reviewSubmission()` main function (Lines 365-372)

**NEW:**
```solidity
function reviewSubmission(
    string memory title,
    uint16 royaltyLevel,
    uint256 merkleTreeRoot,
    uint256 nullifierHash,
    uint256[8] calldata proof
) public {
    if (msg.sender == entryPoint()) {
        // ERC-4337 flow: get nullifier from transient storage
        uint256 storedNullifier = _getUserOpNullifier();
        require(storedNullifier == nullifierHash, NullifierMismatch());
        _reviewSubmission(title, royaltyLevel, nullifierHash);
    } else {
        // Direct call flow: validate proof and use provided nullifier
        _requireReviewable(title, royaltyLevel, merkleTreeRoot, nullifierHash, proof);
        _reviewSubmission(title, royaltyLevel, nullifierHash);
    }
}
```

---

## Phase 6: Initialize & Constructor Updates

### 6.1 Modify `initialize()` function (Lines 129-156)

**OLD:**
```solidity
function initialize(
    address _admin,
    address _entryPoint,
    address _token,
    address[] memory _reviewers,
    IRegistrationVerifier _registrationVerifier
) public initializer
```

**NEW:**
```solidity
function initialize(
    address _admin,
    address _entryPoint,
    address _token,
    ISemaphore _semaphore,
    uint256[] memory _initialReviewerCommitments,
    IRegistrationVerifier _registrationVerifier
) public initializer
```

### 6.2 Update initialization logic

**REMOVE:**
```solidity
for (uint256 i = 0; i < _reviewers.length; i++) {
    $.configs.reviewers[_reviewers[i]] = true;
    emit ReviewerStatusUpdated(_reviewers[i], true);
}
```

**ADD:**
```solidity
// Store Semaphore contract reference
$.configs.semaphore = _semaphore;

// Create a new Semaphore group for reviewers
uint256 groupId = _semaphore.createGroup();
$.configs.reviewerGroupId = groupId;
emit SemaphoreGroupCreated(groupId);

// Add initial reviewers to the group
for (uint256 i = 0; i < _initialReviewerCommitments.length; i++) {
    _semaphore.addMember(groupId, _initialReviewerCommitments[i]);
    emit ReviewerAdded(_initialReviewerCommitments[i]);
}
```

---

## Phase 7: Events & View Functions

### 7.1 Update events

**REMOVE:**
```solidity
event ReviewerStatusUpdated(address indexed reviewer, bool status);
```

**MODIFY:**
```solidity
// OLD
event SubmissionReviewed(string indexed titleHash, address indexed reviewer, uint16 royaltyLevel, string title);

// NEW
event SubmissionReviewed(string indexed titleHash, uint256 indexed nullifierHash, uint16 royaltyLevel, string title);
```

**ADD:**
```solidity
event ReviewerAdded(uint256 indexed identityCommitment);
event ReviewerRemoved(uint256 indexed identityCommitment);
event ReviewerUpdated(uint256 indexed oldCommitment, uint256 indexed newCommitment);
event SemaphoreGroupCreated(uint256 indexed groupId);
```

### 7.2 Update view functions

**REMOVE:**
```solidity
function isReviewer(address reviewer) public view returns (bool)
function hasReviewed(string memory title, address reviewer) public view returns (bool)
```

**ADD:**
```solidity
function hasReviewedByNullifier(string memory title, uint256 nullifier) public view returns (bool) {
    return _getMainStorage().nullifierUsed[title][nullifier];
}

function getReviewerGroupId() public view returns (uint256) {
    return _getMainStorage().configs.reviewerGroupId;
}

function getSemaphoreContract() public view returns (ISemaphore) {
    return _getMainStorage().configs.semaphore;
}
```

---

## Phase 8: Interface Updates

### 8.1 Update `IRoyaltyAutoClaim` interface

**REMOVE from interface:**
```solidity
function updateReviewers(address[] memory _reviewers, bool[] memory _status) external;
function isReviewer(address reviewer) external view returns (bool);
```

**ADD to interface:**
```solidity
function addReviewerToGroup(uint256 identityCommitment) external;
function removeReviewerFromGroup(uint256 identityCommitment, uint256[] calldata proofSiblings) external;
function updateReviewerInGroup(uint256 oldCommitment, uint256 newCommitment, uint256[] calldata proofSiblings) external;
function hasReviewedByNullifier(string memory title, uint256 nullifier) external view returns (bool);
function getReviewerGroupId() external view returns (uint256);
function getSemaphoreContract() external view returns (ISemaphore);
```

**UPDATE function signature:**
```solidity
// OLD
function reviewSubmission(string memory title, uint16 royaltyLevel) external;

// NEW
function reviewSubmission(
    string memory title,
    uint16 royaltyLevel,
    uint256 merkleTreeRoot,
    uint256 nullifierHash,
    uint256[8] calldata proof
) external;
```

### 8.2 Add new errors

```solidity
error InvalidSemaphoreProof();
error NullifierAlreadyUsed();
error NullifierMismatch();
error ZeroNullifier();
```

**REMOVE:**
```solidity
error Unauthorized(address caller);  // For review operations
error AlreadyReviewed();  // Replaced by NullifierAlreadyUsed
error SameStatus();  // No longer applicable
```

---

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

- Semaphore proof verification: ~300-500k gas (much higher than address checks)
- Group updates trigger Merkle tree recalculations
- Consider batching reviewer additions during initialization
- May want to implement root history for grace period on group updates

### 9.3 Circuit artifacts:

Semaphore proofs require trusted setup files:
- `semaphore.wasm` - Circuit WASM for witness generation
- `semaphore.zkey` - Proving key for proof generation

These can be:
- Downloaded automatically by `@semaphore-protocol/proof` (default)
- Hosted on your CDN for faster loading
- Retrieved from https://github.com/privacy-scaling-explorations/snark-artifacts

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
import { Identity } from "@semaphore-protocol/identity"

// Generate new identity for reviewer
const identity = new Identity()

// Get commitment to share with contract admin
const commitment = identity.commitment

// Securely store identity (localStorage, encrypted storage, etc.)
localStorage.setItem('semaphore-identity', identity.toString())
```

### 10.3 Generating a review proof:

```typescript
import { Identity } from "@semaphore-protocol/identity"
import { Group } from "@semaphore-protocol/group"
import { generateProof } from "@semaphore-protocol/proof"

// Restore reviewer identity
const identity = new Identity(localStorage.getItem('semaphore-identity'))

// Fetch group members from contract or subgraph
const groupMembers = await fetchGroupMembers(reviewerGroupId)
const group = new Group(groupMembers)

// Create signal (hash of title and royalty level)
const signal = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
        ['string', 'uint16'],
        [title, royaltyLevel]
    )
)

// Create scope (hash of groupId and title)
const scope = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'string'],
        [reviewerGroupId, title]
    )
)

// Generate proof
const fullProof = await generateProof(identity, group, signal, scope)

// Extract components for contract call
const { merkleTreeRoot, nullifierHash, proof } = fullProof.publicSignals

// Call contract
await contract.reviewSubmission(
    title,
    royaltyLevel,
    merkleTreeRoot,
    nullifierHash,
    proof
)
```

### 10.4 ERC-4337 UserOperation construction:

```typescript
// The proof needs to be encoded in the callData
const callData = contract.interface.encodeFunctionData('reviewSubmission', [
    title,
    royaltyLevel,
    merkleTreeRoot,
    nullifierHash,
    proof  // uint256[8]
])

// UserOp signature can be minimal since proof validates identity
const userOp = {
    sender: accountAddress,
    callData,
    signature: '0x',  // Empty or minimal signature
    // ... other UserOp fields
}
```

---

## Summary of Files to Modify

1. **`src/RoyaltyAutoClaim.sol`** - Main contract (all phases above)
2. **`src/interfaces/IRoyaltyAutoClaim.sol`** - Interface updates
3. **`foundry.toml`** or **`package.json`** - Add Semaphore contracts dependency
4. **`test/RoyaltyAutoClaim.t.sol`** - Update all reviewer-related tests
5. **`script/Deploy.s.sol`** - Update deployment script with new initialization parameters
6. **Frontend code** - Add Semaphore proof generation logic

---

## Breaking Changes Warning

⚠️ **This is a BREAKING CHANGE**

- Existing deployments **cannot be upgraded** due to storage layout changes
- Requires **fresh deployment** with new contract address
- All reviewers must **re-register** with Semaphore identity commitments
- Frontend must be **completely updated** to generate proofs
- Historical review data structure changes (address → nullifier)

---

## Migration Path for Existing Reviewers

1. **Before deployment:**
   - Each reviewer generates a Semaphore identity
   - Reviewers securely share their identity commitments with admin
   - Admin collects all commitments for initialization

2. **During deployment:**
   - Deploy new RoyaltyAutoClaim contract with Semaphore support
   - Initialize with collected identity commitments
   - Deploy/configure Semaphore contract if not using existing one

3. **After deployment:**
   - Update frontend to new contract address
   - Add proof generation UI/logic
   - Test review flow with test submissions
   - Deprecate old contract (if applicable)

---

## Implementation Checklist

- [ ] Phase 1: Add dependencies and imports
- [ ] Phase 2: Modify storage structures
- [ ] Phase 3: Update core review functions
- [ ] Phase 4: Implement new validation logic
- [ ] Phase 5: Update ERC-4337 integration
- [ ] Phase 6: Modify initialization logic
- [ ] Phase 7: Update events and view functions
- [ ] Phase 8: Update interface definitions
- [ ] Phase 9: Write comprehensive tests
- [ ] Phase 10: Implement frontend proof generation
- [ ] Deploy to testnet and verify
- [ ] Security audit (recommended for production)
- [ ] Deploy to mainnet

---

## Additional Resources

- **Semaphore Documentation**: https://docs.semaphore.pse.dev/
- **Semaphore Contracts**: https://github.com/semaphore-protocol/semaphore/tree/main/packages/contracts
- **Circuit Artifacts**: https://github.com/privacy-scaling-explorations/snark-artifacts
- **Example Integration**: See Semaphore Greeter contract in docs for reference implementation
