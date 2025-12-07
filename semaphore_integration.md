# Semaphore Integration Summary

## Overview

The RoyaltyAutoClaim contract has been updated to integrate Semaphore protocol for anonymous reviewer verification. This replaces the previous address-based reviewer whitelist with a zero-knowledge proof system.

## Key Changes

### 1. Reviewer Authentication Method
- **Before**: Address-based whitelist (`mapping(address => bool) reviewers`)
- **After**: Semaphore group-based anonymous proofs using nullifiers

### 2. Review Tracking
- **Before**: Tracked by reviewer address (`mapping(string => mapping(address => bool)) hasReviewed`)
- **After**: Tracked by nullifier hash (`mapping(string => mapping(uint256 => bool)) hasReviewed`)

### 3. Storage Updates
- Added `ISemaphore semaphore` reference to Configs
- Added `uint256 reviewerGroupId` to identify the Semaphore group for authorized reviewers
- Removed `mapping(address => bool) reviewers` from Configs
- Changed `hasReviewed` mapping key from address to uint256 (nullifier)

### 4. Initialization Changes
- **Before**: Accepted `address[] memory _reviewers`
- **After**: Accepts `ISemaphore _semaphore` and `uint256[] memory _initialReviewerCommitments`
- Creates a new Semaphore group during initialization with `_admin` as group admin
- Adds initial reviewer commitments to the group

### 5. Function Signature Changes

#### `reviewSubmission`
```solidity
// Before
function reviewSubmission(string memory title, uint16 royaltyLevel) public

// After
function reviewSubmission(
    string memory title,
    uint16 royaltyLevel,
    uint256 merkleTreeRoot,
    uint256 nullifierHash,
    uint256[8] calldata proof
) public
```

#### Removed Function
- `updateReviewers(address[] memory _reviewers, bool[] memory _status)` - No longer needed; reviewers are managed through Semaphore group

## Semaphore Proof Verification Details

### merkleTreeDepth Parameter

**Location**: `src/RoyaltyAutoClaim.sol:449`

```solidity
ISemaphore.SemaphoreProof memory semaphoreProof = ISemaphore.SemaphoreProof({
    merkleTreeDepth: 0,  //   Set to 0, not provided by caller
    merkleTreeRoot: merkleTreeRoot,
    nullifier: nullifierHash,
    message: message,
    scope: scope,
    points: proof
});
```

**Note**: The `merkleTreeDepth` is hardcoded to `0` and **not provided by the caller**. The contract relies on the Semaphore contract's default behavior to handle the tree depth internally based on the group configuration.

### Scope Calculation

**Location**: `src/RoyaltyAutoClaim.sol:441`

```solidity
uint256 scope = uint256(keccak256(abi.encodePacked($.configs.reviewerGroupId, title)));
```

**Formula**: `scope = keccak256(reviewerGroupId || title)`

**Purpose**: The scope binds the proof to both:
1. The specific reviewer group (prevents cross-group proof reuse)
2. The specific submission title (prevents proof reuse across different submissions)

This ensures that a reviewer's proof is only valid for the specific submission they're reviewing, preventing replay attacks.

### Message Calculation

**Location**: `src/RoyaltyAutoClaim.sol:445`

```solidity
uint256 message = uint256(keccak256(abi.encodePacked(title, royaltyLevel)));
```

**Formula**: `message = keccak256(title || royaltyLevel)`

**Purpose**: The message binds the zero-knowledge proof to:
1. The submission title being reviewed
2. The specific royalty level being assigned (20, 40, 60, or 80)

This prevents a reviewer from generating a proof with one royalty level and submitting it with a different level, ensuring vote integrity.

## ERC-4337 Flow Changes

### Transient Storage
- **Before**: Used `TRANSIENT_SIGNER_SLOT` to store reviewer address
- **After**: Uses `TRANSIENT_REVIEWER_NULLIFIER_SLOT` to store nullifier hash

### Validation Logic
- **Before**: Verified ECDSA signature against appended signer address
- **After**: Verifies Semaphore proof during `validateUserOp`, stores nullifier in transient storage, then validates nullifier match in `reviewSubmission`

**Location**: `src/RoyaltyAutoClaim.sol:587-592`

```solidity
bool isValidProof = _isReviewable(title, royaltyLevel, merkleTreeRoot, nullifierHash, proof);

// Store nullifier in transient storage for use in reviewSubmission
assembly {
    tstore(TRANSIENT_REVIEWER_NULLIFIER_SLOT, nullifierHash)
}
```

## Security Considerations

1. **Anonymity**: Reviewers' identities are now cryptographically hidden while still preventing double-voting via nullifiers
2. **Nullifier Tracking**: Each submission tracks nullifiers independently to prevent the same reviewer from voting twice
3. **Scope Binding**: Proofs are scoped to specific submissions, preventing cross-submission replay
4. **Message Binding**: Proofs commit to the specific royalty level, preventing vote manipulation
5. **Group Management**: Admin controls reviewer group membership through the Semaphore contract

## Events Updated

```solidity
// Before
event SubmissionReviewed(string indexed titleHash, address indexed reviewer, uint16 royaltyLevel, string title);

// After
event SubmissionReviewed(string indexed titleHash, uint256 indexed nullifierHash, uint16 royaltyLevel, string title);
```

The event now emits the nullifier hash instead of the reviewer address, maintaining privacy.

## New View Functions

- `semaphore()`: Returns the ISemaphore contract reference
- `reviewerGroupId()`: Returns the Semaphore group ID for reviewers

## Removed Functions/Events

- `updateReviewers()`: Removed (use Semaphore group management instead)
- `isReviewer(address)`: Removed (membership is now anonymous)
- `ReviewerStatusUpdated` event: Removed

## Error Codes Added

- `InvalidSemaphoreProof()`: Thrown when Semaphore proof verification fails
- `NullifierMismatch()`: Thrown when stored nullifier doesn't match provided nullifier (ERC-4337 flow)
- `ZeroNullifier()`: Thrown when nullifier is zero in transient storage
