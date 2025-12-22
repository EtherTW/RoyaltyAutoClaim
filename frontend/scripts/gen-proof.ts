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
import { Contract, Interface, JsonRpcProvider } from 'ethers'
import fs from 'fs'
import path from 'path'
import { prepareCircuitInputs } from '../../circuits/script/utilsTitleHash'
import { RPC_URL } from '../src/config'

const CHAIN_ID = '84532'

const CIRCUIT_PATH = path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json')

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

const { witness, returnValue } = await noir.execute(circuitInputs)
console.log('returnValue', returnValue)

// Generate proof
const backend = new UltraHonkBackend(circuit.bytecode)
try {
	console.log('\nGenerating UltraHonk proof...')
	const startProve = Date.now()
	const proof = await backend.generateProof(witness, { keccak: true })
	const proveTime = ((Date.now() - startProve) / 1000).toFixed(2)

	console.log(`Proof generated in ${proveTime}s`)
	console.log(`Proof size: ${(proof.proof.length / 1024).toFixed(2)} KB`)

	console.log('publicInputs:', proof.publicInputs)

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
