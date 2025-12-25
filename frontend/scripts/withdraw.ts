import { formatEther, isAddress, JsonRpcProvider, Wallet } from 'ethers'
import { IERC20__factory } from 'sendop'
import { RPC_URL } from '../src/config'
import { RoyaltyAutoClaim__factory } from '../src/typechain-v2'
import { confirm } from './utils'

const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}

const racAddress = process.argv[2]
if (!racAddress) {
	console.error('Please provide a RoyaltyAutoClaim address as an argument')
	process.exit(1)
}

let tokenAddress = process.argv[3]
if (!tokenAddress) {
	tokenAddress = NATIVE_TOKEN_ADDRESS
}

const CHAIN_ID = '84532'

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const dev = new Wallet(VITE_TEST_PRIVATE_KEY, client)

const rac = RoyaltyAutoClaim__factory.connect(racAddress, dev)

console.log('Token Address', await rac.token())

if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
	const balance = await client.getBalance(rac)
	if (balance === 0n) {
		console.log('No balance to withdraw')
		process.exit(0)
	}
	await confirm(
		`\nNative token balance: ${formatEther(balance)} ETH\nWithdrawing from: ${racAddress}\nTo: ${dev.address}\n`,
	)
	console.log('withdrawing...')
	const tx = await rac.emergencyWithdraw(NATIVE_TOKEN_ADDRESS, balance)
	const receipt = await tx.wait()
	console.log('tx', receipt?.hash)
	process.exit(0)
} else if (isAddress(tokenAddress)) {
	const token = IERC20__factory.connect(tokenAddress, dev)
	const balance = await token.balanceOf(rac)
	if (balance === 0n) {
		console.log('No balance to withdraw')
		process.exit(0)
	}
	const decimals = await token.decimals()
	const symbol = await token.symbol()
	const formattedBalance = formatEther(balance * BigInt(10 ** (18 - Number(decimals))))
	await confirm(
		`\nToken: ${symbol}\nBalance: ${formattedBalance} ${symbol}\nWithdrawing from: ${racAddress}\nTo: ${dev.address}\n`,
	)
	console.log('withdrawing...')
	const tx = await rac.emergencyWithdraw(tokenAddress, balance)
	const receipt = await tx.wait()
	console.log('tx', receipt?.hash)
	process.exit(0)
} else {
	throw new Error('Invalid token address')
}
