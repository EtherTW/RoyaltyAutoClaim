import { JsonRpcProvider } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import { ERC4337Bundler } from 'sendop'
import { BUNDLER_URL, RPC_URL } from '../src/config'
import { buildUserOp } from '../src/lib/erc4337-utils'
import { handleUserOpError } from '../src/lib/error'
import { genProof, parseEmailData } from '../src/lib/zkemail-utils'
import { IRoyaltyAutoClaim__factory } from '../src/typechain-v2'

/*

bun run scripts/estimate-verificationGasLimit.ts registration 0x23715e41A8EEdCb26A3341259cb76a34c83bd7b0

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
	eml: await fs.readFile(path.join(__dirname, '..', '..', 'emails', `${emailFileName}.eml`), 'utf-8'),
} as const
const CHAIN_ID = '84532'

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID], undefined, {
	batchMaxCount: 1,
})

console.log('parsing email...')
const emailData = await parseEmailData(ARGS.eml)

console.log('building user op...')
let callData: string
if (emailData.subjectType === 'registration') {
	callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('registerSubmission', [
		emailData.title,
		emailData.recipient,
		emailData.headerHash,
	])
} else if (emailData.subjectType === 'recipient-update') {
	callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('updateRoyaltyRecipient', [
		emailData.title,
		emailData.recipient,
		emailData.headerHash,
	])
} else {
	throw new Error(`Unknown email subject type: ${emailData.subjectType}`)
}

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
