import { RPC_URL } from '../src/config'
import {
	MockToken__factory,
	EmailVerifier__factory,
	RoyaltyAutoClaim__factory,
	RoyaltyAutoClaimProxy__factory,
} from '../src/typechain-v2'
import { ethers, JsonRpcProvider, Wallet } from 'ethers'
import { DKIM_REGISTRY_ADDRESS } from '../src/lib/zkemail-utils'
import { SEMAPHORE_ADDRESS } from '../src/lib/semaphore-utils'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}

const CHAIN_ID = '84532'

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const dev = new Wallet(VITE_TEST_PRIVATE_KEY, client) // owner, admin

// Deploy MockToken
console.log('Deploying MockToken...')
const tokenFactory = new MockToken__factory(dev)
const token = await tokenFactory.deploy(dev.address, ethers.parseEther('2000'))
await token.waitForDeployment()
const tokenAddress = await token.getAddress()
console.log('token deployed to', tokenAddress)

// Deploy EmailVerifier
console.log('Deploying EmailVerifier...')
const EmailVerifier = new EmailVerifier__factory(dev)
const emailFromAddress = ethers.keccak256(ethers.toUtf8Bytes('johnson86tw@gmail.com'))
const emailVerifier = await EmailVerifier.deploy(DKIM_REGISTRY_ADDRESS, emailFromAddress)
await emailVerifier.waitForDeployment()
const registrationVerifierAddress = await emailVerifier.getAddress()
console.log('EmailVerifier deployed to', registrationVerifierAddress)

// Deploy RoyaltyAutoClaim Implementation
console.log('Deploying RoyaltyAutoClaim...')
const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(dev)
const impl = await RoyaltyAutoClaimFactory.deploy()
await impl.waitForDeployment()
const implAddress = await impl.getAddress()
console.log('RoyaltyAutoClaim implementation deployed to', implAddress)

// Wait for the code to be available on-chain
console.log('Verifying implementation has code...')
let codeCheckAttempts = 0
while (codeCheckAttempts < 10) {
	const code = await client.getCode(implAddress)
	if (code !== '0x') {
		console.log('Implementation code verified')
		break
	}
	console.log('Waiting for implementation code to be available...')
	await new Promise(resolve => setTimeout(resolve, 2000))
	codeCheckAttempts++
}

if (codeCheckAttempts === 10) {
	throw new Error('Implementation code not available after 10 attempts')
}

// Deploy RoyaltyAutoClaim Proxy
console.log('Deploying RoyaltyAutoClaim Proxy...')
const initData = impl.interface.encodeFunctionData('initialize', [
	dev.address,
	dev.address,
	tokenAddress,
	registrationVerifierAddress,
	SEMAPHORE_ADDRESS,
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

console.log('Done!')
