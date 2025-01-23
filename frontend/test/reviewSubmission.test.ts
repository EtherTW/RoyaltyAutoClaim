import { ContractTransactionResponse, ethers, getBytes, hexlify, Interface, JsonRpcProvider, toBeHex } from 'ethers'
import { Execution, getEntryPointContract, PimlicoBundler, sendop, UserOp } from 'sendop'
import { beforeAll, describe, expect, it } from 'vitest'
import { RoyaltyAutoClaim, RoyaltyAutoClaim__factory, RoyaltyAutoClaimProxy__factory } from '../typechain-types'

const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ACCOUNT_1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

const RPC_URL = 'http://localhost:8545'
const BUNDLER_URL = 'http://localhost:4337'

describe('reviewSubmission', () => {
	let client: JsonRpcProvider

	const token = hexlify(ethers.randomBytes(20))

	let owner: ethers.Wallet
	let admin: ethers.Wallet
	let reviewer: ethers.Wallet
	let submitter: ethers.Wallet

	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim

	beforeAll(async () => {
		// Connect to local network (adjust URL as needed)
		client = new ethers.JsonRpcProvider(RPC_URL)

		// Create test accounts
		owner = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)
		admin = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)
		reviewer = new ethers.Wallet(ACCOUNT_1_PRIVATE_KEY, client)
		submitter = new ethers.Wallet(ACCOUNT_1_PRIVATE_KEY, client)

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
		await waitForTransaction(entryPointContract.depositTo(proxyAddress, { value: ethers.parseEther('0.1') }))

		console.log('proxyAddress', proxyAddress)
		console.log('owner', owner.address)
		console.log('admin', admin.address)
		console.log('reviewer', reviewer.address)
		console.log('submitter', submitter.address)
	}, 20_000)

	it('should review a submission', async () => {
		await waitForTransaction(royaltyAutoClaim.connect(admin).registerSubmission('test', submitter.address))
		await waitForTransaction(royaltyAutoClaim.connect(reviewer).reviewSubmission('test', 20))
		const hasReviewed = await royaltyAutoClaim.hasReviewed('test', reviewer.address)
		expect(hasReviewed).to.be.true
	}, 20_000)

	it.only('should review a submission by 4337 flow', async () => {
		const title = 'test4337'
		// wait for one second
		await new Promise(resolve => setTimeout(resolve, 1000))
		await waitForTransaction(royaltyAutoClaim.connect(admin).registerSubmission(title, submitter.address))

		const op = await sendop({
			bundler: new CustomBundler('11155111', BUNDLER_URL, reviewer),
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
					const nonceKey = 0
					const nonce: bigint = await getEntryPointContract(client).getNonce(proxyAddress, nonceKey)
					return toBeHex(nonce)
				},
				getCallData(executions: Execution[]) {
					return executions[0].data
				},
				async getDummySignature() {
					return '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c'
				},
				async getSignature(userOpHash: string) {
					const signature = await reviewer.signMessage(getBytes(userOpHash))
					return signature
				},
			},
		})

		await op.wait()

		const hasReviewed = await royaltyAutoClaim.hasReviewed(title, reviewer.address)
		expect(hasReviewed).to.be.true
	}, 20_000)
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

class CustomBundler extends PimlicoBundler {
	signer: ethers.Wallet
	client: JsonRpcProvider

	constructor(chainId: string, url: string, signer: ethers.Wallet) {
		super(chainId, url)
		this.signer = signer
		this.client = new JsonRpcProvider(url)
	}

	// override
	async getGasValues(userOp: UserOp) {
		const curGasPrice = await this.bundler.send({ method: 'pimlico_getUserOperationGasPrice' })
		if (!curGasPrice?.standard?.maxFeePerGas) {
			throw new Error('Invalid gas price response from bundler')
		}

		return {
			maxFeePerGas: curGasPrice.standard.maxFeePerGas,
			maxPriorityFeePerGas: curGasPrice.standard.maxPriorityFeePerGas,
			preVerificationGas: '0x186a0', // 100,000
			verificationGasLimit: '0xf4240', // 1,000,000
			callGasLimit: '0xf4240', // 1,000,000
			paymasterVerificationGasLimit: '0x0',
			paymasterPostOpGasLimit: '0x0',
		}
	}
}
