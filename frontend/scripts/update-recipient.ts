import { JsonRpcProvider } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import { ERC4337Bundler } from 'sendop'
import { BUNDLER_URL, RPC_URL } from '../src/config'
import { buildUserOp, setFixedVerificationGasLimitForZkProof } from '../src/lib/erc4337-utils'
import { handleUserOpError } from '../src/lib/error'
import { genProof, makeDummyProof, parseEmailData } from '../src/lib/zkemail-utils'
import { IRoyaltyAutoClaim__factory } from '../src/typechain-v2'

/*

bun run scripts/update-recipient.ts recipient-update 0xaCf34e475Ef850AF607ECA2563C07542F5D2F47a

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
const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('updateRoyaltyRecipient', [
	emailData.title,
	emailData.recipient,
	emailData.headerHash,
])

const op = await buildUserOp({ royaltyAutoClaimAddress: ARGS.racAddress, chainId: CHAIN_ID, client, bundler, callData })
op.setSignature(makeDummyProof(emailData.signals))

console.log('estimating gas...')
try {
	await op.estimateGas()
} catch (e: unknown) {
	console.log('handleOps', op.encodeHandleOpsDataWithDefaultGas())
	handleUserOpError(e)
}

setFixedVerificationGasLimitForZkProof(op)

console.log('generating proof...')
const opHash = op.hash()
console.log('opHash', opHash)

const { encodedProof } = await genProof(ARGS.eml, opHash)
op.setSignature(encodedProof)

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
