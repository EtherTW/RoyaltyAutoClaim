import type { BoundedVec, RSAPubkey, Sequence } from './utils'

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
