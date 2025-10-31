import { ethers, JsonRpcProvider, Wallet } from 'ethers'
import { RPC_URL } from '../src/config'
import {
	MockToken__factory,
	RegistrationVerifier__factory,
	RoyaltyAutoClaim__factory,
	RoyaltyAutoClaimProxy__factory,
	StringUtils__factory,
} from '../src/typechain-v2'
import { DKIM_REGISTRY_ADDRESS } from '../src/lib/zkemail-utils'

export const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
export const ACCOUNT_1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

export async function deployContracts({
	chainId,
	privateKey,
	privateKey2,
}: {
	chainId: string
	privateKey: string
	privateKey2: string
}) {
	const client = new JsonRpcProvider(RPC_URL[chainId])
	const dev = new Wallet(privateKey, client) // owner, admin, reviewer
	const dev2 = new Wallet(privateKey2, client) // reviewer

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
	const emailSender = ethers.keccak256(ethers.toUtf8Bytes('johnson86tw'))
	const registrationVerifier = await RegistrationVerifier.deploy(DKIM_REGISTRY_ADDRESS, emailSender)
	await registrationVerifier.waitForDeployment()
	const registrationVerifierAddress = await registrationVerifier.getAddress()
	console.log('RegistrationVerifier deployed to', registrationVerifierAddress)

	// Deploy RoyaltyAutoClaim Implementation
	console.log('Deploying RoyaltyAutoClaim...')
	const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(dev)
	const impl = await RoyaltyAutoClaimFactory.deploy()
	await impl.waitForDeployment()
	const implAddress = await impl.getAddress()
	console.log('RoyaltyAutoClaim implementation deployed to', implAddress)

	// Wait for block confirmations to ensure block propagation
	console.log('Waiting for block confirmations...')
	const receipt = await impl.deploymentTransaction()?.wait(2)
	console.log(`Implementation confirmed at block ${receipt?.blockNumber}`)

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
	const racAddress = await proxy.getAddress()
	console.log('RoyaltyAutoClaim (proxy) deployed to', racAddress)

	// Give proxy address initial balance
	console.log('Giving proxy 0.001 ETH...')
	const tx = await dev.sendTransaction({
		to: racAddress,
		value: ethers.parseEther('0.001'),
		gasLimit: 100000, // Explicit gas limit for contract interaction
	})
	await tx.wait()

	// Send ERC20 tokens to proxy address
	console.log('Sending 1000 tokens to proxy...')
	const tx2 = await token.transfer(racAddress, ethers.parseEther('1000'))
	await tx2.wait()

	const royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(racAddress, dev)

	console.log('Done!')

	return {
		dev,
		dev2,
		token,
		tokenAddress,
		racAddress,
		registrationVerifier,
		royaltyAutoClaim,
		client,
	}
}
