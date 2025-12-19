import { generateEmailVerifierInputs } from '@zk-email/zkemail-nr'
import fs from 'fs'
import path from 'path'

const MAX_EMAIL_HEADER_LENGTH = 1088
const CIRCUIT_PATH = path.join(__dirname, '../main/target', 'main.json')

const emlPath = process.argv[2]

if (!emlPath) {
	console.error('Usage: bun script/genEmailInputs.ts <path-to-eml-file>')
	process.exit(1)
}

main(emlPath).catch(err => {
	console.error('[ERROR]:', err.message)
	if (err.stack) console.error(err.stack)
	process.exit(1)
})

async function main(emlPath: string) {
	// Check circuit exists
	if (!fs.existsSync(CIRCUIT_PATH)) {
		console.error('[ERROR]: Circuit not compiled. Run: nargo compile')
		process.exit(1)
	}

	// Load circuit
	const circuit = JSON.parse(fs.readFileSync(CIRCUIT_PATH, 'utf-8'))
	console.log(`Circuit: ${CIRCUIT_PATH}`)
	console.log(`Noir version: ${circuit.noir_version}`)

	// Check email file exists
	if (!fs.existsSync(emlPath)) {
		console.error(`[ERROR]: Email file not found: ${emlPath}`)
		process.exit(1)
	}

	console.log(`\nPreparing inputs from: ${emlPath}`)
	const email = fs.readFileSync(emlPath)

	// Generate base inputs (header, pubkey, signature)
	const emailInputs = await generateEmailVerifierInputs(email, {
		maxHeadersLength: MAX_EMAIL_HEADER_LENGTH,
		ignoreBodyHashCheck: false,
	})

	console.log('emailInputs', emailInputs)

	/* -------------------------------------------------------------------------- */
	/*                                   Header                                   */
	/* -------------------------------------------------------------------------- */
	const headerBuf = Buffer.from(
		emailInputs.header.storage.slice(0, Number(emailInputs.header.len)).map(b => Number(b)),
	)
	console.log('Header Length:', headerBuf.length)
	console.log('\nHeader:')
	console.log(headerBuf.toString())
	console.log('\nHeader Storage Bytes:')
	console.log(
		emailInputs.header.storage
			.slice(0, Number(emailInputs.header.len))
			.map(b => Number(b))
			.join(' '),
	)

	let headerHasher = new Bun.CryptoHasher('sha256').update(headerBuf)
	const headerHash = '0x' + headerHasher.digest('hex')
	console.log('\nheaderHash', headerHash)

	headerHasher = new Bun.CryptoHasher('sha256').update(headerBuf)
	const headerHashBase64 = headerHasher.digest('base64')
	console.log('headerHashBase64', headerHashBase64)

	/* -------------------------------------------------------------------------- */
	/*                                    Body                                    */
	/* -------------------------------------------------------------------------- */
	const bodyBuf = Buffer.from(emailInputs.body!.storage.slice(0, Number(emailInputs.body!.len)).map(b => Number(b)))
	console.log('Body Length:', bodyBuf.length)
	console.log('\nBody:')
	console.log(bodyBuf.toString())
	console.log('\nBody Storage Bytes:')
	console.log(
		emailInputs
			.body!.storage.slice(0, Number(emailInputs.body!.len))
			.map(b => Number(b))
			.join(' '),
	)

	let bodyHasher = new Bun.CryptoHasher('sha256').update(bodyBuf)
	const bodyHash = '0x' + bodyHasher.digest('hex')
	console.log('\nbodyHash', bodyHash)

	bodyHasher = new Bun.CryptoHasher('sha256').update(bodyBuf)
	const bodyHashBase64 = bodyHasher.digest('base64')
	console.log('bodyHashBase64', bodyHashBase64)
}
