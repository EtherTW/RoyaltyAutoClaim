import { JsonRpcProvider } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import { ERC4337Bundler } from 'sendop'
import { BUNDLER_URL, RPC_URL } from '../src/config'
import { buildUserOp } from '../src/lib/erc4337-utils'
import { handleUserOpError } from '../src/lib/error'
import { genProof, parseEmailData } from '../src/lib/zkemail-utils'
import { IRoyaltyAutoClaim__factory } from '../src/typechain-v2'

const ARGS = {
	racAddress: '0xC976DdE89E159827067aa7907b5E84681897fB87',
	eml: await fs.readFile(path.join(__dirname, '..', '..', 'emails', 'registration.eml'), 'utf-8'),
} as const

const CHAIN_ID = '84532'

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID], undefined, {
	batchMaxCount: 1,
})

console.log('parsing email...')
const emailData = await parseEmailData(ARGS.eml)

console.log('building user op...')
const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('registerSubmission', [
	emailData.title,
	emailData.recipient,
	emailData.headerHash,
])

const op = await buildUserOp({ royaltyAutoClaimAddress: ARGS.racAddress, chainId: CHAIN_ID, client, bundler, callData })

const { encodedProof } = await genProof(ARGS.eml, op.hash())
op.setSignature(encodedProof)

console.log('estimating gas...')
try {
	await op.estimateGas()
} catch (e: unknown) {
	console.log('handleOps', op.encodeHandleOpsDataWithDefaultGas())
	handleUserOpError(e)
}

console.log('verificationGasLimit', op.preview().verificationGasLimit)
