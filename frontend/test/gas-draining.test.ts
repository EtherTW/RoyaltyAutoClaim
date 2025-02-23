import { BUNDLER_URL, CHAIN_ID } from '@/config'
import { formatErrMsg, normalizeError } from '@/lib/error'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import { MockToken, RoyaltyAutoClaim } from '@/typechain-types'
import { ethers } from 'ethers'
import { ENTRY_POINT_V07, getEntryPointContract, PimlicoBundler, PimlicoBundlerError, sendop, UserOp } from 'sendop'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_0_PRIVATE_KEY, ACCOUNT_1_PRIVATE_KEY, deployContracts } from './test-utils'

describe('gas-draining', () => {
	let account0: ethers.Wallet
	let account1: ethers.Wallet
	let token: MockToken
	let tokenAddress: string
	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim
	let royaltyAutoClaim4337: RoyaltyAutoClaim4337
	let client: ethers.JsonRpcProvider

	it('should deploy contracts', async () => {
		const data = await deployContracts(CHAIN_ID.LOCAL, ACCOUNT_0_PRIVATE_KEY, ACCOUNT_1_PRIVATE_KEY)
		account0 = data.account0
		account1 = data.account1
		token = data.token
		tokenAddress = data.tokenAddress
		proxyAddress = data.proxyAddress
		royaltyAutoClaim = data.royaltyAutoClaim
		royaltyAutoClaim4337 = data.royaltyAutoClaim4337
		client = data.client
	}, 100_000)

	it('should submit a submission', async () => {
		try {
			const op = await royaltyAutoClaim4337.sendCalldata(
				royaltyAutoClaim.interface.encodeFunctionData('registerSubmission', ['test_title', account0.address]),
			)
			const receipt = await op.wait()
			expect(receipt.success).to.be.true
		} catch (e: unknown) {
			const err = normalizeError(e)
			throw new Error(formatErrMsg(err))
		}
	})

	it('should review the submission', async () => {
		try {
			let op = await royaltyAutoClaim4337.sendCalldata(
				royaltyAutoClaim.interface.encodeFunctionData('reviewSubmission', ['test_title', '20']),
			)
			let receipt = await op.wait()
			expect(receipt.success).to.be.true

			op = await royaltyAutoClaim4337
				.connect(account1)
				.sendCalldata(royaltyAutoClaim.interface.encodeFunctionData('reviewSubmission', ['test_title', '40']))
			receipt = await op.wait()
			expect(receipt.success).to.be.true
		} catch (e: unknown) {
			const err = normalizeError(e)
			throw new Error(formatErrMsg(err))
		}
	})

	it('would send reverted transaction in execution phase', async () => {
		const entryPoint = getEntryPointContract(client)
		const RACBalanceBefore = await entryPoint.balanceOf(proxyAddress)

		// Run the gas draining operation multiple times
		const numAttempts = 1
		for (let i = 0; i < numAttempts; i++) {
			console.log(`Attempt ${i + 1}/${numAttempts}`)

			const op = await sendop({
				bundler: new GasDrainingBundler(CHAIN_ID.LOCAL, BUNDLER_URL[CHAIN_ID.LOCAL]),
				executions: [
					{
						to: proxyAddress,
						value: '0x0',
						data: royaltyAutoClaim.interface.encodeFunctionData('claimRoyalty', ['test_title']),
					},
				],
				opGetter: royaltyAutoClaim4337.connect(account0),
			})

			const receipt = await op.wait()
			expect(receipt.success).to.be.false
		}

		const RACBalanceAfter = await entryPoint.balanceOf(proxyAddress)
		console.log('RAC ETH Balance Diff', RACBalanceBefore - RACBalanceAfter)
		expect(RACBalanceBefore - RACBalanceAfter).to.be.greaterThan(0)
	})
})

class GasDrainingBundler extends PimlicoBundler {
	constructor(chainId: string, url: string) {
		super(chainId, url)
	}

	async getGasValues(userOp: UserOp) {
		// Get gas price
		const curGasPrice = await this.bundler.send({ method: 'pimlico_getUserOperationGasPrice' })
		if (!curGasPrice?.standard?.maxFeePerGas) {
			throw new PimlicoBundlerError('Invalid gas price response from bundler')
		}

		// Set and estimate gas
		userOp.maxFeePerGas = curGasPrice.standard.maxFeePerGas
		const estimateGas = await this.bundler.send({
			method: 'eth_estimateUserOperationGas',
			params: [userOp, ENTRY_POINT_V07],
		})
		if (!estimateGas) {
			throw new PimlicoBundlerError('Empty response from gas estimation')
		}

		// Validate estimation results
		const requiredFields = ['preVerificationGas', 'verificationGasLimit', 'callGasLimit']
		for (const field of requiredFields) {
			if (!(field in estimateGas)) {
				throw new PimlicoBundlerError(`Missing required gas estimation field: ${field}`)
			}
		}

		const gasValues = {
			maxFeePerGas: userOp.maxFeePerGas,
			maxPriorityFeePerGas: curGasPrice.standard.maxPriorityFeePerGas,
			preVerificationGas: estimateGas.preVerificationGas,
			verificationGasLimit: estimateGas.verificationGasLimit,
			callGasLimit: estimateGas.callGasLimit,
			paymasterVerificationGasLimit: estimateGas.paymasterVerificationGasLimit,
			paymasterPostOpGasLimit: estimateGas.paymasterPostOpGasLimit,
		}

		return {
			...gasValues,
			callGasLimit: '0x1',
		}
	}
}
