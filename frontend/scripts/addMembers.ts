/**
 * Add Members to Semaphore Reviewer Group
 *
 * This script adds reviewers to the Semaphore group created by RoyaltyAutoClaim.
 * It creates deterministic Semaphore identities by signing the same SEMAPHORE_IDENTITY_MESSAGE
 * that users sign in the frontend, ensuring consistency across the application.
 *
 * Prerequisites:
 * - VITE_TEST_PRIVATE_KEY and VITE_TEST_PRIVATE_KEY_2 must be set in .env
 * - The first private key must be the admin of the RoyaltyAutoClaim contract
 *
 * Usage:
 * bun run scripts/addMembers.ts <PROXY_ADDRESS>
 *
 * Example:
 * bun run scripts/addMembers.ts 0x1234567890abcdef1234567890abcdef12345678
 */

import { RPC_URL, SEMAPHORE_IDENTITY_MESSAGE } from '../src/config'
import { RoyaltyAutoClaim__factory, ISemaphore__factory, ISemaphoreGroups__factory } from '../src/typechain-v2'
import { ethers, JsonRpcProvider, Wallet } from 'ethers'
import { Identity } from '@semaphore-protocol/identity'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
const VITE_TEST_PRIVATE_KEY_2 = import.meta.env.VITE_TEST_PRIVATE_KEY_2

if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}
if (!VITE_TEST_PRIVATE_KEY_2) {
	throw new Error('VITE_TEST_PRIVATE_KEY_2 is not set')
}

const CHAIN_ID = '84532'

// Get proxy address from command line arguments
const ROYALTY_AUTO_CLAIM_PROXY = process.argv[2]

if (!ROYALTY_AUTO_CLAIM_PROXY) {
	console.error('Error: Proxy address is required')
	console.error('Usage: bun run scripts/addMembers.ts <PROXY_ADDRESS>')
	console.error('Example: bun run scripts/addMembers.ts 0x1234567890abcdef1234567890abcdef12345678')
	process.exit(1)
}

if (!ethers.isAddress(ROYALTY_AUTO_CLAIM_PROXY)) {
	console.error(`Error: Invalid Ethereum address: ${ROYALTY_AUTO_CLAIM_PROXY}`)
	process.exit(1)
}

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const admin = new Wallet(VITE_TEST_PRIVATE_KEY, client)

console.log('Admin address:', admin.address)
console.log('RoyaltyAutoClaim Proxy:', ROYALTY_AUTO_CLAIM_PROXY)

// Connect to the RoyaltyAutoClaim contract
const royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(ROYALTY_AUTO_CLAIM_PROXY, admin)

// Get the Semaphore address from the contract
console.log('\nGetting Semaphore address from RoyaltyAutoClaim...')
const semaphoreAddress = await royaltyAutoClaim.semaphore()
console.log('Semaphore address:', semaphoreAddress)

// Get the reviewer group ID created during initialization
console.log('\nGetting reviewer group ID...')
const reviewerGroupId = await royaltyAutoClaim.reviewerGroupId()
console.log('Reviewer Group ID:', reviewerGroupId.toString())

// Create deterministic semaphore identities by signing the same message as the frontend
console.log('\nCreating deterministic Semaphore identities...')

// For reviewer 1 (VITE_TEST_PRIVATE_KEY)
const reviewer1Wallet = new Wallet(VITE_TEST_PRIVATE_KEY, client)
const signature1 = await reviewer1Wallet.signMessage(SEMAPHORE_IDENTITY_MESSAGE)
const identity1 = new Identity(signature1)
console.log('Reviewer 1 address:', reviewer1Wallet.address)
console.log('Reviewer 1 identity commitment:', identity1.commitment.toString())

// For reviewer 2 (VITE_TEST_PRIVATE_KEY_2)
const reviewer2Wallet = new Wallet(VITE_TEST_PRIVATE_KEY_2, client)
const signature2 = await reviewer2Wallet.signMessage(SEMAPHORE_IDENTITY_MESSAGE)
const identity2 = new Identity(signature2)
console.log('Reviewer 2 address:', reviewer2Wallet.address)
console.log('Reviewer 2 identity commitment:', identity2.commitment.toString())

// Prepare identity commitments array
const identityCommitments = [identity1.commitment, identity2.commitment]

// Connect to Semaphore contract using typechain factories
const semaphore = ISemaphore__factory.connect(semaphoreAddress, admin)
const semaphoreGroups = ISemaphoreGroups__factory.connect(semaphoreAddress, admin)

// Check current group admin
console.log('\nChecking group admin...')
const groupAdmin = await semaphoreGroups.getGroupAdmin(reviewerGroupId)
console.log('Group admin:', groupAdmin)

if (groupAdmin.toLowerCase() !== admin.address.toLowerCase()) {
	throw new Error(
		`Admin address mismatch. Expected ${admin.address}, got ${groupAdmin}. Make sure you're using the correct private key.`,
	)
}

// Add members to the group
console.log('\nAdding members to Semaphore group...')
const tx = await semaphore.addMembers(reviewerGroupId, identityCommitments)
console.log('Transaction hash:', tx.hash)

console.log('Waiting for transaction confirmation...')
const receipt = await tx.wait()
if (!receipt) {
	throw new Error('Transaction receipt is null')
}
console.log('Transaction confirmed in block:', receipt.blockNumber)

// Wait for blockchain state to sync
console.log('\nWaiting for blockchain state to sync...')
await new Promise(resolve => setTimeout(resolve, 1000))

// Verify that identity commitments are included in the group with retry logic
console.log('\nVerifying membership...')
for (let i = 0; i < identityCommitments.length; i++) {
	const commitment = identityCommitments[i]
	let isMember = false
	let retries = 0
	const maxRetries = 5

	// Retry verification with exponential backoff
	while (!isMember && retries < maxRetries) {
		if (retries > 0) {
			const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000)
			console.log(`  Retry ${retries}/${maxRetries} after ${delay}ms...`)
			await new Promise(resolve => setTimeout(resolve, delay))
		}

		isMember = await semaphoreGroups.hasMember(reviewerGroupId, commitment)
		retries++
	}
	console.log(`Identity ${i + 1} (${commitment.toString()}): ${isMember ? 'Member' : 'Not a member'}`)

	if (!isMember) {
		throw new Error(`Identity ${i + 1} is not a member of the group after ${maxRetries} retries!`)
	}
}

console.log('\nAll reviewers successfully added to the Semaphore group!')
