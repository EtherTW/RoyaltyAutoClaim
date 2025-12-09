/**
 * Review Submission Script
 *
 * This script allows reviewers to submit reviews for registered submissions
 * using Semaphore zero-knowledge proofs through the ERC-4337 flow.
 *
 * Prerequisites:
 * - VITE_TEST_PRIVATE_KEY and VITE_TEST_PRIVATE_KEY_2 must be set in .env
 * - Reviewers must be added to the Semaphore group (run addMembers.ts first)
 * - A submission must be registered in the contract
 *
 * Usage:
 * bun run scripts/review.ts <TITLE> <ROYALTY_LEVEL> <RAC_ADDRESS> [REVIEWER_INDEX]
 *
 * Example:
 * bun run scripts/review.ts "My Submission" 60 0x1234...5678
 * bun run scripts/review.ts "My Submission" 60 0x1234...5678 1
 *
 * ROYALTY_LEVEL: Must be one of 20, 40, 60, or 80
 * REVIEWER_INDEX: Optional, defaults to 0 (first reviewer). Use 1 for second reviewer.
 */

import { SemaphoreSubgraph } from '@semaphore-protocol/data'
import { Group } from '@semaphore-protocol/group'
import { Identity } from '@semaphore-protocol/identity'
import { generateProof } from '@semaphore-protocol/proof'
import { JsonRpcProvider, Wallet, keccak256, randomBytes, toBeHex, toUtf8Bytes } from 'ethers'
import { ERC4337Bundler } from 'sendop'
import { BUNDLER_URL, RPC_URL, SEMAPHORE_IDENTITY_MESSAGE } from '../src/config'
import { buildUserOp } from '../src/lib/erc4337-utils'
import { handleUserOpError } from '../src/lib/error'
import { encodeSemaphoreProof, makeDummySemaphoreProof } from '../src/lib/semaphore-utils'
import { IRoyaltyAutoClaim__factory, RoyaltyAutoClaim__factory } from '../src/typechain-v2'

// Parse command line arguments
const title = process.argv[2]
if (!title) {
	console.error('Please provide a submission title as the first argument')
	console.error('Usage: bun run scripts/review.ts <TITLE> <ROYALTY_LEVEL> <RAC_ADDRESS> [REVIEWER_INDEX]')
	process.exit(1)
}

const royaltyLevelStr = process.argv[3]
if (!royaltyLevelStr) {
	console.error('Please provide a royalty level (20, 40, 60, or 80) as the second argument')
	process.exit(1)
}

const royaltyLevel = parseInt(royaltyLevelStr, 10)
if (![20, 40, 60, 80].includes(royaltyLevel)) {
	console.error('Royalty level must be one of: 20, 40, 60, or 80')
	process.exit(1)
}

const racAddress = process.argv[4]
if (!racAddress) {
	console.error('Please provide a RoyaltyAutoClaim address as the third argument')
	process.exit(1)
}

const reviewerIndex = parseInt(process.argv[5] || '0', 10)
if (![0, 1].includes(reviewerIndex)) {
	console.error('Reviewer index must be 0 or 1')
	process.exit(1)
}

// Load the appropriate reviewer private key
const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
const VITE_TEST_PRIVATE_KEY_2 = import.meta.env.VITE_TEST_PRIVATE_KEY_2

if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}
if (!VITE_TEST_PRIVATE_KEY_2) {
	throw new Error('VITE_TEST_PRIVATE_KEY_2 is not set')
}

const reviewerPrivateKeys = [VITE_TEST_PRIVATE_KEY, VITE_TEST_PRIVATE_KEY_2]
const reviewerPrivateKey = reviewerPrivateKeys[reviewerIndex]

const CHAIN_ID = '84532'

console.log(`\nReview Submission Script`)
console.log('='.repeat(50))
console.log(`Title: ${title}`)
console.log(`Royalty Level: ${royaltyLevel}`)
console.log(`RoyaltyAutoClaim Address: ${racAddress}`)
console.log(`Reviewer Index: ${reviewerIndex}`)
console.log('='.repeat(50))

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID], undefined, {
	batchMaxCount: 1,
})

// Create reviewer wallet and deterministic identity
const reviewerWallet = new Wallet(reviewerPrivateKey, client)
console.log('\nReviewer address:', reviewerWallet.address)

console.log('Creating deterministic Semaphore identity...')
const signature = await reviewerWallet.signMessage(SEMAPHORE_IDENTITY_MESSAGE)
const identity = new Identity(signature)
console.log('Identity commitment:', identity.commitment.toString())

// Connect to the RoyaltyAutoClaim contract
const royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(racAddress, client)

// Get the Semaphore address and reviewer group ID
console.log('\nFetching contract information...')
const semaphoreAddress = await royaltyAutoClaim.semaphore()
const groupId = await royaltyAutoClaim.reviewerGroupId()
console.log('Semaphore address:', semaphoreAddress)
console.log('Reviewer Group ID:', groupId.toString())

// Create deterministic identities for both reviewers
console.log('\nCreating deterministic Semaphore identities for both reviewers...')

const reviewer1Wallet = new Wallet(VITE_TEST_PRIVATE_KEY, client)
const signature1 = await reviewer1Wallet.signMessage(SEMAPHORE_IDENTITY_MESSAGE)
const identity1 = new Identity(signature1)
console.log('Reviewer 1 commitment:', identity1.commitment.toString())

const reviewer2Wallet = new Wallet(VITE_TEST_PRIVATE_KEY_2, client)
const signature2 = await reviewer2Wallet.signMessage(SEMAPHORE_IDENTITY_MESSAGE)
const identity2 = new Identity(signature2)
console.log('Reviewer 2 commitment:', identity2.commitment.toString())

// Create off-chain group with members from subgraph
const semaphoreSubgraph = new SemaphoreSubgraph('base-sepolia')
const { members } = await semaphoreSubgraph.getGroup(groupId.toString(), { members: true })
const group = new Group(members)

const isMember = await semaphoreSubgraph.isGroupMember(groupId.toString(), identity.commitment.toString())
if (!isMember) {
	throw new Error('Reviewer is not the group member')
}

// Step 1: Calculate message and scope for the proof
const message = BigInt(royaltyLevel)
const scope = BigInt(keccak256(toUtf8Bytes(title)))

console.log('\nMessage (royalty level):', message.toString())
console.log('Scope (hash of title):', scope.toString())

// Step 2: Create dummy proof for gas estimation
console.log('\nBuilding user operation with dummy proof for gas estimation...')

const merkleTreeDepth = BigInt(group.depth)
const merkleTreeRoot = group.root
const randomNullifier = BigInt(keccak256(randomBytes(32)))

const dummyProofEncoded = makeDummySemaphoreProof(merkleTreeDepth, merkleTreeRoot, randomNullifier, message, scope)

const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('reviewSubmission', [
	title,
	royaltyLevel,
	randomNullifier,
])

const op = await buildUserOp({
	royaltyAutoClaimAddress: racAddress,
	chainId: CHAIN_ID,
	client,
	bundler,
	callData,
})

op.setSignature(dummyProofEncoded)

console.log('Estimating gas with dummy proof...')
try {
	await op.estimateGas()
} catch (e: unknown) {
	console.log('handleOps', op.encodeHandleOpsDataWithDefaultGas())
	handleUserOpError(e)
}

// Step 3: Generate real Semaphore proof
console.log('\nGenerating real Semaphore proof...')

// Generate the proof
const semaphoreProof = await generateProof(identity, group, message, scope)

console.log('Semaphore proof generated successfully')
console.log('Nullifier:', semaphoreProof.nullifier.toString())
console.log('Merkle tree depth:', semaphoreProof.merkleTreeDepth)
console.log('Merkle tree root:', semaphoreProof.merkleTreeRoot.toString())

// Check if this reviewer has already reviewed this submission
const hasAlreadyReviewed = await royaltyAutoClaim.hasReviewed(title, semaphoreProof.nullifier)
if (hasAlreadyReviewed) {
	console.error('\nError: This reviewer has already reviewed this submission!')
	process.exit(1)
}

// Step 4: Update user operation with real proof
console.log('\nUpdating user operation with real proof...')

// Update callData with the real nullifier
const realCallData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('reviewSubmission', [
	title,
	royaltyLevel,
	toBeHex(semaphoreProof.nullifier, 32),
])
op.setCallData(realCallData)

// Encode the real Semaphore proof as the signature
const realProofEncoded = encodeSemaphoreProof({
	merkleTreeDepth: semaphoreProof.merkleTreeDepth,
	merkleTreeRoot: toBeHex(semaphoreProof.merkleTreeRoot, 32),
	nullifier: toBeHex(semaphoreProof.nullifier, 32),
	message: toBeHex(semaphoreProof.message, 32),
	scope: toBeHex(semaphoreProof.scope, 32),
	points: semaphoreProof.points,
})

// Update the signature in the user operation
op.setSignature(realProofEncoded)

console.log('Sending user operation...')
try {
	await op.send()
} catch (e: unknown) {
	console.log('handleOps', op.encodeHandleOpsData())
	handleUserOpError(e)
}

const receipt = await op.wait()
console.log('\nTransaction successful:', receipt.success)
console.log('Transaction hash:', receipt.receipt.transactionHash)

console.log('\nReview submitted successfully!')
