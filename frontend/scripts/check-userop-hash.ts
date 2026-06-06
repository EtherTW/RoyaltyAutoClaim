/*

Diagnose userOpHash issues: build a registration UserOp exactly like the frontend email flow
(dummy proof → bundler estimation → predefined VGL) and compare sendop's locally computed
op.hash() against the EntryPoint v0.8 on-chain getUserOpHash. A mismatch means every proof
would bake the wrong hash and fail validation with AA24.

Usage:
cd frontend
bun run scripts/check-userop-hash.ts <emailFileName> <racAddress> <chainId>

example:
bun run scripts/check-userop-hash.ts test 0xEb6cD8eac109FDD4cD69AB43AAfFa50eD885FF65 84532

See incidents/2026-06-06-email-registration-failures for a worked example.

*/
import { Noir } from '@noir-lang/noir_js'
import { Contract, Interface, JsonRpcProvider } from 'ethers'
import fs from 'fs'
import path from 'path'
import { abiEncode, ENTRY_POINT_V08_ADDRESS, ERC4337Bundler, fetchGasPricePimlico, UserOpBuilder, zeroBytes } from 'sendop'
import { BUNDLER_URL, RPC_URL } from '../src/config'
import {
	parseEmail,
	prepareCircuitInputs,
	prepareCircuitOutput,
	TitleHashCircuitOutput,
} from '../src/lib/circuit-utils'
import { getNonceV08, setPredefinedVglForZkProof } from '../src/lib/erc4337-utils'
import { IRoyaltyAutoClaim__factory } from '../src/typechain-v2'

const emailFileName = process.argv[2]
const racAddress = process.argv[3]
const chainId = process.argv[4]
if (!emailFileName || !racAddress || !chainId || !RPC_URL[chainId] || !BUNDLER_URL[chainId]) {
	console.error('Usage: bun run scripts/check-userop-hash.ts <emailFileName> <racAddress> <chainId>')
	process.exit(1)
}

const client = new JsonRpcProvider(RPC_URL[chainId])
const bundler = new ERC4337Bundler(BUNDLER_URL[chainId], undefined, { batchMaxCount: 1 })

const eml = fs.readFileSync(path.join(__dirname, '..', '..', 'emails', `${emailFileName}.eml`))
const { title, recipient, nullifier } = await parseEmail(eml)

const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('registerSubmission4337', [
	title,
	recipient,
	nullifier,
])

// Build exactly like useContractCallV2 email flow
const op = new UserOpBuilder({ chainId, bundler, entryPointAddress: ENTRY_POINT_V08_ADDRESS })
	.setSender(racAddress)
	.setNonce(await getNonceV08(racAddress, client))
	.setCallData(callData)
	.setGasPrice(await fetchGasPricePimlico(BUNDLER_URL[chainId]))

// Dummy proof for estimation (real public inputs, zero proof bytes)
const circuit = JSON.parse(
	fs.readFileSync(path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json'), 'utf-8'),
)
const noir = new Noir(circuit)
const { returnValue } = await noir.execute(await prepareCircuitInputs(eml))
const circuitOutputs = prepareCircuitOutput(returnValue as TitleHashCircuitOutput)
op.setSignature(
	abiEncode(
		['tuple(bytes proof, bytes32[] publicInputs)'],
		[{ proof: zeroBytes(440 * 32), publicInputs: circuitOutputs }],
	),
)

console.log('estimating gas via bundler...')
await op.estimateGas()
setPredefinedVglForZkProof(op, chainId)

const localHash = op.hash()
console.log('\nsendop local op.hash() :', localHash)

const ep = new Contract(
	ENTRY_POINT_V08_ADDRESS,
	new Interface([
		'function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)',
	]),
	client,
)
const onchainHash: string = await ep.getUserOpHash(op.pack())
console.log('EntryPoint getUserOpHash:', onchainHash)
console.log('\nMATCH:', localHash.toLowerCase() === onchainHash.toLowerCase())
process.exit(0)
