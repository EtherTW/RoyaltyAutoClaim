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
import { IRoyaltyAutoClaim__factory, RoyaltyAutoClaim__factory } from '../src/typechain-v2'

/*

bun run scripts/estimate-verificationGasLimit.ts test 0x0fBE11484edE83C904733f4b37B821C28a49f706 84532

NOTE: the email must be for a NOT-yet-registered submission — validateUserOp requires
submissions(title).status == NotExist, so estimation reverts with AlreadyRegistered otherwise.

*/

const emailFileName = process.argv[2]
if (!emailFileName) {
	console.error('Please provide an email file name in emails folder as an argument (e.g. test).')
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

/* -------------------------------------------------------------------------- */
/*               Faithful-EVM bisection of validateUserOp success             */
/* -------------------------------------------------------------------------- */
// The bundler estimate is unreliable for this account: validateUserOp checks the
// userOpHash LAST and EmailVerifier swallows OOG in try/catch, so the bundler's
// binary search can terminate on the cheap "verify OOG'd -> SIG_VALIDATION_FAILED"
// path, far below the real verify cost. Bisect the real cost ourselves: eth_call
// validateUserOp as the EntryPoint with a gas limit and check it returns 0
// (the proof above is baked with DEFAULT_USER_OP_HASH, so passing that hash
// exercises the full success path).
const DEFAULT_USER_OP_HASH = '0x00b917632b69261f21d20e0cabdf9f3fa1255c6e500021997a16cf3a46d80297'
const ENTRY_POINT_V08 = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'

const validateCalldata = RoyaltyAutoClaim__factory.createInterface().encodeFunctionData('validateUserOp', [
	op.pack(),
	DEFAULT_USER_OP_HASH,
	0n,
])

// eth_call charges intrinsic gas (21k + calldata) before execution; the account's
// frame in the real EP flow receives exactly verificationGasLimit, so subtract it.
const calldataBytes = Buffer.from(validateCalldata.slice(2), 'hex')
let intrinsic = 21000n
for (const b of calldataBytes) {
	intrinsic += b === 0 ? 4n : 16n
}

async function validatesAt(gas: bigint): Promise<boolean> {
	try {
		const ret = await client.call({
			from: ENTRY_POINT_V08,
			to: ARGS.racAddress,
			data: validateCalldata,
			gasLimit: gas + intrinsic,
		})
		return BigInt(ret) === 0n // 0 = success, 1 = SIG_VALIDATION_FAILED (incl. OOG-in-catch)
	} catch {
		return false
	}
}

console.log('bisecting faithful-EVM minimum VGL...')
let lo = 1_000_000n
let hi = 10_000_000n
if (!(await validatesAt(hi))) {
	console.error('[WARN] validateUserOp does not return 0 even at 10M gas — check the proof/state')
} else {
	while (hi - lo > 10_000n) {
		const mid = (lo + hi) / 2n
		if (await validatesAt(mid)) hi = mid
		else lo = mid
	}
}
const faithfulMin = hi

// Pimlico's send-time simulation has been observed to need ~30%+ headroom over the
// faithful-EVM minimum (3.2M rejected with AA24 while fork replay passed; 4M worked).
// See incidents/2026-06-06-email-registration-failures.
const recommended = ((faithfulMin > rawVgl ? faithfulMin : rawVgl) * 14n) / 10n

console.log('verificationGasLimit (bundler raw)   ', rawVgl)
console.log('verificationGasLimit (faithful-EVM)  ', faithfulMin)
console.log('verificationGasLimit (recommended 1.4x of max)', recommended)
console.log('→ Update PREDEFINED_VGL_BASE_SEPOLIA (or PREDEFINED_VGL_BASE) in frontend/src/config.ts')
console.log('→ Then CONFIRM with a real eth_sendUserOperation on the target chain before shipping')
process.exit(0)
