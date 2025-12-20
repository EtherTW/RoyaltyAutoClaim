import { UltraHonkBackend } from '@aztec/bb.js'
import { Noir } from '@noir-lang/noir_js'
import { generateEmailVerifierInputs } from '@zk-email/zkemail-nr'
import fs from 'fs'
import path from 'path'
import {
	combineFieldsToHash,
	decodeSubject,
	getNumberSequence,
	getRecipientSequence,
	getSubjectHeaderSequence,
	getTitleSequence,
	parseBoundedVecToString,
	splitHashToFields,
	writeProverToml,
	type CircuitInputs,
} from './utils'

const MAX_EMAIL_HEADER_LENGTH = 640
const MAX_EMAIL_BODY_LENGTH = 1280
const MAX_DECODED_SUBJECT_LENGTH = 192
const MAX_ENCODED_WORDS = 2
const DUMMY_USER_OP_HASH = '0x00b917632b69261f21d20e0cabdf9f3fa1255c6e500021997a16cf3a46d80297'

const CIRCUIT_TARGET_PATH = path.join(__dirname, '../main/target')
const CIRCUIT_PATH = path.join(CIRCUIT_TARGET_PATH, 'main.json')

const emlPath = process.argv[2]

if (!emlPath) {
	console.error('Usage: bun script/genProof.ts <path-to-eml-file>')
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

	// Prepare inputs
	console.log(`\nPreparing inputs from: ${emlPath}`)
	const email = fs.readFileSync(emlPath)

	const emailInputs = await generateEmailVerifierInputs(email, {
		maxHeadersLength: MAX_EMAIL_HEADER_LENGTH,
		maxBodyLength: MAX_EMAIL_BODY_LENGTH,
		ignoreBodyHashCheck: false,
		extractFrom: true,
	})

	/* -------------------------------------------------------------------------- */
	/*                              Subject Extration                             */
	/* -------------------------------------------------------------------------- */

	const headerBuf = Buffer.from(
		emailInputs.header.storage.slice(0, Number(emailInputs.header.len)).map(b => Number(b)),
	)

	const { subject_field_seq, subject_seq, encoded_word_seqs } = getSubjectHeaderSequence(headerBuf, MAX_ENCODED_WORDS)
	console.log(
		'subject_field_seq',
		headerBuf.toString().substring(+subject_field_seq.index, +subject_field_seq.index + +subject_field_seq.length),
	)
	console.log(
		'subject_seq',
		headerBuf.toString().substring(+subject_seq.index, +subject_seq.index + +subject_seq.length),
	)
	console.log('encoded_word_seqs')
	for (let i = 0; i < encoded_word_seqs.length; i++) {
		const seq = encoded_word_seqs[i]!
		if (seq.length !== '0') {
			console.log(`  encoded-word[${i}]:`, headerBuf.toString().substring(+seq.index, +seq.index + +seq.length))
		}
	}

	// Decode the subject
	const { decodedSubjectBuf, decoded_subject } = decodeSubject(
		headerBuf,
		encoded_word_seqs,
		MAX_DECODED_SUBJECT_LENGTH,
	)
	console.log('Decoded subject:', decodedSubjectBuf.toString('utf-8'))
	console.log('Decoded subject byte length', Number(decoded_subject.len))
	console.log('Decoded subject max length', decoded_subject.storage.length)

	const title_seq = getTitleSequence(decodedSubjectBuf)
	console.log(
		'title_seq',
		decodedSubjectBuf.toString('utf-8', +title_seq.index, +title_seq.index + +title_seq.length),
	)
	console.log('Title byte length', Number(title_seq.length))

	/* -------------------------------------------------------------------------- */
	/*                               Body Extraction                              */
	/* -------------------------------------------------------------------------- */

	const bodyBuf = Buffer.from(emailInputs.body!.storage.slice(0, Number(emailInputs.body!.len)).map(b => Number(b)))
	const { number_field_seq, number_seq } = getNumberSequence(bodyBuf)
	const { recipient_field_seq, recipient_seq } = getRecipientSequence(bodyBuf)

	console.log(
		'number_field_seq',
		bodyBuf.toString().substring(+number_field_seq.index, +number_field_seq.index + +number_field_seq.length),
	)
	console.log('number_seq', bodyBuf.toString().substring(+number_seq.index, +number_seq.index + +number_seq.length))
	console.log(
		'recipient_field_seq',
		bodyBuf
			.toString()
			.substring(+recipient_field_seq.index, +recipient_field_seq.index + +recipient_field_seq.length),
	)
	console.log(
		'recipient_seq',
		bodyBuf.toString().substring(+recipient_seq.index, +recipient_seq.index + +recipient_seq.length),
	)

	const circuitInputs: CircuitInputs = {
		header: emailInputs.header,
		pubkey: emailInputs.pubkey,
		signature: emailInputs.signature,
		dkim_header_seq: emailInputs.dkim_header_sequence,
		body: emailInputs.body!,
		body_hash_index: emailInputs.body_hash_index!,
		from_header_seq: emailInputs.from_header_sequence!,
		from_address_seq: emailInputs.from_address_sequence!,
		subject_field_seq,
		subject_seq,
		encoded_word_seqs,
		title_seq,
		number_field_seq,
		number_seq,
		recipient_field_seq,
		recipient_seq,
		user_op_hash: splitHashToFields(DUMMY_USER_OP_HASH),
	}

	// Write circuit inputs to Prover.toml
	console.log(`\nWriting circuit inputs to Prover.toml...`)
	writeProverToml(CIRCUIT_TARGET_PATH, circuitInputs)

	console.log('\nInitializing Noir and UltraHonk backend...')
	const noir = new Noir(circuit)
	const backend = new UltraHonkBackend(circuit.bytecode)

	try {
		console.log('Executing circuit...')
		const { witness, returnValue } = await noir.execute(circuitInputs)

		console.log('\nCircuit Outputs:')

		const circuitOutputs = returnValue as any

		console.log('pubkey hash', circuitOutputs[0])
		console.log('nullifier', circuitOutputs[1])
		console.log('email address', parseBoundedVecToString(circuitOutputs[2]))
		console.log('operation type', Number(circuitOutputs[3]))
		console.log('title', parseBoundedVecToString(circuitOutputs[4]))
		console.log('number', Number(circuitOutputs[5]))
		console.log('recipient', circuitOutputs[6])
		console.log('user_op_hash', combineFieldsToHash(circuitOutputs[7]))

		console.log('\nGenerating UltraHonk proof...')
		const startProve = Date.now()
		const proof = await backend.generateProof(witness, { keccak: true })
		const proveTime = ((Date.now() - startProve) / 1000).toFixed(2)

		console.log(`Proof generated in ${proveTime}s`)
		console.log(`Proof size: ${(proof.proof.length / 1024).toFixed(2)} KB`)

		// Save outputs
		const proofPath = path.join(CIRCUIT_TARGET_PATH, 'proof.bin')
		const publicInputsPath = path.join(CIRCUIT_TARGET_PATH, 'public_inputs.json')

		fs.writeFileSync(proofPath, proof.proof)
		fs.writeFileSync(publicInputsPath, JSON.stringify(proof.publicInputs, null, 2))

		console.log(`\nSaved: ${proofPath}`)
		console.log(`Saved: ${publicInputsPath}`)

		console.log('\nVerifying proof...')
		const startVerify = Date.now()
		const verified = await backend.verifyProof(proof, { keccak: true })
		const verifyTime = ((Date.now() - startVerify) / 1000).toFixed(2)

		if (verified) {
			console.log(`Proof verified in ${verifyTime}s`)
		} else {
			console.error('[FAILED]: Proof verification failed')
			process.exit(1)
		}
	} finally {
		await backend.destroy()
	}
}
