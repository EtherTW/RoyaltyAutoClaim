import { BUNDLER_URL, RPC_URL } from '@/config'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import {
	MockToken,
	MockToken__factory,
	RoyaltyAutoClaim,
	RoyaltyAutoClaim__factory,
	RoyaltyAutoClaimProxy__factory,
} from '@/typechain-types'
import { ethers, parseEther } from 'ethers'
import { AlchemyBundler } from 'sendop'
import { describe, expect, it } from 'vitest'

const CHAIN_ID = '11155111'

export const DEV_PRIVATE_KEY = import.meta.env.VITE_DEV_PRIVATE_KEY
if (!DEV_PRIVATE_KEY) {
	throw new Error('DEV_PRIVATE_KEY is not set in .env')
}

export const DEV_PRIVATE_KEY_2 = import.meta.env.VITE_DEV_PRIVATE_KEY_2
if (!DEV_PRIVATE_KEY_2) {
	throw new Error('DEV_PRIVATE_KEY_2 is not set in .env')
}

const bundler = new AlchemyBundler(CHAIN_ID, BUNDLER_URL[CHAIN_ID])

describe('e2e-sepolia', () => {
	const client = new ethers.JsonRpcProvider(RPC_URL[CHAIN_ID])
	const account0 = new ethers.Wallet(DEV_PRIVATE_KEY, client) // owner, admin, reviewer
	const account1 = new ethers.Wallet(DEV_PRIVATE_KEY_2, client) // reviewer

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
			value: ethers.parseEther('0.1'),
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

	it('should claim the submission', async () => {
		const RACBalanceBefore = await token.balanceOf(proxyAddress)
		const recipientBalanceBefore = await token.balanceOf(recipient.address)

		const op = await royaltyAutoClaim4337
			.connect(recipient)
			.sendCalldata(royaltyAutoClaim.interface.encodeFunctionData('claimRoyalty', [title]))
		const receipt = await op.wait()
		expect(receipt.success).to.be.true

		const RACBalanceAfter = await token.balanceOf(proxyAddress)
		const recipientBalanceAfter = await token.balanceOf(recipient.address)

		expect(RACBalanceBefore - RACBalanceAfter).to.be.equal(parseEther('30'))
		expect(recipientBalanceAfter - recipientBalanceBefore).to.be.equal(parseEther('30'))
	})
})
