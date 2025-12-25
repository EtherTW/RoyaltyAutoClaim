/**
 * Fetch Members from Semaphore Reviewer Group
 *
 * This script fetches all members (identity commitments) from the Semaphore reviewer group
 * using SemaphoreEthers, which queries the blockchain directly instead of using the subgraph.
 *
 * Prerequisites:
 * - VITE_TEST_PRIVATE_KEY must be set in .env (or any valid private key for read-only operations)
 *
 * Usage:
 * bun run scripts/fetch-members.ts <PROXY_ADDRESS>
 *
 * Example:
 * bun run scripts/fetch-members.ts 0x1234567890abcdef1234567890abcdef12345678
 */

import { SemaphoreEthers } from '@semaphore-protocol/data'
import { ethers, JsonRpcProvider, Wallet } from 'ethers'
import { RPC_URL, TENDERLY_RPC_URL } from '../src/config'
import { RoyaltyAutoClaim__factory } from '../src/typechain-v2'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY

if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}

const CHAIN_ID = '84532'

// Get proxy address from command line arguments
const ROYALTY_AUTO_CLAIM_PROXY = process.argv[2]

if (!ROYALTY_AUTO_CLAIM_PROXY) {
	console.error('Error: Proxy address is required')
	console.error('Usage: bun run scripts/fetch-members.ts <PROXY_ADDRESS>')
	console.error('Example: bun run scripts/fetch-members.ts 0x1234567890abcdef1234567890abcdef12345678')
	process.exit(1)
}

if (!ethers.isAddress(ROYALTY_AUTO_CLAIM_PROXY)) {
	console.error(`Error: Invalid Ethereum address: ${ROYALTY_AUTO_CLAIM_PROXY}`)
	process.exit(1)
}

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const signer = new Wallet(VITE_TEST_PRIVATE_KEY, client)

console.log('Signer address:', signer.address)
console.log('RoyaltyAutoClaim Proxy:', ROYALTY_AUTO_CLAIM_PROXY)

// Connect to the RoyaltyAutoClaim contract
const royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(ROYALTY_AUTO_CLAIM_PROXY, signer)

// Get the Semaphore address from the contract
console.log('\nGetting Semaphore address from RoyaltyAutoClaim...')
const semaphoreAddress = await royaltyAutoClaim.semaphore()
console.log('Semaphore address:', semaphoreAddress)

// Get the reviewer group ID created during initialization
console.log('\nGetting reviewer group ID...')
const reviewerGroupId = await royaltyAutoClaim.reviewerGroupId()
console.log('Reviewer Group ID:', reviewerGroupId.toString())

// Initialize SemaphoreEthers with RPC URL and Semaphore contract address
console.log('\nInitializing SemaphoreEthers...')
const semaphoreEthers = new SemaphoreEthers(TENDERLY_RPC_URL[CHAIN_ID], {
	address: semaphoreAddress,
})

// Fetch group members
console.log('\nFetching group members...')
const members = await semaphoreEthers.getGroupMembers(reviewerGroupId.toString())

console.log(`\nFound ${members.length} member(s) in the reviewer group:`)
members.forEach((member, index) => {
	console.log(`  ${index + 1}. ${member}`)
})

// Optionally, fetch full group details
console.log('\nFetching full group details...')
const group = await semaphoreEthers.getGroup(reviewerGroupId.toString())
console.log('\nGroup Details:')
console.log('  ID:', group.id)
console.log('  Members:', group.members?.length || 0)
console.log('  Merkle Tree Root:', group.merkleTree?.root || 'N/A')
console.log('  Merkle Tree Depth:', group.merkleTree?.depth || 'N/A')
console.log('  Merkle Tree Size:', group.merkleTree?.size || 'N/A')

console.log('\nDone!')
