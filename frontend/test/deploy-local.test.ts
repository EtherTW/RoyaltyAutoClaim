import { waitForTransaction } from '@/lib/ethers'
import { ethers, hexlify, JsonRpcProvider } from 'ethers'
import { getEntryPointContract } from 'sendop'
import { RoyaltyAutoClaim, RoyaltyAutoClaim__factory, RoyaltyAutoClaimProxy__factory } from '@/typechain-types'
import { describe, expect, it } from 'vitest'

const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const RPC_URL = 'http://localhost:8545'
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

describe('deploy', () => {
	let client: JsonRpcProvider
	let owner: ethers.Wallet
	let admin: ethers.Wallet
	let reviewer: ethers.Wallet

	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim

	it('should deploy RoyaltyAutoClaim to local network', async () => {
		// Connect to local network (adjust URL as needed)
		client = new ethers.JsonRpcProvider(RPC_URL)

		// Create test accounts
		owner = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)
		admin = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)
		reviewer = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)

		// Deploy implementation contract
		const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(owner)
		const RoyaltyAutoClaimProxyFactory = new RoyaltyAutoClaimProxy__factory(owner)

		const impl = await RoyaltyAutoClaimFactory.deploy()
		await impl.waitForDeployment()

		const implAddress = await impl.getAddress()

		// Prepare initialization parameters
		const reviewers: string[] = [reviewer.address]
		const initData = impl.interface.encodeFunctionData('initialize', [
			owner.address,
			admin.address,
			NATIVE_TOKEN,
			reviewers,
		])

		// Deploy proxy contract
		const proxy = await RoyaltyAutoClaimProxyFactory.deploy(implAddress, initData)
		await proxy.waitForDeployment()
		proxyAddress = await proxy.getAddress()

		// Verify deployments
		expect(implAddress).to.match(/^0x[0-9a-fA-F]{40}$/)
		expect(proxyAddress).to.match(/^0x[0-9a-fA-F]{40}$/)

		royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(proxyAddress, owner)

		// // give proxy address some ether
		const tx = await owner.sendTransaction({
			to: proxyAddress,
			value: ethers.parseEther('1'),
		})
		await tx.wait()

		const entryPointContract = getEntryPointContract(owner)
		await waitForTransaction(entryPointContract.depositTo(proxyAddress, { value: ethers.parseEther('1') }))

		console.log('RoyaltyAutoClaim (proxy) deployed to', proxyAddress)
	}, 20_000)
})
