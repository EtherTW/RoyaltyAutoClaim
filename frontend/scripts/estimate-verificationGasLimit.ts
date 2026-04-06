import { UltraHonkBackend } from '@aztec/bb.js'
import { Noir } from '@noir-lang/noir_js'
import { JsonRpcProvider, zeroPadValue } from 'ethers'
import { readFileSync } from 'fs'
import path from 'path'
import { abiEncode, ERC4337Bundler } from 'sendop'
import { parseEmail, prepareCircuitInputs } from '../src/lib/circuit-utils'
import { BUNDLER_URL, RPC_URL } from '../src/config'
import { buildUserOp } from '../src/lib/erc4337-utils'
import { handleUserOpError } from '../src/lib/error'
import { IRoyaltyAutoClaim__factory } from '../src/typechain-v2'

/*

bun run scripts/estimate-verificationGasLimit.ts registration 0x0fBE11484edE83C904733f4b37B821C28a49f706 84532

*/

const emailFileName = process.argv[2]
if (!emailFileName) {
	console.error('Please provide an email file name in emails folder as an argument (e.g. registration).')
	process.exit(1)
}

const racAddress = process.argv[3]
if (!racAddress) {
	console.error('Please provide a RoyaltyAutoClaim address as an argument')
	process.exit(1)
}

const chainIdArg = process.argv[4]
if (chainIdArg !== '84532' && chainIdArg !== '8453') {
	console.error('Please provide a chainId as the 3rd argument: 84532 (Base Sepolia) or 8453 (Base)')
	process.exit(1)
}

const ARGS = {
	racAddress,
	eml: readFileSync(path.join(__dirname, '..', '..', 'emails', `${emailFileName}.eml`)),
} as const

const CHAIN_ID = chainIdArg
const CIRCUIT_PATH = path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json')

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID], undefined, {
	batchMaxCount: 1,
})

const { title, recipient, nullifier } = await parseEmail(ARGS.eml)
const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('registerSubmission4337', [
	title,
	recipient,
	nullifier,
])

const op = await buildUserOp({ royaltyAutoClaimAddress: ARGS.racAddress, chainId: CHAIN_ID, client, bundler, callData })

// Generate circuit outputs
const circuitInputs = await prepareCircuitInputs(ARGS.eml)
const circuit = JSON.parse(readFileSync(CIRCUIT_PATH, 'utf-8'))
const noir = new Noir(circuit)
const { witness } = await noir.execute(circuitInputs)

console.log('generating proof...')
const startProve = Date.now()
const backend = new UltraHonkBackend(circuit.bytecode)
const proof = await backend.generateProof(witness, { keccak: true })
const proveTime = ((Date.now() - startProve) / 1000).toFixed(2)

console.log(`Proof generated in ${proveTime}s`)
console.log(`Proof size: ${(proof.proof.length / 1024).toFixed(2)} KB`)
console.log(`pubkey_hash: ${zeroPadValue(proof.publicInputs[0], 32)}`)

op.setSignature(
	abiEncode(
		['tuple(bytes proof, bytes32[] publicInputs)'],
		[
			{
				proof: proof.proof,
				publicInputs: proof.publicInputs,
			},
		],
	),
)

console.log('estimating gas...')
try {
	await op.estimateGas()
} catch (e: unknown) {
	console.log(`handleOps:\n${op.encodeHandleOpsDataWithDefaultGas()}`)
	handleUserOpError(e)
}

const rawVgl = BigInt(op.preview().verificationGasLimit)
const bufferedVgl = (rawVgl * 15n) / 10n // 1.5x safety buffer

console.log('verificationGasLimit (raw)', rawVgl)
console.log('verificationGasLimit (1.5x)', bufferedVgl)
console.log('→ Update PREDEFINED_VGL_BASE_SEPOLIA (or PREDEFINED_VGL_BASE) in frontend/src/config.ts with the 1.5x value')
process.exit(0)
