/*

Diagnose email-proof issues: generate a proof from an email and verify it directly against
the deployed EmailVerifier (fetched from the RoyaltyAutoClaim proxy) via eth_call, bypassing
the bundler entirely. Useful to tell "proof/circuit/verifier problem" apart from
"bundler/gas problem" when a registration fails (e.g. with AA24).

Usage:
cd frontend
bun run scripts/verify-email-proof.ts <emailFileName> <racAddress> <chainId>

example:
bun run scripts/verify-email-proof.ts test 0xEb6cD8eac109FDD4cD69AB43AAfFa50eD885FF65 84532

See incidents/2026-06-06-email-registration-failures for a worked example.

*/
import { UltraHonkBackend } from '@aztec/bb.js'
import { Noir } from '@noir-lang/noir_js'
import { Contract, Interface, JsonRpcProvider } from 'ethers'
import fs from 'fs'
import path from 'path'
import { RPC_URL } from '../src/config'
import { parseEmail, prepareCircuitInputs } from '../src/lib/circuit-utils'

const emailFileName = process.argv[2]
const racAddress = process.argv[3]
const chainId = process.argv[4]
if (!emailFileName || !racAddress || !chainId || !RPC_URL[chainId]) {
	console.error('Usage: bun run scripts/verify-email-proof.ts <emailFileName> <racAddress> <chainId>')
	process.exit(1)
}

const CIRCUIT_PATH = path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json')
const EML_PATH = path.join(__dirname, '..', '..', 'emails', `${emailFileName}.eml`)

const client = new JsonRpcProvider(RPC_URL[chainId])
const eml = fs.readFileSync(EML_PATH)

// 1. Parse email the same way the frontend does
const { title, recipient, nullifier, operationType } = await parseEmail(eml)
console.log('parsed title    :', JSON.stringify(title))
console.log('parsed recipient:', recipient)
console.log('parsed nullifier:', nullifier)
console.log('operationType   :', operationType)

// 2. Resolve the deployed EmailVerifier from the proxy
const rac = new Contract(racAddress, new Interface(['function emailVerifier() view returns (address)']), client)
const emailVerifierAddress: string = await rac.emailVerifier()
console.log('emailVerifier   :', emailVerifierAddress)

// 3. Generate circuit inputs + proof (default userOpHash — verifyEmail does not check it)
const circuit = JSON.parse(fs.readFileSync(CIRCUIT_PATH, 'utf-8'))
console.log('noir_version    :', circuit.noir_version)
const noir = new Noir(circuit)
const circuitInputs = await prepareCircuitInputs(eml)
const { witness, returnValue } = await noir.execute(circuitInputs)
console.log('circuit title_hash:', (returnValue as unknown[])[6])

const backend = new UltraHonkBackend(circuit.bytecode)
try {
	console.log('\nGenerating UltraHonk proof...')
	const start = Date.now()
	const proof = await backend.generateProof(witness, { keccak: true })
	console.log(`Proof generated in ${((Date.now() - start) / 1000).toFixed(2)}s, size ${proof.proof.length} bytes`)

	const verifier = new Contract(
		emailVerifierAddress,
		new Interface([
			'function verify(bytes calldata proof, bytes32[] calldata publicInputs) public view returns (bool)',
			'function verifyEmail(string calldata _title, (bytes proof, bytes32[] publicInputs) _proof) external view returns (bool)',
		]),
		client,
	)

	// 4a. Raw verify() against the deployed verifier (ZK proof only)
	try {
		const ok = await verifier.verify(proof.proof, proof.publicInputs)
		console.log('\nverify() on deployed verifier:', ok)
	} catch (e) {
		console.log('\nverify() on deployed verifier REVERTED:', (e as Error).message?.slice(0, 200))
	}

	// 4b. Full verifyEmail() — DKIM registry + fromAddress + titleHash + verify
	try {
		const ok = await verifier.verifyEmail(title, { proof: proof.proof, publicInputs: proof.publicInputs })
		console.log('verifyEmail() on deployed verifier:', ok)
	} catch (e) {
		console.log('verifyEmail() on deployed verifier REVERTED:', (e as Error).message?.slice(0, 200))
	}

	// 4c. Rough gas number for the full verifyEmail call
	try {
		const data = verifier.interface.encodeFunctionData('verifyEmail', [
			title,
			{ proof: proof.proof, publicInputs: proof.publicInputs },
		])
		const gas = await client.estimateGas({ to: emailVerifierAddress, data, from: racAddress })
		console.log('verifyEmail eth_estimateGas:', gas.toString())
	} catch (e) {
		console.log('verifyEmail eth_estimateGas failed:', (e as Error).message?.slice(0, 200))
	}
} finally {
	await backend.destroy()
}
process.exit(0)
