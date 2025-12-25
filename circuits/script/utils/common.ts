import type { BoundedVec, Sequence } from './types'

/**
 * Parses a bounded vector to a string
 * @param boundedVec - Object with `len` (hex string) and `storage` (array of hex strings)
 * @returns Decoded string from the hex-encoded bounded vector
 */
export function parseBoundedVecToString(boundedVec: { len: string; storage: string[] }): string {
	const length = parseInt(boundedVec.len, 16)
	const bytes = boundedVec.storage.slice(0, length)
	return bytes.map(hex => String.fromCharCode(parseInt(hex, 16))).join('')
}

/**
 * Convert string to BoundedVec format with fixed capacity
 * @param str - string to convert
 * @param maxLength - maximum capacity of the BoundedVec (storage will be padded to this length)
 * @returns - BoundedVec with storage as number string array (padded to maxLength) and len as number string
 */
export function stringToBoundedVec(str: string, maxLength: number): BoundedVec {
	const bytes = Array.from(Buffer.from(str, 'utf-8'))

	if (bytes.length > maxLength) {
		throw new Error(`String length ${bytes.length} exceeds max length ${maxLength}`)
	}

	// Create padded storage array
	const storage = new Array(maxLength).fill('0')
	for (let i = 0; i < bytes.length; i++) {
		storage[i] = bytes[i]!.toString()
	}

	return {
		storage,
		len: bytes.length.toString(),
	}
}

/**
 * Split a 32-byte hex string into two 16-byte hex strings for use as Field[2] in circuit
 * @param hash - 32-byte hex string with 0x prefix (66 chars total)
 * @returns - Array of 2 hex strings, each representing 16 bytes
 */
export function splitHashToFields(hash: string): string[] {
	if (!hash.startsWith('0x')) {
		throw new Error('Hash must have 0x prefix')
	}
	if (hash.length !== 66) {
		throw new Error(`Hash must be 32 bytes (66 chars with 0x prefix), got ${hash.length} chars`)
	}
	const hashHex = hash.slice(2) // Remove 0x
	const upperHalf = '0x' + hashHex.slice(0, 32) // First 16 bytes (32 hex chars)
	const lowerHalf = '0x' + hashHex.slice(32, 64) // Last 16 bytes (32 hex chars)
	return [upperHalf, lowerHalf]
}

/**
 * Combine two Field values back into a 32-byte hex string (reverse of splitHashToFields)
 * @param fields - Array of 2 hex strings representing the upper and lower halves
 * @returns - 32-byte hex string with 0x prefix
 */
export function combineFieldsToHash(fields: string[]): string {
	if (fields.length !== 2) {
		throw new Error(`Expected 2 fields, got ${fields.length}`)
	}
	// Fields already have 0x prefix, just remove it and pad to 16 bytes each
	const upper = fields[0]!.slice(2).padStart(32, '0') // 16 bytes (32 hex chars)
	const lower = fields[1]!.slice(2).padStart(32, '0') // 16 bytes (32 hex chars)
	return '0x' + upper + lower // Returns 32 bytes (66 chars total with 0x)
}

export function getNumberSequence(body: Buffer): {
	number_field_seq: Sequence
	number_seq: Sequence
} {
	const bodyStr = body.toString()

	// Use regex to find "No: <number>" pattern
	const numberMatch = bodyStr.match(/No:\s*(\d+)/)

	if (!numberMatch || numberMatch.index === undefined) {
		throw new Error('No number found in body with pattern "No: <number>"')
	}

	const number = numberMatch[1]!

	// number_field_seq: from 'N' in "No:" to the end of the number
	const fieldIndex = numberMatch.index
	const fieldLength = numberMatch[0].length
	const number_field_seq: Sequence = {
		index: fieldIndex.toString(),
		length: fieldLength.toString(),
	}

	// number_seq: just the number itself
	const numberIndex = numberMatch.index + numberMatch[0].indexOf(number)
	const numberLength = number.length
	const number_seq: Sequence = {
		index: numberIndex.toString(),
		length: numberLength.toString(),
	}

	return {
		number_field_seq,
		number_seq,
	}
}

export function getRecipientSequence(body: Buffer): {
	recipient_field_seq: Sequence
	recipient_seq: Sequence
} {
	const bodyStr = body.toString()

	// Use regex to find "Recipient: <address>" pattern
	const recipientMatch = bodyStr.match(/Recipient:\s*(0x[a-fA-F0-9]{40})/)

	if (!recipientMatch || recipientMatch.index === undefined) {
		throw new Error('No recipient address found in body with pattern "Recipient: 0x..."')
	}

	const recipient = recipientMatch[1]!

	// recipient_field_seq: from 'R' in "Recipient:" to the end of the address
	const fieldIndex = recipientMatch.index
	const fieldLength = recipientMatch[0].length
	const recipient_field_seq: Sequence = {
		index: fieldIndex.toString(),
		length: fieldLength.toString(),
	}

	// recipient_seq: just the address itself
	const recipientIndex = recipientMatch.index + recipientMatch[0].indexOf(recipient)
	const recipientLength = recipient.length
	const recipient_seq: Sequence = {
		index: recipientIndex.toString(),
		length: recipientLength.toString(),
	}

	return {
		recipient_field_seq,
		recipient_seq,
	}
}
