import { concat, ethers, hexlify, JsonRpcProvider, toBeHex } from 'ethers'
import { Execution, getEntryPointContract, PimlicoBundler, sendop } from 'sendop'
import { beforeAll, describe, expect, it } from 'vitest'
import { RoyaltyAutoClaim, RoyaltyAutoClaim__factory, RoyaltyAutoClaimProxy__factory } from '../src/typechain-types'
import { waitForTransaction } from '../src/lib/ethers'

const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ACCOUNT_1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

const RPC_URL = 'http://localhost:8545'
const BUNDLER_URL = 'http://localhost:4337'

const CHAIN_ID = '11155111'

describe('reviewSubmission', () => {
	let client: JsonRpcProvider

	const token = hexlify(ethers.randomBytes(20))

	let owner: ethers.Wallet
	let admin: ethers.Wallet
	let reviewer: ethers.Wallet
	let recipient: ethers.Wallet

	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim

	beforeAll(async () => {
		// Connect to local network (adjust URL as needed)
		client = new ethers.JsonRpcProvider(RPC_URL)

		// Create test accounts
		owner = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)
		admin = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)
		reviewer = new ethers.Wallet(ACCOUNT_1_PRIVATE_KEY, client)
		recipient = new ethers.Wallet(ACCOUNT_1_PRIVATE_KEY, client)

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
			token,
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

		// wait for one second
		await new Promise(resolve => setTimeout(resolve, 1000))

		// // give proxy address some ether
		// const tx = await owner.sendTransaction({
		// 	to: proxyAddress,
		// 	value: ethers.parseEther('0.1'),
		// })
		// await tx.wait()

		const entryPointContract = getEntryPointContract(owner)
		await waitForTransaction(entryPointContract.depositTo(proxyAddress, { value: ethers.parseEther('1') }))

		console.log('proxyAddress', proxyAddress)
		console.log('owner', owner.address)
		console.log('admin', admin.address)
		console.log('reviewer', reviewer.address)
		console.log('recipient', recipient.address)
	}, 20_000)

	it('should review a submission', async () => {
		await waitForTransaction(royaltyAutoClaim.connect(admin).registerSubmission('test', recipient.address))
		await waitForTransaction(royaltyAutoClaim.connect(reviewer).reviewSubmission('test', 20))
		const hasReviewed = await royaltyAutoClaim.hasReviewed('test', reviewer.address)
		expect(hasReviewed).to.be.true
	}, 20_000)

	it.only('should review a submission by 4337 flow', async () => {
		const title = 'test4337'
		// wait for one second
		await new Promise(resolve => setTimeout(resolve, 1000))
		await waitForTransaction(royaltyAutoClaim.connect(admin).registerSubmission(title, recipient.address))

		const op = await sendop({
			bundler: new PimlicoBundler(CHAIN_ID, BUNDLER_URL),
			executions: [
				{
					to: proxyAddress,
					data: royaltyAutoClaim.interface.encodeFunctionData('reviewSubmission', [title, 20]),
					value: '0x0',
				},
			],
			opGetter: {
				getSender() {
					return proxyAddress
				},
				async getNonce() {
					const nonce: bigint = await getEntryPointContract(client).getNonce(proxyAddress, 0)
					return toBeHex(nonce)
				},
				getCallData(executions: Execution[]) {
					return executions[0].data
				},
				async getDummySignature() {
					return concat([
						'0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c',
						reviewer.address,
					])
				},
				async getSignature(userOpHash: Uint8Array) {
					const sig = await reviewer.signMessage(userOpHash)
					return concat([sig, reviewer.address])
				},
			},
		})

		await op.wait()

		const hasReviewed = await royaltyAutoClaim.hasReviewed(title, reviewer.address)
		expect(hasReviewed).to.be.true
	}, 20_000)
})
