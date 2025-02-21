import { BUNDLER_URL, RPC_URL } from '@/config'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import {
	MockToken,
	MockToken__factory,
	RoyaltyAutoClaim,
	RoyaltyAutoClaim__factory,
	RoyaltyAutoClaimProxy__factory,
} from '@/typechain-types'
import { ethers, parseEther, toBeHex } from 'ethers'
import { ENTRY_POINT_V07, PimlicoBundler, PimlicoBundlerError, sendop, UserOp } from 'sendop'
import { describe, expect, it } from 'vitest'

const CHAIN_ID = '1337'

const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ACCOUNT_1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

const bundler = new PimlicoBundler(CHAIN_ID, BUNDLER_URL[CHAIN_ID])

describe('gas-draining', () => {
	const client = new ethers.JsonRpcProvider(RPC_URL[CHAIN_ID])
	const account0 = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client) // owner, admin, reviewer
	const account1 = new ethers.Wallet(ACCOUNT_1_PRIVATE_KEY, client) // reviewer

	let royaltyAutoClaim: RoyaltyAutoClaim
	let proxyAddress: string

	let token: MockToken
	let tokenAddress: string

	let royaltyAutoClaim4337: RoyaltyAutoClaim4337

	const title = 'test'
	const recipient = account1

	it('should deploy MockToken and RoyaltyAutoClaim', async () => {
		const tokenFactory = new MockToken__factory(account0)
		token = await tokenFactory.deploy(account0.address, ethers.parseEther('2000'))
		await token.waitForDeployment()
		tokenAddress = await token.getAddress()
		expect(tokenAddress).to.match(/^0x[0-9a-fA-F]{40}$/)
		console.log('token deployed to', tokenAddress)

		const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(account0)
		const RoyaltyAutoClaimProxyFactory = new RoyaltyAutoClaimProxy__factory(account0)

		const impl = await RoyaltyAutoClaimFactory.deploy()
		await impl.waitForDeployment()
		const implAddress = await impl.getAddress()

		const initData = impl.interface.encodeFunctionData('initialize', [
			account0.address,
			account0.address,
			tokenAddress,
			[account0.address, account1.address],
		])

		// Deploy RoyaltyAutoClaim Proxy
		const proxy = await RoyaltyAutoClaimProxyFactory.deploy(implAddress, initData)
		await proxy.waitForDeployment()
		proxyAddress = await proxy.getAddress()

		expect(implAddress).to.match(/^0x[0-9a-fA-F]{40}$/)
		expect(proxyAddress).to.match(/^0x[0-9a-fA-F]{40}$/)

		// give proxy address some ether
		const tx = await account0.sendTransaction({
			to: proxyAddress,
			value: ethers.parseEther('1'),
		})
		await tx.wait()

		// send erc20 tokens to proxy address
		const tx2 = await token.transfer(proxyAddress, ethers.parseEther('1000'))
		await tx2.wait()

		console.log('RoyaltyAutoClaim (proxy) deployed to', proxyAddress)

		// assert proxy address has 100 tokens
		const balance = await token.balanceOf(proxyAddress)
		expect(balance).to.equal(ethers.parseEther('1000'))

		royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(proxyAddress, account0)
		royaltyAutoClaim4337 = new RoyaltyAutoClaim4337({
			sender: proxyAddress,
			client,
			bundler,
			signer: account0,
		})
	})

	it('should submit a submission', async () => {
		const op = await royaltyAutoClaim4337.sendCalldata(
			royaltyAutoClaim.interface.encodeFunctionData('registerSubmission', [title, recipient.address]),
		)
		const receipt = await op.wait()
		expect(receipt.success).to.be.true
	})

	it('should review the submission', async () => {
		let op = await royaltyAutoClaim4337.sendCalldata(
			royaltyAutoClaim.interface.encodeFunctionData('reviewSubmission', [title, '20']),
		)
		let receipt = await op.wait()
		expect(receipt.success).to.be.true

		op = await royaltyAutoClaim4337
			.connect(account1)
			.sendCalldata(royaltyAutoClaim.interface.encodeFunctionData('reviewSubmission', [title, '40']))
		receipt = await op.wait()
		expect(receipt.success).to.be.true
	})

	it('would send reverted transaction in execution phase', async () => {
		const RACBalanceBefore = await client.getBalance(proxyAddress)

		// Run the gas draining operation multiple times
		const numAttempts = 1
		for (let i = 0; i < numAttempts; i++) {
			console.log(`Attempt ${i + 1}/${numAttempts}`)

			const op = await sendop({
				bundler: new GasDrainingBundler(CHAIN_ID, BUNDLER_URL[CHAIN_ID]),
				executions: [
					{
						to: proxyAddress,
						value: '0x0',
						data: royaltyAutoClaim.interface.encodeFunctionData('claimRoyalty', [title]),
					},
				],
				opGetter: royaltyAutoClaim4337.connect(recipient),
			})

			const receipt = await op.wait()
			expect(receipt.success).to.be.false
		}

		const RACBalanceAfter = await client.getBalance(proxyAddress)
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
			callGasLimit: '0x1387f',
		}
	}
}
