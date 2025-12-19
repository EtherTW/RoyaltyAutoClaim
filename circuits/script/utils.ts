export type Sequence = {
	index: string
	length: string
}

export type BoundedVec = {
	storage: string[]
	len: string
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
 * @returns - [subject_header_sequence, subject_value_sequence, encoded_word_sequences]
 */
export function getSubjectHeaderSequence(header: Buffer): [Sequence, Sequence, Sequence[]] {
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
	const headerSequence: Sequence = {
		index: subjectStart.toString(),
		length: (subjectEnd - subjectStart).toString(),
	}

	// Calculate subject value sequence (from first encoded-word to end of last encoded-word)
	const firstMatch = matches[0]!
	const lastMatch = matches[matches.length - 1]!
	const valueSequence: Sequence = {
		index: firstMatch.index.toString(),
		length: (lastMatch.index + lastMatch[0].length - firstMatch.index).toString(),
	}

	// Extract base64 sequences (pointing to base64 content within each encoded-word)
	// Strip ALL padding since the circuit uses BASE64_NO_PAD_DECODER
	const encodedWordSequences: Sequence[] = matches.map((m, i) => {
		const base64Start = m.index + 10 // Length of "=?UTF-8?B?"
		const base64Content = m[1]!.replace(/=+$/, '') // Captured group with padding stripped

		return {
			index: base64Start.toString(),
			length: base64Content.length.toString(),
		}
	})

	return [headerSequence, valueSequence, encodedWordSequences]
}

/**
 * Concatenate base64 values from multiple encoded-word sequences
 * Per RFC 2047, multiple encoded-words should be decoded separately then concatenated.
 * However, the circuit expects concatenated base64 to be decoded in one step using BASE64_NO_PAD_DECODER.
 * All padding is stripped since the no-pad decoder doesn't expect any.
 * @param header - the header buffer
 * @param encodedWordSequences - array of sequences pointing to base64 content (already without padding)
 * @returns - concatenated base64 string without padding
 */
export function getConcatenatedBase64(header: Buffer, encodedWordSequences: Sequence[]): string {
	const headerStr = header.toString()
	let concatenated = ''

	for (const seq of encodedWordSequences) {
		const index = parseInt(seq.index)
		const length = parseInt(seq.length)
		const base64Part = headerStr.substring(index, index + length)
		concatenated += base64Part
	}

	return concatenated
}

/**
 * Decode MIME encoded-word (base64) from subject header
 * Per RFC 2047, decode each encoded-word separately then concatenate the decoded text
 * @param header - the header buffer
 * @param encodedWordSequences - array of sequences pointing to base64 content (without padding)
 * @returns - decoded subject string
 */
export function decodeSubject(header: Buffer, encodedWordSequences: Sequence[]): string {
	const headerStr = header.toString()
	const decodedParts: Buffer[] = []

	// Decode each encoded-word separately (RFC 2047 approach)
	for (const seq of encodedWordSequences) {
		const index = parseInt(seq.index)
		const length = parseInt(seq.length)
		const base64Part = headerStr.substring(index, index + length)

		// Add back padding for proper base64 decoding
		const paddingNeeded = (4 - (base64Part.length % 4)) % 4
		const paddedBase64 = base64Part + '='.repeat(paddingNeeded)

		// Decode this part
		const decodedPart = Buffer.from(paddedBase64, 'base64')
		decodedParts.push(decodedPart)
	}

	// Concatenate all decoded parts
	const decodedBuffer = Buffer.concat(decodedParts)
	return decodedBuffer.toString('utf-8')
}

/**
 * Extract title sequence from decoded subject
 * Assumes format: "prefix: title"
 * @param decodedSubject - the decoded subject string
 * @returns - sequence of the title within the decoded subject (byte indices)
 */
export function getTitleSequence(decodedSubject: string): Sequence {
	// Find the title after ": " pattern
	const separatorIndex = decodedSubject.indexOf(': ')
	if (separatorIndex === -1) {
		// If no separator found, treat entire subject as title
		const byteLength = Buffer.from(decodedSubject, 'utf-8').length
		return { index: '0', length: byteLength.toString() }
	}

	// Use byte indices, not character indices
	const prefixWithSeparator = decodedSubject.substring(0, separatorIndex + 2)
	const titleStartByteIndex = Buffer.from(prefixWithSeparator, 'utf-8').length
	const title = decodedSubject.slice(separatorIndex + 2)
	const titleByteLength = Buffer.from(title, 'utf-8').length

	return {
		index: titleStartByteIndex.toString(),
		length: titleByteLength.toString(),
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
 * Write circuit inputs to Prover.toml
 * @param circuitTargetPath - path to circuits/target directory
 * @param inputs - circuit inputs object
 */
export function writeProverToml(circuitTargetPath: string, inputs: any) {
	const fs = require('fs')
	const path = require('path')
	const tomlLines: string[] = []

	// Helper to format array of values
	const formatArray = (arr: any[]): string => {
		return '[' + arr.map(v => `"${v}"`).join(', ') + ']'
	}

	// Helper to format sequence
	const formatSequence = (seq: { index: any; length: any }): string => {
		return `index = "${seq.index}"\nlength = "${seq.length}"`
	}

	// Helper to format BoundedVec
	const formatBoundedVec = (vec: { len: any; storage: any[] }): string => {
		return `len = "${vec.len}"\nstorage = ${formatArray(vec.storage)}`
	}

	// Write top-level fields
	tomlLines.push(`body_hash_index = "${inputs.body_hash_index}"`)
	tomlLines.push(`signature = ${formatArray(inputs.signature)}`)
	tomlLines.push('')

	// Write body section
	tomlLines.push('[body]')
	tomlLines.push(formatBoundedVec(inputs.body))
	tomlLines.push('')

	// Write dkim_header_sequence section
	tomlLines.push('[dkim_header_sequence]')
	tomlLines.push(formatSequence(inputs.dkim_header_sequence))
	tomlLines.push('')

	// Write from_address_sequence section
	tomlLines.push('[from_address_sequence]')
	tomlLines.push(formatSequence(inputs.from_address_sequence))
	tomlLines.push('')

	// Write from_header_sequence section
	tomlLines.push('[from_header_sequence]')
	tomlLines.push(formatSequence(inputs.from_header_sequence))
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

	// Write subject_header_sequence section
	tomlLines.push('[subject_header_sequence]')
	tomlLines.push(formatSequence(inputs.subject_header_sequence))
	tomlLines.push('')

	// Write subject_value_sequence section
	tomlLines.push('[subject_value_sequence]')
	tomlLines.push(formatSequence(inputs.subject_value_sequence))
	tomlLines.push('')

	// Write encoded_word_sequences as array of tables
	for (let i = 0; i < inputs.encoded_word_sequences.length; i++) {
		const seq = inputs.encoded_word_sequences[i]
		tomlLines.push('[[encoded_word_sequences]]')
		tomlLines.push(`index = "${seq.index}"`)
		tomlLines.push(`length = "${seq.length}"`)
		tomlLines.push('')
	}

	// Write decoded_subject section
	tomlLines.push('[decoded_subject]')
	tomlLines.push(formatBoundedVec(inputs.decoded_subject))
	tomlLines.push('')

	// Write title_sequence section
	tomlLines.push('[title_sequence]')
	tomlLines.push(formatSequence(inputs.title_sequence))

	const proverTomlPath = path.join(circuitTargetPath, '../Prover.toml')
	fs.writeFileSync(proverTomlPath, tomlLines.join('\n') + '\n')
}
