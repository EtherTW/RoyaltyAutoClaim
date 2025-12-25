import { BarretenbergSync, Fr } from '@aztec/bb.js'
import * as NoirBignum from '@mach-34/noir-bignum-paramgen'
import { REGISTRATION_PREFIX, ROYALTY_CLAIM_PREFIX } from './constants'

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
