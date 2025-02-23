import { BUNDLER_URL, CHAIN_ID, RPC_URL } from '@/config'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import { MockToken__factory, RoyaltyAutoClaim__factory, RoyaltyAutoClaimProxy__factory } from '@/typechain-types'
import { ethers } from 'ethers'
import { AlchemyBundler, PimlicoBundler } from 'sendop'

export const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
export const ACCOUNT_1_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

export async function deployContracts(chainId: CHAIN_ID, account0PrivateKey: string, account1PrivateKey: string) {
	const client = new ethers.JsonRpcProvider(RPC_URL[chainId])
	let bundler: PimlicoBundler | AlchemyBundler
	if (chainId === CHAIN_ID.LOCAL) {
		bundler = new PimlicoBundler(chainId, BUNDLER_URL[chainId])
	} else {
		bundler = new AlchemyBundler(chainId, BUNDLER_URL[chainId])
	}

	const account0 = new ethers.Wallet(account0PrivateKey, client) // owner, admin, reviewer
	const account1 = new ethers.Wallet(account1PrivateKey, client) // reviewer

	// Deploy MockToken
	const tokenFactory = new MockToken__factory(account0)
	const token = await tokenFactory.deploy(account0.address, ethers.parseEther('2000'))
	await token.waitForDeployment()
	const tokenAddress = await token.getAddress()

	console.log('token deployed to', tokenAddress)

	const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(account0)
	const RoyaltyAutoClaimProxyFactory = new RoyaltyAutoClaimProxy__factory(account0)

	// Deploy RoyaltyAutoClaim Implementation
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
	const proxyAddress = await proxy.getAddress()

	// Give proxy address 0.1 ether
	const tx = await account0.sendTransaction({
		to: proxyAddress,
		value: ethers.parseEther('0.1'),
	})
	await tx.wait()

	// Send ERC20 tokens to proxy address
	const tx2 = await token.transfer(proxyAddress, ethers.parseEther('1000'))
	await tx2.wait()

	console.log('RoyaltyAutoClaim (proxy) deployed to', proxyAddress)

	const royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(proxyAddress, account0)
	const royaltyAutoClaim4337 = new RoyaltyAutoClaim4337({
		sender: proxyAddress,
		client,
		bundler,
		signer: account0,
	})

	return {
		account0,
		account1,
		token,
		tokenAddress,
		proxyAddress,
		royaltyAutoClaim,
		royaltyAutoClaim4337,
		client,
	}
}
