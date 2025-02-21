import {
	MockToken,
	MockToken__factory,
	RoyaltyAutoClaim__factory,
	RoyaltyAutoClaimProxy__factory,
} from '@/typechain-types'
import { ethers, JsonRpcProvider } from 'ethers'
import { beforeAll, describe, expect, it } from 'vitest'

const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ACCOUNT_1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const RPC_URL = 'http://localhost:8545'

describe('deploy-local', () => {
	let client: JsonRpcProvider
	let account0: ethers.Wallet
	let account1: ethers.Wallet

	let erc20: MockToken
	let erc20Address: string

	let proxyAddress: string

	beforeAll(async () => {
		client = new ethers.JsonRpcProvider(RPC_URL)
		account0 = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)
		account1 = new ethers.Wallet(ACCOUNT_1_PRIVATE_KEY, client)
	})

	it('should deploy erc20 token', async () => {
		const erc20Factory = new MockToken__factory(account0)
		erc20 = await erc20Factory.deploy(account0.address, ethers.parseEther('2000'))
		await erc20.waitForDeployment()
		erc20Address = await erc20.getAddress()
		expect(erc20Address).to.match(/^0x[0-9a-fA-F]{40}$/)
		console.log('erc20 token deployed to', erc20Address)
	})

	it('should deploy RoyaltyAutoClaim to local network', async () => {
		const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(account0)
		const RoyaltyAutoClaimProxyFactory = new RoyaltyAutoClaimProxy__factory(account0)

		// deploy RoyaltyAutoClaim
		const impl = await RoyaltyAutoClaimFactory.deploy()
		await impl.waitForDeployment()

		const implAddress = await impl.getAddress()

		expect(erc20Address).to.match(/^0x[0-9a-fA-F]{40}$/)

		const initData = impl.interface.encodeFunctionData('initialize', [
			account0.address, // owner
			account0.address, // admin
			erc20Address,
			[account0.address, account1.address], // reviewers
		])

		// Deploy RoyaltyAutoClaim proxy
		const proxy = await RoyaltyAutoClaimProxyFactory.deploy(implAddress, initData)
		await proxy.waitForDeployment()
		proxyAddress = await proxy.getAddress()

		// Verify deployments
		expect(implAddress).to.match(/^0x[0-9a-fA-F]{40}$/)
		expect(proxyAddress).to.match(/^0x[0-9a-fA-F]{40}$/)

		// give proxy address some ether
		const tx = await account0.sendTransaction({
			to: proxyAddress,
			value: ethers.parseEther('1'),
		})
		await tx.wait()

		// send erc20 tokens to proxy address
		const tx2 = await erc20.transfer(proxyAddress, ethers.parseEther('1000'))
		await tx2.wait()

		console.log('RoyaltyAutoClaim (proxy) deployed to', proxyAddress)

		// assert proxy address has 100 erc20 tokens
		const balance = await erc20.balanceOf(proxyAddress)
		expect(balance).to.equal(ethers.parseEther('1000'))
	}, 20_000)
})
