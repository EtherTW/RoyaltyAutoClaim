import { formatErrMsg, normalizeError } from '@/lib/error'
import { faker } from '@faker-js/faker'
import { concat, JsonRpcProvider, JsonRpcSigner, toBeHex, Wallet } from 'ethers'
import {
	Bundler,
	Execution,
	getEntryPointContract,
	OperationGetter,
	PimlicoBundler,
	sendop,
	SendOpResult,
	UserOpReceipt,
} from 'sendop'
import { describe, expect, it } from 'vitest'
import { RoyaltyAutoClaim__factory } from '../src/typechain-types'

const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS = '0xa818cA7A4869c7C7101d0Ea5E4c455Ef00e698d5'

const CHAIN_ID = '1337'
const RPC_URL = 'http://localhost:8545'
const BUNDLER_URL = 'http://localhost:4337'

const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ACCOUNT_1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const account0 = new Wallet(ACCOUNT_0_PRIVATE_KEY, new JsonRpcProvider(RPC_URL))
const account1 = new Wallet(ACCOUNT_1_PRIVATE_KEY, new JsonRpcProvider(RPC_URL))

const royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS,
	new JsonRpcProvider(RPC_URL),
)

class RoyaltyAutoClaim4337 implements OperationGetter {
	client: JsonRpcProvider
	bundler: Bundler
	signer: JsonRpcSigner

	constructor(options: { client: JsonRpcProvider; bundler: Bundler; signer: JsonRpcSigner }) {
		this.client = options.client
		this.bundler = options.bundler
		this.signer = options.signer
	}

	async sendCalldata(calldata: string): Promise<SendOpResult> {
		return await sendop({
			bundler: this.bundler,
			executions: [{ to: ROYALTY_AUTO_CLAIM_PROXY_ADDRESS, data: calldata, value: '0x0' }],
			opGetter: this,
		})
	}

	getSender() {
		return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS
	}

	async getNonce() {
		const nonce: bigint = await getEntryPointContract(this.client).getNonce(ROYALTY_AUTO_CLAIM_PROXY_ADDRESS, 0)
		return toBeHex(nonce)
	}

	getCallData(executions: Execution[]) {
		return executions[0].data
	}

	async getDummySignature() {
		return concat([
			'0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c',
			this.signer.address,
		])
	}

	async getSignature(userOpHash: Uint8Array) {
		const sig = await this.signer.signMessage(userOpHash)
		return concat([sig, this.signer.address])
	}
}

const account0RoyaltyAutoClaim4337 = new RoyaltyAutoClaim4337({
	client: new JsonRpcProvider(RPC_URL),
	bundler: new PimlicoBundler(CHAIN_ID, BUNDLER_URL),
	signer: account0 as unknown as JsonRpcSigner,
})

const account1RoyaltyAutoClaim4337 = new RoyaltyAutoClaim4337({
	client: new JsonRpcProvider(RPC_URL),
	bundler: new PimlicoBundler(CHAIN_ID, BUNDLER_URL),
	signer: account1 as unknown as JsonRpcSigner,
})

const randomTitle = faker.lorem.words(5)

const createReviewPromise1 = () => {
	return new Promise<UserOpReceipt>((resolve, reject) => {
		console.log('account0 reviewing submission')
		account0RoyaltyAutoClaim4337
			.sendCalldata(royaltyAutoClaim.interface.encodeFunctionData('reviewSubmission', [randomTitle, '20']))
			.then(op => op.wait())
			.then(op => resolve(op))
			.catch(error => reject(error))
	})
}

const createReviewPromise2 = () => {
	return new Promise<UserOpReceipt>((resolve, reject) => {
		console.log('account1 reviewing submission')
		account1RoyaltyAutoClaim4337
			.sendCalldata(royaltyAutoClaim.interface.encodeFunctionData('reviewSubmission', [randomTitle, '40']))
			.then(op => op.wait())
			.then(op => resolve(op))
			.catch(error => reject(error))
	})
}

describe('send2op', () => {
	it('should send 2 op', async () => {
		let results: PromiseSettledResult<UserOpReceipt>[] = []
		try {
			console.log('registering submission')
			const op = await account0RoyaltyAutoClaim4337.sendCalldata(
				royaltyAutoClaim.interface.encodeFunctionData('registerSubmission', [
					randomTitle,
					'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
				]),
			)

			await op.wait()

			console.log('start reviewing')
			results = await Promise.allSettled([createReviewPromise1(), createReviewPromise2()])
			console.log('results', results)
		} catch (error: unknown) {
			const err = normalizeError(error)
			throw new Error(formatErrMsg(err))
		}

		expect(results[0].status).toBe('fulfilled')
		expect(results[1].status).toBe('fulfilled')
	})
})
