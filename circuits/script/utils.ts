import { BarretenbergSync, Fr } from '@aztec/bb.js'
import * as NoirBignum from '@mach-34/noir-bignum-paramgen'

export const MAX_EMAIL_HEADER_LENGTH = 640
export const MAX_EMAIL_BODY_LENGTH = 1280
export const REGISTRATION_PREFIX = '56K66KqN5bey5pS25Yiw5oqV56i/Oi' // "確認已收到投稿:"
export const ROYALTY_CLAIM_PREFIX = '56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2AOi' // "確認此投稿更改稿費收取地址:"

export type Sequence = {
	index: string
	length: string
}

export type BoundedVec = {
	storage: string[]
	len: string
}

export type RSAPubkey = {
	modulus: string[]
	redc: string[]
}

export type CircuitInputs = {
	header: BoundedVec
	pubkey: RSAPubkey
	signature: string[]
	dkim_header_seq: Sequence
	body: BoundedVec
	body_hash_index: string
	from_header_seq: Sequence
	from_address_seq: Sequence
	subject_field_seq: Sequence
	subject_seq: Sequence
	encoded_word_seqs: Sequence[]
	title_seq: Sequence
	number_field_seq: Sequence
	number_seq: Sequence
	recipient_field_seq: Sequence
	recipient_seq: Sequence
	user_op_hash: string[]
}

/**
 * Parse raw email to extract title, recipient, nullifier, and operation type
 * @param email - raw email content (Buffer or string)
 * @returns - object with title (extracted from subject after colon), recipient address, nullifier (Pedersen hash of DKIM signature), and operationType (1 for registration, 2 for recipient update)
 */
export async function parseEmail(email: Buffer | string): Promise<{
	title: string
	recipient: string
	nullifier: string
	operationType: number
}> {
	const emailBuffer = typeof email === 'string' ? Buffer.from(email) : email
	const emailStr = emailBuffer.toString()

	// Split email into header and body at the first double newline
	const headerBodySplit = emailStr.split(/\r?\n\r?\n/)
	const header = headerBodySplit[0] || ''
	const body = headerBodySplit.slice(1).join('\n\n')

	/* -------------------------------------------------------------------------- */
	/*                    Extract DKIM Signature from Header                      */
	/* -------------------------------------------------------------------------- */

	// Extract DKIM-Signature header (handle line folding - continuation lines start with whitespace)
	const dkimMatch = header.match(/^dkim-signature:\s*(.+?)(?=\r?\n[^\s])/ims)
	if (!dkimMatch) {
		throw new Error('DKIM-Signature header not found in email')
	}

	// Normalize line folding by removing CRLF + whitespace, then remove ALL whitespace for tag parsing
	const dkimHeader = dkimMatch[1]!.replace(/\r?\n\s+/g, '').replace(/\s+/g, '')

	// Extract the b= tag (signature value) from DKIM-Signature
	const signatureMatch = dkimHeader.match(/b=([A-Za-z0-9+/=]+)/i)
	if (!signatureMatch) {
		throw new Error('DKIM signature value (b=) not found in DKIM-Signature header')
	}

	const signatureBase64 = signatureMatch[1]!
	const signatureBytes = Buffer.from(signatureBase64, 'base64')

	// Convert signature bytes to BigInt
	const signatureBigInt = BigInt('0x' + signatureBytes.toString('hex'))

	// Determine modulus length from signature size (in bits)
	// For RSA-2048, signature is 256 bytes = 2048 bits
	const modulusLength = signatureBytes.length * 8

	// Convert signature BigInt to limb string array (same format as circuit expects)
	const signatureLimbs = NoirBignum.bnToLimbStrArray(signatureBigInt, modulusLength)

	/* -------------------------------------------------------------------------- */
	/*                         Extract and Decode Subject                         */
	/* -------------------------------------------------------------------------- */

	// Extract Subject header (handle line folding - continuation lines start with whitespace)
	const subjectMatch = header.match(/^subject:\s*(.+?)(?=\r?\n[^\s])/ims)
	if (!subjectMatch) {
		throw new Error('Subject header not found in email')
	}

	// Get the raw subject value and normalize line folding (remove CRLF + whitespace)
	let subjectValue = subjectMatch[1]!.replace(/\r?\n\s+/g, ' ').trim()

	// Remove whitespace between consecutive encoded-words (RFC 2047 section 6.2)
	// When encoded-words are adjacent, whitespace between them should be ignored
	subjectValue = subjectValue.replace(/(\?=)\s+(=\?)/g, '$1$2')

	// Decode RFC 2047 encoded-words: =?charset?encoding?encoded-text?=
	// Support multiple encoded-words and concatenate them
	const encodedWordRegex = /=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g
	let decodedSubject = subjectValue.replace(
		encodedWordRegex,
		(_match: string, _charset: string, encoding: string, encodedText: string) => {
			if (encoding.toUpperCase() === 'B') {
				// Base64 encoding
				const decoded = Buffer.from(encodedText, 'base64').toString('utf-8')
				return decoded
			} else if (encoding.toUpperCase() === 'Q') {
				// Quoted-printable encoding
				const decoded = encodedText
					.replace(/_/g, ' ') // underscores represent spaces
					.replace(/=([0-9A-F]{2})/gi, (_match: string, hex: string) =>
						String.fromCharCode(parseInt(hex, 16)),
					)
				return decoded
			}
			return _match
		},
	)

	// Remove any remaining whitespace from line folding
	decodedSubject = decodedSubject.replace(/\s+/g, ' ').trim()

	/* -------------------------------------------------------------------------- */
	/*                         Determine Operation Type                           */
	/* -------------------------------------------------------------------------- */

	// Decode the base64 prefixes to get the actual Chinese text
	const registrationPrefixDecoded = Buffer.from(REGISTRATION_PREFIX, 'base64').toString('utf-8')
	const royaltyClaimPrefixDecoded = Buffer.from(ROYALTY_CLAIM_PREFIX, 'base64').toString('utf-8')

	// Determine operation type based on subject prefix
	let operationType: number
	if (decodedSubject.startsWith(registrationPrefixDecoded)) {
		operationType = 1 // Registration
	} else if (decodedSubject.startsWith(royaltyClaimPrefixDecoded)) {
		operationType = 2 // Recipient update
	} else {
		throw new Error(
			`Invalid subject prefix. Expected registration prefix "${registrationPrefixDecoded}" or royalty claim prefix "${royaltyClaimPrefixDecoded}"`,
		)
	}

	// Extract title after colon (format: "prefix: title" or "prefix:title")
	const titleMatch = decodedSubject.match(/:\s*(.+)$/)
	const title = titleMatch ? titleMatch[1]!.trim() : decodedSubject

	/* -------------------------------------------------------------------------- */
	/*                          Extract Recipient Address                         */
	/* -------------------------------------------------------------------------- */

	const recipientMatch = body.match(/Recipient:\s*(0x[a-fA-F0-9]{40})/i)
	if (!recipientMatch) {
		throw new Error('Recipient address not found in email body')
	}
	const recipient = recipientMatch[1]!

	/* -------------------------------------------------------------------------- */
	/*                    Compute Nullifier from DKIM Signature                   */
	/* -------------------------------------------------------------------------- */

	// Initialize Barretenberg API
	const api = await BarretenbergSync.initSingleton()

	// Convert signature limbs (hex strings) to Fr (Field) elements
	const signatureFields = signatureLimbs.map(limbStr => new Fr(BigInt(limbStr)))

	// Compute Pedersen hash (using hashIndex 0, same as circuit)
	const nullifierFr = api.pedersenHash(signatureFields, 0)

	// Convert Fr to hex string (toString() already includes '0x' prefix)
	const nullifier = nullifierFr.toString()

	return {
		title,
		recipient,
		nullifier,
		operationType,
	}
}

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
 * Get the index and length of the subject header field and the encoded value
 * Supports multiple encoded-words per RFC 2047
 * @param header - the header buffer to search in
 * @param maxEncodedWords - maximum number of encoded words (will pad to this length)
 * @returns - { subject_field_seq, subject_seq, encoded_word_seqs }
 */
export function getSubjectHeaderSequence(
	header: Buffer,
	maxEncodedWords: number,
): {
	subject_field_seq: Sequence
	subject_seq: Sequence
	encoded_word_seqs: Sequence[]
} {
	const headerStr = header.toString()

	// Find the subject header start
	const subjectStartMatch = headerStr.match(/subject:/i)
	if (!subjectStartMatch || subjectStartMatch.index === undefined) {
		throw new Error('Subject field not found in header')
	}

	const subjectStart = subjectStartMatch.index

	// Find the end of the subject header line (CRLF)
	// Note: The header is canonicalized, so no header folding to worry about
	const crlfIndex = headerStr.indexOf('\r\n', subjectStart)
	if (crlfIndex === -1) {
		throw new Error('Subject header does not end with CRLF')
	}
	const subjectEnd = crlfIndex // Exclude CRLF - the library checks for CRLF after the sequence

	// Extract the subject header line
	const subjectHeaderLine = headerStr.substring(subjectStart, subjectEnd)

	// Find all encoded-words in the subject header
	// Pattern: =?UTF-8?B?<base64>?=
	// Note: There may be multiple encoded-words separated by spaces
	const encodedWordRegex = /=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g
	const matches: RegExpExecArray[] = []
	let match: RegExpExecArray | null

	while ((match = encodedWordRegex.exec(subjectHeaderLine)) !== null) {
		// Adjust match index to be relative to the full header
		const adjustedMatch = {
			...match,
			index: match.index + subjectStart,
		} as RegExpExecArray
		matches.push(adjustedMatch)
	}

	if (matches.length === 0) {
		throw new Error('No encoded-words found in subject header')
	}

	// Calculate subject header sequence (from "subject:" to end including CRLF)
	const subject_field_seq: Sequence = {
		index: subjectStart.toString(),
		length: (subjectEnd - subjectStart).toString(),
	}

	// Calculate subject value sequence (from first encoded-word to end of last encoded-word)
	const firstMatch = matches[0]!
	const lastMatch = matches[matches.length - 1]!
	const subject_seq: Sequence = {
		index: firstMatch.index.toString(),
		length: (lastMatch.index + lastMatch[0].length - firstMatch.index).toString(),
	}

	// Extract base64 sequences (pointing to base64 content within each encoded-word)
	// Strip ALL padding since the circuit uses BASE64_NO_PAD_DECODER
	const encoded_word_seqs: Sequence[] = matches.map(m => {
		const base64Start = m.index + 10 // Length of "=?UTF-8?B?"
		const base64Content = m[1]!.replace(/=+$/, '') // Captured group with padding stripped

		return {
			index: base64Start.toString(),
			length: base64Content.length.toString(),
		}
	})

	// Pad encoded_word_seqs to maxEncodedWords
	while (encoded_word_seqs.length < maxEncodedWords) {
		encoded_word_seqs.push({ index: '0', length: '0' })
	}

	return {
		subject_field_seq,
		subject_seq,
		encoded_word_seqs,
	}
}

/**
 * Concatenate base64 values from multiple encoded-word sequences
 * Per RFC 2047, multiple encoded-words should be decoded separately then concatenated.
 * However, the circuit expects concatenated base64 to be decoded in one step using BASE64_NO_PAD_DECODER.
 * All padding is stripped since the no-pad decoder doesn't expect any.
 * @param header - the header buffer
 * @param encodedWordSequences - array of sequences pointing to base64 content (may include padding with length '0')
 * @returns - concatenated base64 string without padding
 */
export function getConcatenatedBase64(header: Buffer, encodedWordSequences: Sequence[]): string {
	const headerStr = header.toString()
	let concatenated = ''

	for (const seq of encodedWordSequences) {
		const length = parseInt(seq.length)

		// Skip padding sequences
		if (length === 0) {
			continue
		}

		const index = parseInt(seq.index)
		const base64Part = headerStr.substring(index, index + length)
		concatenated += base64Part
	}

	return concatenated
}

/**
 * Decode MIME encoded-word (base64) from subject header
 * Per RFC 2047, decode each encoded-word separately then concatenate the decoded text
 * @param header - the header buffer
 * @param encodedWordSequences - array of sequences pointing to base64 content (may include padding with length '0')
 * @param maxLength - maximum capacity of the BoundedVec (storage will be padded to this length)
 * @returns - object with decodedSubjectBuf (Buffer) and decoded_subject (BoundedVec)
 */
export function decodeSubject(
	header: Buffer,
	encodedWordSequences: Sequence[],
	maxLength: number,
): {
	decodedSubjectBuf: Buffer
	decoded_subject: BoundedVec
} {
	const headerStr = header.toString()
	const decodedParts: Buffer[] = []

	// Decode each encoded-word separately (RFC 2047 approach)
	for (const seq of encodedWordSequences) {
		const length = parseInt(seq.length)

		// Skip padding sequences
		if (length === 0) {
			continue
		}

		const index = parseInt(seq.index)
		const base64Part = headerStr.substring(index, index + length)

		// Add back padding for proper base64 decoding
		const paddingNeeded = (4 - (base64Part.length % 4)) % 4
		const paddedBase64 = base64Part + '='.repeat(paddingNeeded)

		// Decode this part
		const decodedPart = Buffer.from(paddedBase64, 'base64')
		decodedParts.push(decodedPart)
	}

	// Concatenate all decoded parts
	const decodedSubjectBuf = Buffer.concat(decodedParts)
	const decodedSubjectStr = decodedSubjectBuf.toString('utf-8')
	const decoded_subject = stringToBoundedVec(decodedSubjectStr, maxLength)

	return {
		decodedSubjectBuf,
		decoded_subject,
	}
}

/**
 * Extract title sequence from decoded subject
 * Assumes format: "prefix: title" or "prefix:title" (whitespace after colon is optional)
 * Example: "確認此投稿更改稿費收取地址: Test by Alice" extracts "Test by Alice"
 * @param decodedSubjectBuf - the decoded subject buffer
 * @returns - sequence of the title within the decoded subject (byte indices)
 */
export function getTitleSequence(decodedSubjectBuf: Buffer): Sequence {
	const decodedSubject = decodedSubjectBuf.toString('utf-8')

	// Find the title after ":" or ": " pattern
	const match = decodedSubject.match(/:\s*(.+)$/)

	if (!match || match[1] === undefined) {
		// If no colon found, treat entire subject as title
		const byteLength = decodedSubjectBuf.length
		return { index: '0', length: byteLength.toString() }
	}

	const title = match[1]

	// Calculate byte index where title starts
	// match.index is the position of ":", title starts after ":" and optional whitespace
	const titleStartCharIndex = match.index! + (match[0].length - title.length)
	const prefixPart = decodedSubject.substring(0, titleStartCharIndex)
	const titleStartByteIndex = Buffer.from(prefixPart, 'utf-8').length
	const titleByteLength = Buffer.from(title, 'utf-8').length

	return {
		index: titleStartByteIndex.toString(),
		length: titleByteLength.toString(),
	}
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

/**
 * Write circuit inputs to Prover.toml
 * @param circuitTargetPath - path to circuits/target directory
 * @param inputs - circuit inputs object
 */
export function writeProverToml(circuitTargetPath: string, inputs: CircuitInputs) {
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

	// Write subject_seq section
	tomlLines.push('[subject_seq]')
	tomlLines.push(formatSequence(inputs.subject_seq))
	tomlLines.push('')

	// Write encoded_word_seqs as array of tables
	for (const seq of inputs.encoded_word_seqs) {
		tomlLines.push('[[encoded_word_seqs]]')
		tomlLines.push(`index = "${seq.index}"`)
		tomlLines.push(`length = "${seq.length}"`)
		tomlLines.push('')
	}

	// Write title_seq section
	tomlLines.push('[title_seq]')
	tomlLines.push(formatSequence(inputs.title_seq))
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

	const proverTomlPath = path.join(circuitTargetPath, '../Prover.toml')
	fs.writeFileSync(proverTomlPath, tomlLines.join('\n') + '\n')
}
