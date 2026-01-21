import { BarretenbergSync, Fr } from '@aztec/bb.js'
import * as NoirBignum from '@mach-34/noir-bignum-paramgen'
import { generateEmailVerifierInputs } from '@zk-email/zkemail-nr'
import { zeroPadValue } from 'ethers'

/* -------------------------------------------------------------------------- */
/*                                   Constants                                */
/* -------------------------------------------------------------------------- */

export const REGISTRATION_PREFIX = '56K66KqN5bey5pS25Yiw5oqV56i/O' // "確認已收到投稿"
export const RECIPIENT_UPDATE_PREFIX = '56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2AO' // "確認此投稿更改稿費收取地址"

export const TITLE_HASH_MAX_EMAIL_HEADER_LENGTH = 960
export const TITLE_HASH_MAX_EMAIL_BODY_LENGTH = 256

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

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

export type TitleHashCircuitInputs = {
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

/* -------------------------------------------------------------------------- */
/*                               Common Functions                             */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                          Title Hash Functions                              */
/* -------------------------------------------------------------------------- */

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

	// Search for registration prefix first
	let prefixIndex = subjectHeaderFull.indexOf(REGISTRATION_PREFIX)
	let prefixLength = REGISTRATION_PREFIX.length

	// If not found, search for recipient update prefix
	if (prefixIndex === -1) {
		prefixIndex = subjectHeaderFull.indexOf(RECIPIENT_UPDATE_PREFIX)
		prefixLength = RECIPIENT_UPDATE_PREFIX.length
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

export async function prepareCircuitInputs(eml: Buffer, userOpHash?: string): Promise<TitleHashCircuitInputs> {
	const emailInputs = await generateEmailVerifierInputs(eml, {
		maxHeadersLength: TITLE_HASH_MAX_EMAIL_HEADER_LENGTH,
		maxBodyLength: TITLE_HASH_MAX_EMAIL_BODY_LENGTH,
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

	const circuitInputs: TitleHashCircuitInputs = {
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

/* -------------------------------------------------------------------------- */
/*                              Email Parsing                                 */
/* -------------------------------------------------------------------------- */

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
	const recipientUpdatePrefixDecoded = Buffer.from(RECIPIENT_UPDATE_PREFIX, 'base64').toString('utf-8')

	// Determine operation type based on subject prefix
	let operationType: number
	if (decodedSubject.startsWith(registrationPrefixDecoded)) {
		operationType = 1 // Registration
	} else if (decodedSubject.startsWith(recipientUpdatePrefixDecoded)) {
		operationType = 2 // Recipient update
	} else {
		throw new Error(
			`Invalid subject prefix. Expected registration prefix "${registrationPrefixDecoded}" or royalty claim prefix "${recipientUpdatePrefixDecoded}"`,
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
