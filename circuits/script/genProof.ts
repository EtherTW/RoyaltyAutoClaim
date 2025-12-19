import { UltraHonkBackend } from '@aztec/bb.js'
import { Noir } from '@noir-lang/noir_js'
import { generateEmailVerifierInputs } from '@zk-email/zkemail-nr'
import fs from 'fs'
import path from 'path'
import {
	decodeSubject,
	getSubjectHeaderSequence,
	getTitleSequence,
	parseBoundedVecToString,
	stringToBoundedVec,
	writeProverToml,
} from './utils'

const MAX_EMAIL_HEADER_LENGTH = 640
const MAX_EMAIL_BODY_LENGTH = 1280
const MAX_DECODED_SUBJECT_LENGTH = 192
const MAX_ENCODED_WORDS = 2

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

	const headerBuf = Buffer.from(
		emailInputs.header.storage.slice(0, Number(emailInputs.header.len)).map(b => Number(b)),
	)

	const [subjectHeaderSeq, subjectValueSeq, encodedWordSequences] = getSubjectHeaderSequence(headerBuf)

	console.log(
		'subjectHeaderSeq',
		headerBuf
			.slice(Number(subjectHeaderSeq.index), Number(subjectHeaderSeq.index) + Number(subjectHeaderSeq.length))
			.toString(),
	)

	console.log(
		'subjectValueSeq',
		headerBuf
			.slice(Number(subjectValueSeq.index), Number(subjectValueSeq.index) + Number(subjectValueSeq.length))
			.toString(),
	)

	console.log(`Found ${encodedWordSequences.length} encoded-word(s) in subject`)
	for (let i = 0; i < encodedWordSequences.length; i++) {
		const seq = encodedWordSequences[i]!
		const base64Part = headerBuf.slice(Number(seq.index), Number(seq.index) + Number(seq.length)).toString()
		console.log(`  encoded-word[${i}]:`, base64Part)
	}

	// Decode the subject
	const decodedSubjectStr = decodeSubject(headerBuf, encodedWordSequences)
	console.log('decodedSubjectStr', decodedSubjectStr)

	const titleSeq = getTitleSequence(decodedSubjectStr)

	// Extract title string using byte indices
	const decodedSubjectBuf = Buffer.from(decodedSubjectStr, 'utf-8')
	const titleStr = decodedSubjectBuf
		.slice(Number(titleSeq.index), Number(titleSeq.index) + Number(titleSeq.length))
		.toString()

	console.log(
		'titleSeq',
		decodedSubjectBuf.slice(Number(titleSeq.index), Number(titleSeq.index) + Number(titleSeq.length)).toString(),
	)

	const decodedSubjectVec = stringToBoundedVec(decodedSubjectStr, MAX_DECODED_SUBJECT_LENGTH)

	// Pad encoded_word_seqs to MAX_ENCODED_WORDS
	const paddedEncodedWordSequences = [...encodedWordSequences]
	while (paddedEncodedWordSequences.length < MAX_ENCODED_WORDS) {
		paddedEncodedWordSequences.push({ index: '0', length: '0' })
	}

	console.log('\nSubject extraction:')
	console.log('Decoded subject:', decodedSubjectStr)
	console.log('Decoded subject length (bytes):', Number(decodedSubjectVec.len))
	console.log('Decoded subject max length (bytes):', decodedSubjectVec.storage.length)

	console.log('Title:', titleStr)
	console.log('Title length (bytes):', Number(titleSeq.length))

	const circuitInputs = {
		header: emailInputs.header,
		pubkey: emailInputs.pubkey,
		signature: emailInputs.signature,
		dkim_header_seq: emailInputs.dkim_header_sequence,
		body: emailInputs.body!,
		body_hash_index: emailInputs.body_hash_index!,
		from_header_seq: emailInputs.from_header_sequence!,
		from_address_seq: emailInputs.from_address_sequence!,
		subject_field_seq: subjectHeaderSeq,
		subject_seq: subjectValueSeq,
		encoded_word_seqs: paddedEncodedWordSequences,
		decoded_subject: decodedSubjectVec,
		title_seq: titleSeq,
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
		console.log('operation type', circuitOutputs[3])
		console.log('title', parseBoundedVecToString(circuitOutputs[4]))

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
