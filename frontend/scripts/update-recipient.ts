/*

bun run scripts/update-recipient.ts recipient-update 0x87119E6b3e66E71C5D5c664A1fE05dB75c0A6E59
bun run scripts/update-recipient.ts recipient-update 0x87119E6b3e66E71C5D5c664A1fE05dB75c0A6E59 --direct

*/
import { UltraHonkBackend } from '@aztec/bb.js'
import { Noir } from '@noir-lang/noir_js'
import { JsonRpcProvider, Wallet } from 'ethers'
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
import { IRoyaltyAutoClaim__factory, RoyaltyAutoClaim__factory } from '../src/typechain-v2'

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

const isDirect = process.argv.includes('--direct')

const ARGS = {
	racAddress,
	eml: readFileSync(path.join(__dirname, '..', '..', 'emails', `${emailFileName}.eml`)),
} as const

const CHAIN_ID = '84532'
const CIRCUIT_PATH = path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json')

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])

const { title, recipient, nullifier } = await parseEmail(ARGS.eml)

if (isDirect) {
	// Direct call to updateRoyaltyRecipient
	console.log('\nUsing direct contract call (not ERC-4337)...')

	const privateKey = process.env.PRIVATE_KEY
	if (!privateKey) {
		console.error('PRIVATE_KEY environment variable is required for --direct mode')
		process.exit(1)
	}

	const wallet = new Wallet(privateKey, client)
	const rac = RoyaltyAutoClaim__factory.connect(ARGS.racAddress, wallet)

	console.log('generating proof...')

	// Prepare circuit inputs
	console.log('preparing circuit inputs...')
	const circuitInputs = await prepareCircuitInputs(ARGS.eml)
	const circuit = JSON.parse(readFileSync(CIRCUIT_PATH, 'utf-8'))
	const noir = new Noir(circuit)
	const { witness } = await noir.execute(circuitInputs)
	const startProve = Date.now()
	const backend = new UltraHonkBackend(circuit.bytecode)
	// Generate proof
	const proof = await backend.generateProof(witness, { keccak: true })
	const proveTime = ((Date.now() - startProve) / 1000).toFixed(2)

	console.log(`Proof generated in ${proveTime}s`)
	console.log(`Proof size: ${(proof.proof.length / 1024).toFixed(2)} KB`)

	const emailProof = {
		proof: proof.proof,
		publicInputs: proof.publicInputs,
	}

	console.log('calling updateRoyaltyRecipient...')
	const tx = await rac.updateRoyaltyRecipient(title, emailProof)
	console.log('tx hash:', tx.hash)

	console.log('waiting for confirmation...')
	const receipt = await tx.wait()
	console.log('tx confirmed:', receipt?.hash)
	console.log('success:', receipt?.status === 1)
} else {
	// ERC-4337 flow
	console.log('\nUsing ERC-4337 flow...')

	const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID], undefined, {
		batchMaxCount: 1,
	})

	const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('updateRoyaltyRecipient4337', [
		title,
		recipient,
		nullifier,
	])

	const op = await buildUserOp({
		royaltyAutoClaimAddress: ARGS.racAddress,
		chainId: CHAIN_ID,
		client,
		bundler,
		callData,
	})

	// Prepare circuit inputs
	console.log('preparing circuit inputs...')
	let circuitOutputs
	{
		const circuitInputs = await prepareCircuitInputs(ARGS.eml)
		const circuit = JSON.parse(readFileSync(CIRCUIT_PATH, 'utf-8'))
		const noir = new Noir(circuit)
		const { returnValue } = await noir.execute(circuitInputs)
		circuitOutputs = prepareCircuitOutput(returnValue as TitleHashCircuitOutput)
	}

	// Make dummy proof for gas estimation
	op.setSignature(
		abiEncode(
			['tuple(bytes proof, bytes32[] publicInputs)'],
			[
				{
					proof: zeroBytes(440 * 32),
					publicInputs: circuitOutputs,
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

	setFixedVerificationGasLimitForZkProof(op)

	const opHash = op.hash()
	console.log('opHash', opHash)

	// Prepare circuit inputs for the userOpHash
	console.log('preparing circuit inputs...')
	const circuitInputs = await prepareCircuitInputs(ARGS.eml, opHash)
	const circuit = JSON.parse(readFileSync(CIRCUIT_PATH, 'utf-8'))
	const noir = new Noir(circuit)
	const { witness } = await noir.execute(circuitInputs)

	// Generate proof
	console.log('generating proof...')
	const startProve = Date.now()
	const backend = new UltraHonkBackend(circuit.bytecode)
	const proof = await backend.generateProof(witness, { keccak: true })
	const proveTime = ((Date.now() - startProve) / 1000).toFixed(2)

	console.log(`Proof generated in ${proveTime}s`)
	console.log(`Proof size: ${(proof.proof.length / 1024).toFixed(2)} KB`)

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

	console.log('sending user op...')
	try {
		await op.send()
	} catch (e: unknown) {
		console.log(`handleOps:\n${op.encodeHandleOpsData()}`)
		handleUserOpError(e)
	}

	const receipt = await op.wait()
	console.log(receipt.success)
	console.log('tx', receipt.receipt.transactionHash)
}

process.exit(0)
