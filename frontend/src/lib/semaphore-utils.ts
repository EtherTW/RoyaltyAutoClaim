import { SEMAPHORE_IDENTITY_MESSAGE } from '@/config'
import { IRoyaltyAutoClaim__factory, ISemaphore } from '@/typechain-v2'
import { SemaphoreEthers } from '@semaphore-protocol/data'
import { Group } from '@semaphore-protocol/group'
import { Identity } from '@semaphore-protocol/identity'
import { generateProof } from '@semaphore-protocol/proof'
import { keccak256, Signer, toBeHex, toUtf8Bytes } from 'ethers'

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
 * Fetches reviewer group members from the Semaphore contract using SemaphoreEthers
 */
export async function fetchReviewerGroupMembers(params: {
	rpcUrl: string
	semaphoreAddress: string
	groupId: string
}): Promise<string[]> {
	const { rpcUrl, semaphoreAddress, groupId } = params

	const semaphoreEthers = new SemaphoreEthers(rpcUrl, {
		address: semaphoreAddress,
	})

	return await semaphoreEthers.getGroupMembers(groupId)
}
