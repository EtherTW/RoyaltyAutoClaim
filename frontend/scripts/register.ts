import { UltraHonkBackend } from '@aztec/bb.js'
import { Noir } from '@noir-lang/noir_js'
import { JsonRpcProvider } from 'ethers'
import { readFileSync } from 'fs'
import path from 'path'
import { abiEncode, ERC4337Bundler, zeroBytes } from 'sendop'
import { parseEmail } from '../../circuits/script/utils'
import {
	prepareCircuitInputs,
	prepareCircuitOutput,
	TitleHashCircuitOutput,
} from '../../circuits/script/utilsTitleHash'
import { BUNDLER_URL, RPC_URL } from '../src/config'
import { buildUserOp, setFixedVerificationGasLimitForZkProof } from '../src/lib/erc4337-utils'
import { handleUserOpError } from '../src/lib/error'
import { IRoyaltyAutoClaim__factory } from '../src/typechain-v2'

/*

bun run scripts/register.ts registration 0xC83B22659A0038d1051059183eE71f04f8344090

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

const ARGS = {
	racAddress,
	eml: readFileSync(path.join(__dirname, '..', '..', 'emails', `${emailFileName}.eml`)),
} as const

const CHAIN_ID = '84532'
const CIRCUIT_PATH = path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json')

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID], undefined, {
	batchMaxCount: 1,
})

const { title, recipient, nullifier } = await parseEmail(ARGS.eml)
const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('registerSubmission', [
	title,
	recipient,
	nullifier,
])

const op = await buildUserOp({ royaltyAutoClaimAddress: ARGS.racAddress, chainId: CHAIN_ID, client, bundler, callData })

// Make dummy proof
const circuitInputs = await prepareCircuitInputs(ARGS.eml)
const circuit = JSON.parse(readFileSync(CIRCUIT_PATH, 'utf-8'))
const noir = new Noir(circuit)
const { witness, returnValue } = await noir.execute(circuitInputs)
const circuitOutputs = prepareCircuitOutput(returnValue as TitleHashCircuitOutput)
const dummyProof = zeroBytes(32)
op.setSignature(abiEncode(['bytes', 'bytes32[]'], [dummyProof, circuitOutputs]))

console.log('estimating gas...')
try {
	await op.estimateGas()
} catch (e: unknown) {
	console.log(`handleOps:\n${op.encodeHandleOpsDataWithDefaultGas()}`)
	handleUserOpError(e)
}

setFixedVerificationGasLimitForZkProof(op)

console.log('generating proof...')
const opHash = op.hash()
console.log('opHash', opHash)

const startProve = Date.now()
const backend = new UltraHonkBackend(circuit.bytecode)
const proof = await backend.generateProof(witness, { keccak: true })
const proveTime = ((Date.now() - startProve) / 1000).toFixed(2)

console.log(`Proof generated in ${proveTime}s`)
console.log(`Proof size: ${(proof.proof.length / 1024).toFixed(2)} KB`)

op.setSignature(abiEncode(['bytes', 'bytes32[]'], [proof.proof, proof.publicInputs]))

console.log('sending user op...')
try {
	await op.send()
} catch (e: unknown) {
	console.log('handleOps', op.encodeHandleOpsData())
	handleUserOpError(e)
}

const receipt = await op.wait()
console.log(receipt.success)
console.log('tx', receipt.receipt.transactionHash)
