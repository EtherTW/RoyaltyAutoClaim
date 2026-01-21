import { SEMAPHORE_IDENTITY_MESSAGE } from '@/config'
import { IRoyaltyAutoClaim__factory, ISemaphore, ISemaphoreGroups__factory } from '@/typechain-v2'
import type {
	MemberAddedEvent,
	MembersAddedEvent,
	MemberUpdatedEvent,
	MemberRemovedEvent,
} from '@/typechain-v2/frontend/abis/ISemaphoreGroups'
import { Group } from '@semaphore-protocol/group'
import { Identity } from '@semaphore-protocol/identity'
import { generateProof } from '@semaphore-protocol/proof'
import { JsonRpcProvider, keccak256, Signer, toBeHex, toUtf8Bytes, ZeroAddress } from 'ethers'

export const SEMAPHORE_ADDRESS = '0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D'

/**
 * Creates a deterministic Semaphore identity from a signer's signature
 */
export async function createSemaphoreIdentity(signer: Signer): Promise<Identity> {
	const signature = await signer.signMessage(SEMAPHORE_IDENTITY_MESSAGE)
	return new Identity(signature)
}

/**
 * Creates an off-chain Semaphore group with known reviewer commitments
 * @param identityCommitments - Array of identity commitments for all group members
 */
export function createOffChainGroup(identityCommitments: bigint[]): Group {
	return new Group(identityCommitments)
}

/**
 * Generates a Semaphore proof for reviewing a submission
 */
export async function generateSemaphoreProof(params: {
	identity: Identity
	group: Group
	title: string
	royaltyLevel: number
}): Promise<ISemaphore.SemaphoreProofStructOutput> {
	const { identity, group, title, royaltyLevel } = params

	// Message is the royalty level
	const message = BigInt(royaltyLevel)

	// Scope is the hash of the title (to ensure one review per submission per reviewer)
	const scope = BigInt(keccak256(toUtf8Bytes(title)))

	// Generate the proof
	const proof = await generateProof(identity, group, message, scope)

	// Convert to the format expected by the contract
	return {
		merkleTreeDepth: BigInt(proof.merkleTreeDepth),
		merkleTreeRoot: BigInt(proof.merkleTreeRoot),
		nullifier: BigInt(proof.nullifier),
		message: BigInt(proof.message),
		scope: BigInt(proof.scope),
		points: proof.points.map(p => BigInt(p)),
	} as ISemaphore.SemaphoreProofStructOutput
}

/**
 * Encodes a Semaphore proof for use as a signature in user operations
 */
export function encodeSemaphoreProof(proof: {
	merkleTreeDepth: number | bigint
	merkleTreeRoot: string | bigint
	nullifier: string | bigint
	message: string | bigint
	scope: string | bigint
	points: (string | bigint)[]
}): string {
	return IRoyaltyAutoClaim__factory.createInterface()
		.getAbiCoder()
		.encode(
			[
				'tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points)',
			],
			[proof],
		)
}

/**
 * Creates a dummy Semaphore proof for gas estimation
 */
export function makeDummySemaphoreProof(
	merkleTreeDepth: bigint,
	merkleTreeRoot: bigint,
	nullifier: bigint,
	message: bigint,
	scope: bigint,
): string {
	const dummyProof = {
		merkleTreeDepth,
		merkleTreeRoot: toBeHex(merkleTreeRoot, 32),
		nullifier: toBeHex(nullifier, 32),
		message: toBeHex(message, 32),
		scope: toBeHex(scope, 32),
		points: [
			toBeHex(0, 32),
			toBeHex(0, 32),
			toBeHex(0, 32),
			toBeHex(0, 32),
			toBeHex(0, 32),
			toBeHex(0, 32),
			toBeHex(0, 32),
			toBeHex(0, 32),
		],
	}

	return encodeSemaphoreProof(dummyProof)
}

/**
 * Fetches reviewer group members from the Semaphore contract.
 * This is a workaround for a bug in @semaphore-protocol/data's getGroupMembers
 * which incorrectly indexes MemberAdded events by array position instead of member index.
 */
export async function fetchReviewerGroupMembers(params: {
	rpcUrl: string
	semaphoreAddress: string
	groupId: string
}): Promise<bigint[]> {
	const { rpcUrl, semaphoreAddress, groupId } = params

	const provider = new JsonRpcProvider(rpcUrl)
	const contract = ISemaphoreGroups__factory.connect(semaphoreAddress, provider)

	// Check if group exists
	const groupAdmin = await contract.getGroupAdmin(groupId)
	if (groupAdmin === ZeroAddress) {
		throw new Error(`Group '${groupId}' not found`)
	}

	// Get the merkle tree size
	const merkleTreeSize = await contract.getMerkleTreeSize(groupId)
	const size = Number(merkleTreeSize)

	if (size === 0) {
		return []
	}

	// Fetch all relevant events
	const memberAddedFilter = contract.filters.MemberAdded(groupId)
	const membersAddedFilter = contract.filters.MembersAdded(groupId)
	const memberUpdatedFilter = contract.filters.MemberUpdated(groupId)
	const memberRemovedFilter = contract.filters.MemberRemoved(groupId)

	const [memberAddedEvents, membersAddedEvents, memberUpdatedEvents, memberRemovedEvents] = await Promise.all([
		contract.queryFilter(memberAddedFilter),
		contract.queryFilter(membersAddedFilter),
		contract.queryFilter(memberUpdatedFilter),
		contract.queryFilter(memberRemovedFilter),
	])

	// Build a map from member index to identity commitment for single adds
	// Key fix: map by the event's index field, not array position
	const memberAddedMap = new Map<number, string>()
	for (const event of memberAddedEvents) {
		const log = event as unknown as MemberAddedEvent.Log
		const index = Number(log.args.index)
		const identityCommitment = log.args.identityCommitment.toString()
		memberAddedMap.set(index, identityCommitment)
	}

	// Build a map from start index to identity commitments for batch adds
	const membersAddedMap = new Map<number, string[]>()
	for (const event of membersAddedEvents) {
		const log = event as unknown as MembersAddedEvent.Log
		const startIndex = Number(log.args.startIndex)
		const identityCommitments = log.args.identityCommitments.map(c => c.toString())
		membersAddedMap.set(startIndex, identityCommitments)
	}

	// Track updates and removals by index with block number for ordering
	const memberUpdatesMap = new Map<number, { blockNumber: number; newCommitment: string }>()

	for (const event of memberUpdatedEvents) {
		const log = event as unknown as MemberUpdatedEvent.Log
		const index = Number(log.args.index)
		const newIdentityCommitment = log.args.newIdentityCommitment.toString()
		const blockNumber = event.blockNumber

		const existing = memberUpdatesMap.get(index)
		if (!existing || blockNumber > existing.blockNumber) {
			memberUpdatesMap.set(index, { blockNumber, newCommitment: newIdentityCommitment })
		}
	}

	for (const event of memberRemovedEvents) {
		const log = event as unknown as MemberRemovedEvent.Log
		const index = Number(log.args.index)
		const blockNumber = event.blockNumber

		const existing = memberUpdatesMap.get(index)
		if (!existing || blockNumber > existing.blockNumber) {
			memberUpdatesMap.set(index, { blockNumber, newCommitment: '0' })
		}
	}

	// Build the members array
	const members: string[] = []
	let i = 0

	while (i < size) {
		// Check batch adds first
		const batchCommitments = membersAddedMap.get(i)
		if (batchCommitments) {
			members.push(...batchCommitments)
			i += batchCommitments.length
		} else {
			// Look up single add by member index
			const commitment = memberAddedMap.get(i)
			if (commitment === undefined) {
				throw new Error(`No MemberAdded event found for index ${i}`)
			}
			members.push(commitment)
			i += 1
		}
	}

	// Apply updates and removals
	for (let j = 0; j < members.length; j++) {
		const update = memberUpdatesMap.get(j)
		if (update) {
			members[j] = update.newCommitment
		}
	}

	return members.map(m => BigInt(m))
}
