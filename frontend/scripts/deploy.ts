import { RPC_URL } from '../src/config'
import {
	MockToken__factory,
	RegistrationVerifier__factory,
	RoyaltyAutoClaim__factory,
	RoyaltyAutoClaimProxy__factory,
	StringUtils__factory,
} from '../src/typechain-v2'
import { ethers, JsonRpcProvider, Wallet } from 'ethers'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}

const CHAIN_ID = '84532'
const DKIM_REGISTRY_ADDRESS = '0x3D3935B3C030893f118a84C92C66dF1B9E4169d6'
const SEMAPHORE_ADDRESS = '0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D'

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const dev = new Wallet(VITE_TEST_PRIVATE_KEY, client) // owner, admin

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
	await new Promise((resolve) => setTimeout(resolve, 2000))
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
