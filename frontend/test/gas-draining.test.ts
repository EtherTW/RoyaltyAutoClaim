import { formatErrMsg, normalizeError } from '@/lib/error'
import { faker } from '@faker-js/faker'
import { concat, formatUnits, JsonRpcProvider, JsonRpcSigner, toBeHex, Wallet } from 'ethers'
import {
	Bundler,
	Execution,
	getEntryPointContract,
	OperationGetter,
	PimlicoBundler,
	sendop,
	SendOpResult,
	UserOp,
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

class BundlerWithoutEstimation extends PimlicoBundler {
	constructor(chainId: string, url: string) {
		super(chainId, url)
	}

	async getGasValues(_userOp: UserOp) {
		return {
			maxFeePerGas: toBeHex(999_999),
			maxPriorityFeePerGas: toBeHex(999_999),
			preVerificationGas: toBeHex(99_999),
			verificationGasLimit: toBeHex(999_999),
			callGasLimit: toBeHex(999_999),
			paymasterVerificationGasLimit: toBeHex(999_999),
			paymasterPostOpGasLimit: toBeHex(999_999),
		}
	}
}

const client = new JsonRpcProvider(RPC_URL)
const pimlicoBundler = new PimlicoBundler(CHAIN_ID, BUNDLER_URL)
const bundlerWithoutEstimation = new BundlerWithoutEstimation(CHAIN_ID, BUNDLER_URL)

const account0RoyaltyAutoClaim4337 = new RoyaltyAutoClaim4337({
	client,
	bundler: pimlicoBundler,
	signer: account0 as unknown as JsonRpcSigner,
})

const account1RoyaltyAutoClaim4337 = new RoyaltyAutoClaim4337({
	client,
	bundler: bundlerWithoutEstimation,
	signer: account1 as unknown as JsonRpcSigner,
})

const randomTitle = faker.lorem.words(5)

describe('gas-draining', () => {
	it('cannot drain gas', async () => {
		try {
			console.log('registering submission')
			let op = await account0RoyaltyAutoClaim4337.sendCalldata(
				royaltyAutoClaim.interface.encodeFunctionData('registerSubmission', [
					randomTitle,
					'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
				]),
			)

			await op.wait()

			const entryPoint = getEntryPointContract(client)
			const entryPointBalanceOf: bigint = await entryPoint.balanceOf(ROYALTY_AUTO_CLAIM_PROXY_ADDRESS)

			console.log('entryPoint balance of RAC', entryPointBalanceOf)

			console.log('claiming royalty')
			op = await account1RoyaltyAutoClaim4337.sendCalldata(
				royaltyAutoClaim.interface.encodeFunctionData('claimRoyalty', [randomTitle]),
			)
			await op.wait()

			const entryPointBalanceOfAfter: bigint = await entryPoint.balanceOf(ROYALTY_AUTO_CLAIM_PROXY_ADDRESS)
			console.log('entryPoint balance of RAC after', entryPointBalanceOfAfter)

			console.log('entryPoint balance of RAC diff', entryPointBalanceOf - entryPointBalanceOfAfter)
			console.log(
				'entryPoint balance of RAC diff in gwei',
				formatUnits(entryPointBalanceOf - entryPointBalanceOfAfter, 'gwei'),
				'gwei',
			)

			expect(entryPointBalanceOf - entryPointBalanceOfAfter).toBe(0n)
		} catch (error: unknown) {
			const err = normalizeError(error)
			throw new Error(formatErrMsg(err))
		}
	})
})
