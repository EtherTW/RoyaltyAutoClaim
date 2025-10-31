import { JsonRpcProvider, Wallet } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import { ERC4337Bundler } from 'sendop'
import { BUNDLER_URL } from '../src/config'
import { buildUserOp, setFixedVerificationGasLimitForZkProof } from '../src/lib/erc4337-utils'
import { handleUserOpError } from '../src/lib/error'
import { genProof, makeDummyProof, parseEmailData } from '../src/lib/zkemail-utils'
import { IRoyaltyAutoClaim__factory, MockToken, RegistrationVerifier, RoyaltyAutoClaim } from '../src/typechain-v2'
import { deployContracts } from './test-utils'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}

const VITE_TEST_PRIVATE_KEY_2 = import.meta.env.VITE_TEST_PRIVATE_KEY_2
if (!VITE_TEST_PRIVATE_KEY_2) {
	throw new Error('VITE_TEST_PRIVATE_KEY_2 is not set')
}

/*

bun run test test/e2e-base-sepolia.test.ts

*/

const CHAIN_ID = '84532'

describe('e2e-base-sepolia', () => {
	const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID], undefined, {
		batchMaxCount: 1,
	})

	let dev: Wallet
	let dev2: Wallet
	let token: MockToken
	let tokenAddress: string
	let racAddress: string
	let registrationVerifier: RegistrationVerifier
	let royaltyAutoClaim: RoyaltyAutoClaim
	let client: JsonRpcProvider

	beforeAll(async () => {
		const deployData = await deployContracts({
			chainId: CHAIN_ID,
			privateKey: VITE_TEST_PRIVATE_KEY,
			privateKey2: VITE_TEST_PRIVATE_KEY_2,
		})
		dev = deployData.dev
		dev2 = deployData.dev2
		token = deployData.token
		tokenAddress = deployData.tokenAddress
		racAddress = deployData.racAddress
		registrationVerifier = deployData.registrationVerifier
		royaltyAutoClaim = deployData.royaltyAutoClaim
		client = deployData.client
	}, 60000)

	it('should register a submission', async () => {
		console.log('parsing email...')
		const eml = await fs.readFile(path.join(__dirname, '..', '..', 'emails', `registration.eml`), 'utf-8')
		const emailData = await parseEmailData(eml)

		console.log('building user op...')
		const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('registerSubmission', [
			emailData.title,
			emailData.recipient,
			emailData.headerHash,
		])

		const op = await buildUserOp({
			royaltyAutoClaimAddress: racAddress,
			chainId: CHAIN_ID,
			client,
			bundler,
			callData,
		})
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

		const { encodedProof } = await genProof(eml, opHash)
		op.setSignature(encodedProof)

		console.log('sending user op...')
		try {
			await op.send()
		} catch (e: unknown) {
			console.log('handleOps', op.encodeHandleOpsData())
			handleUserOpError(e)
		}

		const receipt = await op.wait()
		expect(receipt.success).toBe(true)
	})

	it('should update the recipient address', async () => {
		console.log('parsing email...')
		const eml = await fs.readFile(path.join(__dirname, '..', '..', 'emails', `recipient-update.eml`), 'utf-8')
		const emailData = await parseEmailData(eml)

		console.log('building user op...')
		const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('updateRoyaltyRecipient', [
			emailData.title,
			emailData.recipient,
			emailData.headerHash,
		])

		const op = await buildUserOp({
			royaltyAutoClaimAddress: racAddress,
			chainId: CHAIN_ID,
			client,
			bundler,
			callData,
		})
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

		const { encodedProof } = await genProof(eml, opHash)
		op.setSignature(encodedProof)

		console.log('sending user op...')
		try {
			await op.send()
		} catch (e: unknown) {
			console.log('handleOps', op.encodeHandleOpsData())
			handleUserOpError(e)
		}

		const receipt = await op.wait()
		expect(receipt.success).toBe(true)
	})
})
