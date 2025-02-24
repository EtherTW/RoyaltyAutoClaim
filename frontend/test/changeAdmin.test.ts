import { BUNDLER_URL, CHAIN_ID } from '@/config'
import { formatErrMsg, normalizeError } from '@/lib/error'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import { MockToken, RoyaltyAutoClaim } from '@/typechain-types'
import { ethers } from 'ethers'
import { PimlicoBundler, PimlicoBundlerError, sendop, UserOp } from 'sendop'
import { beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_0_PRIVATE_KEY, ACCOUNT_1_PRIVATE_KEY, deployContracts } from './test-utils'

const chainId = CHAIN_ID.LOCAL

describe('changeAdmin', () => {
	let account0: ethers.Wallet
	let account1: ethers.Wallet
	let token: MockToken
	let tokenAddress: string
	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim
	let royaltyAutoClaim4337: RoyaltyAutoClaim4337

	beforeAll(async () => {
		const data = await deployContracts(chainId, ACCOUNT_0_PRIVATE_KEY, ACCOUNT_1_PRIVATE_KEY)
		account0 = data.account0
		account1 = data.account1
		token = data.token
		tokenAddress = data.tokenAddress
		proxyAddress = data.proxyAddress
		royaltyAutoClaim = data.royaltyAutoClaim
		royaltyAutoClaim4337 = data.royaltyAutoClaim4337
	}, 100_000)

	it('should change admin', async () => {
		try {
			const op = await sendop({
				bundler: new SkipEstimationBundler(CHAIN_ID.LOCAL, BUNDLER_URL[CHAIN_ID.LOCAL]),
				executions: [
					{
						to: proxyAddress,
						data: royaltyAutoClaim.interface.encodeFunctionData('changeAdmin', [account1.address]),
						value: '0x0',
					},
				],
				opGetter: royaltyAutoClaim4337,
			})
			const receipt = await op.wait()
			expect(receipt.success).to.be.true
		} catch (e: unknown) {
			const err = normalizeError(e)
			throw new Error(formatErrMsg(err))
		}
	})

	it.skip('cannot change admin if not owner', async () => {
		try {
			const op = await royaltyAutoClaim4337
				.connect(account1)
				.sendCalldata(royaltyAutoClaim.interface.encodeFunctionData('changeAdmin', [account0.address]))
			const receipt = await op.wait()
			expect(receipt.success).to.be.false
		} catch (e: unknown) {
			const err = normalizeError(e)
			throw new Error(formatErrMsg(err))
		}
	})
})

class SkipEstimationBundler extends PimlicoBundler {
	constructor(chainId: string, url: string) {
		super(chainId, url)
	}

	async getGasValues(userOp: UserOp) {
		// Get gas price
		const curGasPrice = await this.bundler.send({ method: 'pimlico_getUserOperationGasPrice' })
		if (!curGasPrice?.standard?.maxFeePerGas) {
			throw new PimlicoBundlerError('Invalid gas price response from bundler')
		}

		const gasValues = {
			maxFeePerGas: userOp.maxFeePerGas,
			maxPriorityFeePerGas: curGasPrice.standard.maxPriorityFeePerGas,
			preVerificationGas: '0xf423f', // 999_999
			verificationGasLimit: '0xf423f',
			callGasLimit: '0xf423f',
			paymasterVerificationGasLimit: '0xf423f',
			paymasterPostOpGasLimit: '0xf423f',
		}

		return gasValues
	}
}
