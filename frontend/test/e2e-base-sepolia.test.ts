import { BUNDLER_URL, RPC_URL } from '@/config'
import {
	MockToken__factory,
	RegistrationVerifier__factory,
	RoyaltyAutoClaim,
	RoyaltyAutoClaim__factory,
	RoyaltyAutoClaimProxy__factory,
	StringUtils__factory,
} from '@/typechain-v2'
import { ethers, Wallet } from 'ethers'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}

const VITE_TEST_PRIVATE_KEY_2 = import.meta.env.VITE_TEST_PRIVATE_KEY_2
if (!VITE_TEST_PRIVATE_KEY_2) {
	throw new Error('VITE_TEST_PRIVATE_KEY_2 is not set')
}

/*

bun run test test/e2e-base-sepolia.test.ts

*/

describe('e2e-base-sepolia', () => {
	const CHAIN_ID = '84532'
	const client = new ethers.JsonRpcProvider(RPC_URL[CHAIN_ID])
	const dev = new Wallet(VITE_TEST_PRIVATE_KEY, client) // owner, admin, reviewer
	const dev2 = new Wallet(VITE_TEST_PRIVATE_KEY_2, client) // reviewer
	// const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID])

	let royaltyAutoClaim: RoyaltyAutoClaim

	it('should deploy contracts', async () => {
		// Deploy MockToken
		console.log('Deploying MockToken...')
		const tokenFactory = new MockToken__factory(dev)
		const token = await tokenFactory.deploy(dev.address, ethers.parseEther('2000'))
		await token.waitForDeployment()
		const tokenAddress = await token.getAddress()
		console.log('token deployed to', tokenAddress)

		// Deploy StringUtils
		console.log('Deploying StringUtils...')
		const stringUtils = await new StringUtils__factory(dev).deploy()
		await stringUtils.waitForDeployment()
		const stringUtilsAddress = await stringUtils.getAddress()

		// Deploy RegistrationVerifier
		console.log('Deploying RegistrationVerifier...')
		const RegistrationVerifier = new RegistrationVerifier__factory(
			{
				'lib/zk-email-verify/packages/contracts/utils/StringUtils.sol:StringUtils': stringUtilsAddress,
			},
			dev,
		)
		const dkimRegistryAddress = '0x3D3935B3C030893f118a84C92C66dF1B9E4169d6'
		const emailSender = ethers.keccak256(ethers.toUtf8Bytes('johnson86tw'))
		const registrationVerifier = await RegistrationVerifier.deploy(dkimRegistryAddress, emailSender)
		await registrationVerifier.waitForDeployment()
		const registrationVerifierAddress = await registrationVerifier.getAddress()
		console.log('RegistrationVerifier deployed to', registrationVerifierAddress)

		// Deploy RoyaltyAutoClaim Implementation
		console.log('Deploying RoyaltyAutoClaim...')
		const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(dev)
		const impl = await RoyaltyAutoClaimFactory.deploy()
		await impl.waitForDeployment()
		const implAddress = await impl.getAddress()

		// Deploy RoyaltyAutoClaim Proxy
		console.log('Deploying RoyaltyAutoClaim Proxy...')
		const initData = impl.interface.encodeFunctionData('initialize', [
			dev.address,
			dev.address,
			tokenAddress,
			[dev.address, dev2.address],
			registrationVerifierAddress,
		])
		const RoyaltyAutoClaimProxyFactory = new RoyaltyAutoClaimProxy__factory(dev)
		const proxy = await RoyaltyAutoClaimProxyFactory.deploy(implAddress, initData)
		await proxy.waitForDeployment()
		const proxyAddress = await proxy.getAddress()

		// Give proxy address initial balance
		console.log('Giving proxy 0.001 ETH...')
		const tx = await dev.sendTransaction({
			to: proxyAddress,
			value: ethers.parseEther('0.001'),
		})
		await tx.wait()

		// Send ERC20 tokens to proxy address
		console.log('Sending 1000 tokens to proxy...')
		const tx2 = await token.transfer(proxyAddress, ethers.parseEther('1000'))
		await tx2.wait()

		console.log('RoyaltyAutoClaim (proxy) deployed to', proxyAddress)

		royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(proxyAddress, dev)
	})
})
