import { bigIntToChunkedBytes, bytesToBigInt, packBytesIntoNBytes } from '@zk-email/helpers'
import { init, parseEmail } from '@zk-email/relayer-utils'
import zkeSdk, { ProofData } from '@zk-email/sdk'
import { buildPoseidon } from 'circomlibjs'
import { createHash } from 'crypto'
import { keccak256, toBeHex, toUtf8Bytes } from 'ethers'
import { abiEncode } from 'sendop'
import { IRegistrationVerifier } from '../typechain-v2'

// https://registry.zk.email/386dac60-44ed-4be5-b09c-13f155184e32/parameters
export const BLUEPRINT_SLUG = 'johnson86tw/RoyaltyAutoClaim@v27'
export const DKIM_REGISTRY_ADDRESS = '0x3D3935B3C030893f118a84C92C66dF1B9E4169d6'

let initialized = false

export async function initOnce() {
	if (!initialized) {
		await init()
		initialized = true
	}
}

export type EmailSubjectType = 'registration' | 'recipient-update'

export type ParsedEmailData = {
	publicKeyHash: string
	headerHash: string
	emailSender: string
	subject: string
	title: string
	subjectType: EmailSubjectType
	id: string
	recipient: string
	userOpHash: string
	signals: string[]
}

export async function parseEmailData(eml: string, userOpHash?: string): Promise<ParsedEmailData> {
	await initOnce()
	const parsedEmail = await parseEmail(eml)

	const publicKey = new Uint8Array(parsedEmail.publicKey)
	const poseidon = await buildPoseidon()
	const pubkeyChunked = bigIntToChunkedBytes(bytesToBigInt(publicKey), 242, 9)
	const publicKeyHash = poseidon.F.toObject(poseidon(pubkeyChunked)) as bigint

	const headerHash = '0x' + createHash('sha256').update(parsedEmail.canonicalizedHeader).digest('hex')

	// subject
	const subject = parsedEmail.headers.get('Subject')[0]

	const matchTitle = subject.match(/(?:確認已收到投稿|確認此投稿更改稿費收取地址):\s*(.+)/)
	if (!matchTitle) {
		throw new Error('Title not found')
	}
	const title = matchTitle[1].trim()

	const matchID = parsedEmail.cleanedBody.match(/^ID:\s*(.+)$/m)
	const id = matchID ? matchID[1].trim() : null
	if (!id) {
		throw new Error('ID not found')
	}

	const matchRecipient = parsedEmail.cleanedBody.match(/Recipient:\s*(.+)$/m)
	const recipient = matchRecipient ? matchRecipient[1].trim() : null
	if (!recipient) {
		throw new Error('recipient not found')
	}

	// Create dummy signals
	const signals: string[] = []

	// public key hash

	signals[0] = publicKeyHash.toString()

	// header hash
	const splittedHeaderHash = splitHashIntoHiLo(headerHash)
	signals[1] = splittedHeaderHash[0]
	signals[2] = splittedHeaderHash[1]

	// emailSender
	const emailSender = parsedEmail.headers.get('From')[0].match(/([^<@]+)@/)[1]
	if (!emailSender) {
		throw new Error('emailSender not found')
	}
	signals[3] = packBytesIntoNBytes(emailSender, 31).toString()

	// subject prefix
	let subjectType: EmailSubjectType
	const REGISTRATION_PREFIX = '確認已收到投稿'
	const RECIPIENT_UPDATE_PREFIX = '確認此投稿更改稿費收取地址'

	if (subject.includes(REGISTRATION_PREFIX)) {
		signals[4] = '4992959312512230116538335825132076927052637790830533900315071821365'
		signals[5] = '0'
		subjectType = 'registration'
	} else if (subject.includes(RECIPIENT_UPDATE_PREFIX)) {
		signals[4] = '185893070597506392968176665448466928770679305951148005942719960109701346869'
		signals[5] = '95285067689723810438499876746722580514607937107503'
		subjectType = 'recipient-update'
	} else {
		throw new Error('Invalid subject')
	}

	// ID
	const idList = padArray<bigint>(packBytesIntoNBytes(id, 31), 3, 0n).map(x => x.toString())
	signals[6] = idList[0]
	signals[7] = idList[1]
	signals[8] = idList[2]

	// Recipient
	const recipientList = padArray<bigint>(packBytesIntoNBytes(recipient, 31), 2, 0n).map(x => x.toString())
	signals[9] = recipientList[0]
	signals[10] = recipientList[1]

	// proverETHAddress
	signals[11] = '0'

	// userOpHash
	const dummyUserOpHash = userOpHash ? userOpHash : keccak256(toUtf8Bytes('dummy-registration'))
	const userOpHashList = padArray<bigint>(packBytesIntoNBytes(dummyUserOpHash, 31), 3, 0n).map(x => x.toString())
	signals[12] = userOpHashList[0]
	signals[13] = userOpHashList[1]
	signals[14] = userOpHashList[2]

	return {
		publicKeyHash: toBeHex(publicKeyHash),
		headerHash,
		emailSender,
		subject,
		title,
		subjectType,
		id,
		recipient,
		userOpHash: dummyUserOpHash,
		signals,
	}
}

export function splitHashIntoHiLo(hash: string): [string, string] {
	// Remove '0x' prefix if present
	const cleanHash = hash.startsWith('0x') ? hash.slice(2) : hash

	// Ensure hash is 64 hex characters (256 bits)
	const paddedHash = cleanHash.padStart(64, '0')

	// Split into two 128-bit parts (32 hex characters each)
	const hiHex = paddedHash.slice(0, 32) // Upper 128 bits
	const loHex = paddedHash.slice(32, 64) // Lower 128 bits

	// Convert to BigInt and then to string
	const headerHashHi = BigInt('0x' + hiHex).toString()
	const headerHashLo = BigInt('0x' + loHex).toString()

	return [headerHashHi, headerHashLo]
}

export function padArray<T>(arr: T[], targetLength: number, defaultValue: T): T[] {
	return arr.length >= targetLength ? arr : [...arr, ...Array(targetLength - arr.length).fill(defaultValue)]
}

export function makeDummyProof(signals: IRegistrationVerifier.ZkEmailProofStruct['signals']) {
	const proof: IRegistrationVerifier.ZkEmailProofStruct = {
		a: ['0', '0'],
		b: [
			['0', '0'],
			['0', '0'],
		],
		c: ['0', '0'],
		signals,
	}
	return encodeZkEmailProof(proof)
}

export function encodeZkEmailProof(proof: IRegistrationVerifier.ZkEmailProofStruct) {
	if (proof.signals.length !== 15) {
		throw new Error(`Expected 15 signals, got ${proof.signals.length}`)
	}
	return abiEncode(['tuple(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[15] signals)'], [proof])
}

export async function genProof(eml: string, userOpHash: string) {
	const sdk = zkeSdk()
	const blueprint = await sdk.getBlueprint(BLUEPRINT_SLUG)
	const prover = blueprint.createProver({ isLocal: false })
	const proof = await prover.generateProof(eml, [
		{
			name: 'userOpHash',
			value: userOpHash,
			maxLength: 66,
		},
	])

	const proofData = proof.props.proofData as unknown as ProofData
	const publicOutputs = proof.props.publicOutputs as unknown as string[]
	const zkEmailProof: IRegistrationVerifier.ZkEmailProofStruct = {
		a: [BigInt(proofData.pi_a[0]), BigInt(proofData.pi_a[1])],
		b: [
			[BigInt(proofData.pi_b[0][1]), BigInt(proofData.pi_b[0][0])],
			[BigInt(proofData.pi_b[1][1]), BigInt(proofData.pi_b[1][0])],
		],
		c: [BigInt(proofData.pi_c[0]), BigInt(proofData.pi_c[1])],
		signals: publicOutputs.map(output => BigInt(output)),
	}
	const encodedProof = encodeZkEmailProof(zkEmailProof)

	return {
		proof: zkEmailProof,
		encodedProof,
	}
}
