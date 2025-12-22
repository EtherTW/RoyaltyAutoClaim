import { generateEmailVerifierInputs } from '@zk-email/zkemail-nr'
import type { BoundedVec, RSAPubkey, Sequence } from './utils'
import {
	getNumberSequence,
	getRecipientSequence,
	MAX_EMAIL_BODY_LENGTH,
	MAX_EMAIL_HEADER_LENGTH,
	splitHashToFields,
} from './utils'
import { zeroPadValue } from 'ethers'

export type CircuitInputsTitleHash = {
	header: BoundedVec
	pubkey: RSAPubkey
	signature: string[]
	dkim_header_seq: Sequence
	body: BoundedVec
	body_hash_index: string
	from_header_seq: Sequence
	from_address_seq: Sequence
	subject_field_seq: Sequence
	subject_prefix_seq: Sequence
	number_field_seq: Sequence
	number_seq: Sequence
	recipient_field_seq: Sequence
	recipient_seq: Sequence
	id_field_seq: Sequence
	id_seq: Sequence
	user_op_hash: string[]
}

export type TitleHashCircuitOutput = [
	string, // pubkey_hash
	string, // nullifier
	BoundedVec, // from_address
	string, // operation_type
	string, // number
	string, // recipient
	[string, string], // title_hash
	[string, string], // user_op_hash
]

export async function prepareCircuitInputs(eml: Buffer, userOpHash?: string) {
	const emailInputs = await generateEmailVerifierInputs(eml, {
		maxHeadersLength: MAX_EMAIL_HEADER_LENGTH,
		maxBodyLength: MAX_EMAIL_BODY_LENGTH,
		ignoreBodyHashCheck: false,
		extractFrom: true,
	})

	const headerBuf = Buffer.from(
		emailInputs.header.storage.slice(0, Number(emailInputs.header.len)).map(b => Number(b)),
	)
	const { subject_field_seq, subject_prefix_seq } = getSubjectPrefixSequence(headerBuf)

	const bodyBuf = Buffer.from(emailInputs.body!.storage.slice(0, Number(emailInputs.body!.len)).map(b => Number(b)))
	const { number_field_seq, number_seq } = getNumberSequence(bodyBuf)
	const { recipient_field_seq, recipient_seq } = getRecipientSequence(bodyBuf)
	const { id_field_seq, id_seq } = getIdSequence(bodyBuf)

	const circuitInputs: CircuitInputsTitleHash = {
		header: emailInputs.header,
		pubkey: emailInputs.pubkey,
		signature: emailInputs.signature,
		dkim_header_seq: emailInputs.dkim_header_sequence,
		body: emailInputs.body!,
		body_hash_index: emailInputs.body_hash_index!,
		from_header_seq: emailInputs.from_header_sequence!,
		from_address_seq: emailInputs.from_address_sequence!,
		subject_field_seq,
		subject_prefix_seq,
		number_field_seq,
		number_seq,
		recipient_field_seq,
		recipient_seq,
		id_field_seq,
		id_seq,
		user_op_hash: splitHashToFields(
			userOpHash || '0x00b917632b69261f21d20e0cabdf9f3fa1255c6e500021997a16cf3a46d80297',
		),
	}

	return circuitInputs
}

export function getSubjectPrefixSequence(header: Buffer): {
	subject_field_seq: Sequence
	subject_prefix_seq: Sequence
} {
	const headerStr = header.toString()

	// Find the subject header start
	const subjectStartMatch = headerStr.match(/subject:/i)
	if (!subjectStartMatch || subjectStartMatch.index === undefined) {
		throw new Error('Subject field not found in header')
	}

	const subjectStart = subjectStartMatch.index

	// Find the end of the subject header field (could be multiple lines)
	// Subject header continues until we hit a line that doesn't start with whitespace
	let currentPos = subjectStart
	let subjectEnd = subjectStart

	while (true) {
		const crlfIndex = headerStr.indexOf('\r\n', currentPos)
		if (crlfIndex === -1) {
			subjectEnd = headerStr.length
			break
		}

		// Check if next line starts with whitespace (continuation)
		const nextChar = headerStr[crlfIndex + 2]
		if (nextChar === ' ' || nextChar === '\t') {
			currentPos = crlfIndex + 2
			continue
		} else {
			subjectEnd = crlfIndex
			break
		}
	}

	// Extract the full subject header (including continuation lines)
	const subjectHeaderFull = headerStr.substring(subjectStart, subjectEnd)

	// Define the two possible base64-encoded prefixes
	const registrationPrefix = '56K66KqN5bey5pS25Yiw5oqV56i/Oi' // 30 bytes
	const recipientUpdatePrefix = '56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2AOi' // 54 bytes

	// Search for registration prefix first
	let prefixIndex = subjectHeaderFull.indexOf(registrationPrefix)
	let prefixLength = registrationPrefix.length

	// If not found, search for recipient update prefix
	if (prefixIndex === -1) {
		prefixIndex = subjectHeaderFull.indexOf(recipientUpdatePrefix)
		prefixLength = recipientUpdatePrefix.length
	}

	// If still not found, throw error
	if (prefixIndex === -1) {
		throw new Error('No valid subject prefix found (expected registration or recipient update prefix)')
	}

	// Calculate subject_field_seq
	const subject_field_seq: Sequence = {
		index: subjectStart.toString(),
		length: (subjectEnd - subjectStart).toString(),
	}

	// Calculate subject_prefix_seq (adjust index to be relative to full header)
	const subject_prefix_seq: Sequence = {
		index: (subjectStart + prefixIndex).toString(),
		length: prefixLength.toString(),
	}

	return {
		subject_field_seq,
		subject_prefix_seq,
	}
}

export function getIdSequence(body: Buffer): {
	id_field_seq: Sequence
	id_seq: Sequence
} {
	const bodyStr = body.toString()

	// Use regex to find "ID: <hash>" pattern
	const idMatch = bodyStr.match(/ID:\s*(0x[a-fA-F0-9]{64})/)

	if (!idMatch || idMatch.index === undefined) {
		throw new Error('No ID hash found in body with pattern "ID: 0x<64 hex chars>"')
	}

	const id = idMatch[1]!

	// id_field_seq: from 'I' in "ID:" to the end of the hash
	const fieldIndex = idMatch.index
	const fieldLength = idMatch[0].length
	const id_field_seq: Sequence = {
		index: fieldIndex.toString(),
		length: fieldLength.toString(),
	}

	// id_seq: just the hash itself
	const idIndex = idMatch.index + idMatch[0].indexOf(id)
	const idLength = id.length
	const id_seq: Sequence = {
		index: idIndex.toString(),
		length: idLength.toString(),
	}

	return {
		id_field_seq,
		id_seq,
	}
}

/**
 * Write circuit inputs to Prover.toml for title_hash circuit
 * @param circuitTargetPath - path to circuits/target directory
 * @param inputs - circuit inputs object for title_hash
 */
export function writeProverTomlTitleHash(circuitTargetPath: string, inputs: CircuitInputsTitleHash) {
	const fs = require('fs')
	const path = require('path')
	const tomlLines: string[] = []

	// Helper to format array of values
	const formatArray = (arr: (string | number)[]): string => {
		return '[' + arr.map(v => `"${v}"`).join(', ') + ']'
	}

	// Helper to format sequence
	const formatSequence = (seq: Sequence): string => {
		return `index = "${seq.index}"\nlength = "${seq.length}"`
	}

	// Helper to format BoundedVec
	const formatBoundedVec = (vec: BoundedVec): string => {
		return `len = "${vec.len}"\nstorage = ${formatArray(vec.storage)}`
	}

	// Write top-level fields
	tomlLines.push(`body_hash_index = "${inputs.body_hash_index}"`)
	tomlLines.push(`signature = ${formatArray(inputs.signature)}`)

	// Validate user_op_hash array (should be 2 hex strings)
	if (inputs.user_op_hash.length !== 2) {
		throw new Error(`user_op_hash must be an array of 2 hex strings, got ${inputs.user_op_hash.length}`)
	}
	tomlLines.push(`user_op_hash = ${formatArray(inputs.user_op_hash)}`)
	tomlLines.push('')

	// Write body section
	tomlLines.push('[body]')
	tomlLines.push(formatBoundedVec(inputs.body))
	tomlLines.push('')

	// Write dkim_header_seq section
	tomlLines.push('[dkim_header_seq]')
	tomlLines.push(formatSequence(inputs.dkim_header_seq))
	tomlLines.push('')

	// Write from_address_seq section
	tomlLines.push('[from_address_seq]')
	tomlLines.push(formatSequence(inputs.from_address_seq))
	tomlLines.push('')

	// Write from_header_seq section
	tomlLines.push('[from_header_seq]')
	tomlLines.push(formatSequence(inputs.from_header_seq))
	tomlLines.push('')

	// Write header section
	tomlLines.push('[header]')
	tomlLines.push(formatBoundedVec(inputs.header))
	tomlLines.push('')

	// Write pubkey section
	tomlLines.push('[pubkey]')
	tomlLines.push(`modulus = ${formatArray(inputs.pubkey.modulus)}`)
	tomlLines.push(`redc = ${formatArray(inputs.pubkey.redc)}`)
	tomlLines.push('')

	// Write subject_field_seq section
	tomlLines.push('[subject_field_seq]')
	tomlLines.push(formatSequence(inputs.subject_field_seq))
	tomlLines.push('')

	// Write subject_prefix_seq section
	tomlLines.push('[subject_prefix_seq]')
	tomlLines.push(formatSequence(inputs.subject_prefix_seq))
	tomlLines.push('')

	// Write number_field_seq section
	tomlLines.push('[number_field_seq]')
	tomlLines.push(formatSequence(inputs.number_field_seq))
	tomlLines.push('')

	// Write number_seq section
	tomlLines.push('[number_seq]')
	tomlLines.push(formatSequence(inputs.number_seq))
	tomlLines.push('')

	// Write recipient_field_seq section
	tomlLines.push('[recipient_field_seq]')
	tomlLines.push(formatSequence(inputs.recipient_field_seq))
	tomlLines.push('')

	// Write recipient_seq section
	tomlLines.push('[recipient_seq]')
	tomlLines.push(formatSequence(inputs.recipient_seq))
	tomlLines.push('')

	// Write id_field_seq section
	tomlLines.push('[id_field_seq]')
	tomlLines.push(formatSequence(inputs.id_field_seq))
	tomlLines.push('')

	// Write id_seq section
	tomlLines.push('[id_seq]')
	tomlLines.push(formatSequence(inputs.id_seq))

	const proverTomlPath = path.join(circuitTargetPath, '../Prover.toml')
	fs.writeFileSync(proverTomlPath, tomlLines.join('\n') + '\n')
}

/**
 * Format circuit return values as public inputs array
 * @param returnValue - return value from noir.execute() for title_hash circuit
 * @returns - array of hex strings formatted like publicInputs.json
 */
export function prepareCircuitOutput(returnValue: TitleHashCircuitOutput): string[] {
	// Format circuit outputs as public inputs array
	const publicInputs: string[] = []

	// Output structure from title_hash circuit:
	// 0: pubkey_hash (Field)
	// 1: nullifier (Field)
	// 2: from_address (BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH>)
	// 3: operation_type (Field)
	// 4: number (Field)
	// 5: recipient (Field)
	// 6: title_hash ([Field; 2])
	// 7: user_op_hash ([Field; 2])

	// Add pubkey_hash (pad to 32 bytes)
	publicInputs.push(zeroPadValue(returnValue[0], 32))

	// Add nullifier (pad to 32 bytes)
	publicInputs.push(zeroPadValue(returnValue[1], 32))

	// Add from_address BoundedVec (storage array + len)
	const fromAddress = returnValue[2]
	for (const byte of fromAddress.storage) {
		publicInputs.push(zeroPadValue(byte, 32))
	}
	publicInputs.push(zeroPadValue(fromAddress.len, 32))

	// Add operation_type (pad to 32 bytes)
	publicInputs.push(zeroPadValue(returnValue[3], 32))

	// Add number (pad to 32 bytes)
	publicInputs.push(zeroPadValue(returnValue[4], 32))

	// Add recipient (pad to 32 bytes)
	publicInputs.push(zeroPadValue(returnValue[5], 32))

	// Add title_hash ([Field; 2]) - pad each field to 32 bytes
	publicInputs.push(zeroPadValue(returnValue[6][0], 32))
	publicInputs.push(zeroPadValue(returnValue[6][1], 32))

	// Add user_op_hash ([Field; 2]) - pad each field to 32 bytes
	publicInputs.push(zeroPadValue(returnValue[7][0], 32))
	publicInputs.push(zeroPadValue(returnValue[7][1], 32))

	return publicInputs
}
