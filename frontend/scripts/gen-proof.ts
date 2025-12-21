/* 

Generate proof for title_hash circuit and verify on Base Sepolia

Usage:
cd frontend
bun run scripts/gen-proof.ts <emailFilename> <emailVerifierAddress>

example: 
bun run scripts/gen-proof.ts
bun run scripts/gen-proof.ts registration
bun run scripts/gen-proof.ts recipient-update 0x341015A264A75E824CB5F569E0170b5d7A48E3CF

*/
import { UltraHonkBackend } from '@aztec/bb.js'
import { Noir } from '@noir-lang/noir_js'
import { generateEmailVerifierInputs } from '@zk-email/zkemail-nr'
import { Contract, Interface, JsonRpcProvider } from 'ethers'
import fs from 'fs'
import path from 'path'
import {
	getNumberSequence,
	getRecipientSequence,
	MAX_EMAIL_BODY_LENGTH,
	MAX_EMAIL_HEADER_LENGTH,
	splitHashToFields,
} from '../../circuits/script/utils'
import { CircuitInputsTitleHash, getIdSequence, getSubjectPrefixSequence } from '../../circuits/script/utilsTitleHash'
import { RPC_URL } from '../src/config'

const CHAIN_ID = '84532'
const DUMMY_USER_OP_HASH = '0x00b917632b69261f21d20e0cabdf9f3fa1255c6e500021997a16cf3a46d80297'

const CIRCUIT_TARGET_PATH = path.join(__dirname, '../../circuits/title_hash/target')
const CIRCUIT_PATH = path.join(CIRCUIT_TARGET_PATH, 'title_hash.json')

/* -------------------------------------------------------------------------- */
/*                                Command Args                                */
/* -------------------------------------------------------------------------- */

const emailFilename = process.argv[2] || 'registration'
const emailVerifierAddress = process.argv[3] || '0x341015A264A75E824CB5F569E0170b5d7A48E3CF'

const EML_PATH = path.join(__dirname, '..', '..', 'emails', `${emailFilename}.eml`)

console.log('email:', EML_PATH)

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const verifier = new Contract(
	emailVerifierAddress,
	new Interface([
		'function verify(bytes calldata proof, bytes32[] calldata publicInputs) public view returns (bool)',
	]),
	client,
)

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
if (!fs.existsSync(EML_PATH)) {
	console.error(`[ERROR]: Email file not found: ${EML_PATH}`)
	process.exit(1)
}
const eml = fs.readFileSync(EML_PATH)

// Prepare circuit inputs
const noir = new Noir(circuit)
const circuitInputs = await prepareCircuitInputs(eml)
const { witness } = await noir.execute(circuitInputs)

// Generate proof
const backend = new UltraHonkBackend(circuit.bytecode)
try {
	console.log('\nGenerating UltraHonk proof...')
	const startProve = Date.now()
	const proof = await backend.generateProof(witness, { keccak: true })
	const proveTime = ((Date.now() - startProve) / 1000).toFixed(2)

	console.log(`Proof generated in ${proveTime}s`)
	console.log(`Proof size: ${(proof.proof.length / 1024).toFixed(2)} KB`)

	// Verify proof
	console.log('\nVerifying proof onchain...')
	const startVerify = Date.now()
	const verified = await verifier.verify(proof.proof, proof.publicInputs)
	const verifyTime = ((Date.now() - startVerify) / 1000).toFixed(2)

	if (verified) {
		console.log(`Proof verified onchain in ${verifyTime}s`)
	} else {
		console.error('[FAILED]: Proof verification failed')
		process.exit(1)
	}

	console.log('Verified:', verified)

	// Save proof to .json file
	if (verified) {
		const proofData = {
			proof: Array.from(proof.proof),
			publicInputs: Array.from(proof.publicInputs),
		}

		const outputPath = path.join(__dirname, '..', '..', `${emailFilename}-proof.json`)
		fs.writeFileSync(outputPath, JSON.stringify(proofData, null, 2))
		console.log(`\nProof saved to: ${outputPath}`)
	}
} finally {
	await backend.destroy()
}

async function prepareCircuitInputs(eml: Buffer) {
	const emailInputs = await generateEmailVerifierInputs(eml, {
		maxHeadersLength: MAX_EMAIL_HEADER_LENGTH,
		maxBodyLength: MAX_EMAIL_BODY_LENGTH,
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

	const circuitInputs: CircuitInputsTitleHash = {
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
		user_op_hash: splitHashToFields(DUMMY_USER_OP_HASH),
	}

	return circuitInputs
}
