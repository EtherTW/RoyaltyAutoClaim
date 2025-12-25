import type { BoundedVec, RSAPubkey, Sequence } from './types'
import { stringToBoundedVec } from './common'

export const SUBJECT_DECODING_MAX_EMAIL_HEADER_LENGTH = 640
export const SUBJECT_DECODING_MAX_EMAIL_BODY_LENGTH = 1280

export type SubjectDecodingCircuitInputs = {
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

/**
 * Write circuit inputs to Prover.toml
 * @param circuitTargetPath - path to circuits/target directory
 * @param inputs - circuit inputs object
 */
export function writeProverTomlSubjectDecoding(circuitTargetPath: string, inputs: SubjectDecodingCircuitInputs) {
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
