import { ContractTransactionResponse, ethers, hexlify, Interface } from 'ethers'
import { beforeAll, describe, expect, it } from 'vitest'
import { RoyaltyAutoClaim__factory } from '../typechain-types/factories/RoyaltyAutoClaim.sol/RoyaltyAutoClaim__factory'
import { RoyaltyAutoClaimProxy__factory } from '../typechain-types/factories/RoyaltyAutoClaimProxy__factory'
import { RoyaltyAutoClaim } from '../typechain-types/RoyaltyAutoClaim.sol/RoyaltyAutoClaim'

const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ACCOUNT_1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

describe('reviewSubmission', () => {
	let provider: ethers.Provider

	const token = hexlify(ethers.randomBytes(20))

	let owner: ethers.Wallet
	let admin: ethers.Wallet
	let reviewer: ethers.Wallet
	let submitter: ethers.Wallet

	let royaltyAutoClaim: RoyaltyAutoClaim

	beforeAll(async () => {
		// Connect to local network (adjust URL as needed)
		provider = new ethers.JsonRpcProvider('http://localhost:8545')

		// Create test accounts
		owner = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, provider)
		admin = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, provider)
		reviewer = new ethers.Wallet(ACCOUNT_1_PRIVATE_KEY, provider)
		submitter = new ethers.Wallet(ACCOUNT_1_PRIVATE_KEY, provider)

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
		const proxyAddress = await proxy.getAddress()

		// Verify deployments
		expect(implAddress).to.match(/^0x[0-9a-fA-F]{40}$/)
		expect(proxyAddress).to.match(/^0x[0-9a-fA-F]{40}$/)

		royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(proxyAddress, owner)
	}, 12000)

	it('should review a submission', async () => {
		const isReviewer = await royaltyAutoClaim.connect(admin).isReviewer(reviewer.address)
		console.log(isReviewer)
		await waitForTransaction(royaltyAutoClaim.connect(admin).registerSubmission('test', submitter.address))
		await waitForTransaction(royaltyAutoClaim.connect(reviewer).reviewSubmission('test', 20))
		const hasReviewed = await royaltyAutoClaim.hasReviewed('test', reviewer.address)
		expect(hasReviewed).to.be.true
	}, 12000)
})

async function waitForTransaction(promise: Promise<ContractTransactionResponse>) {
	try {
		const tx = await promise
		return await tx.wait()
	} catch (error: any) {
		if (error.transaction?.data) {
			const functionName = findSelector(error.transaction.data)
			const errorMessage = `${functionName || 'unknown function'}`

			if (error.data) {
				const errorName = findSelector(error.data, 'error')
				throw new Error(`${errorMessage} ${errorName || 'Unknown'} (${error.data})`)
			}
			throw new Error(errorMessage + ' ' + error.message)
		} else {
			throw error
		}
	}
}

function findSelector(data: string, type?: 'function' | 'error'): string | undefined {
	// Get the selector (first 4 bytes after '0x')
	const selector = data.startsWith('0x') ? data.slice(0, 10) : '0x' + data.slice(0, 8)

	const iface = new Interface(RoyaltyAutoClaim__factory.abi)

	// Get all fragments from the interface
	const fragments = iface.fragments.filter(f => !type || f.type === type)

	// Find matching fragment
	const matchingFragment = fragments.find(fragment => {
		let fragmentSelector: string | undefined
		try {
			if (fragment.type === 'function') {
				fragmentSelector = iface.getFunction(fragment.format('sighash'))?.selector
			} else if (fragment.type === 'error') {
				fragmentSelector = iface.getError(fragment.format('sighash'))?.selector
			}
		} catch {
			return false
		}
		return fragmentSelector === selector
	})

	return matchingFragment?.format('sighash') + ` (${selector})`
}
