import { formatEther, JsonRpcProvider, Wallet } from 'ethers'
import { EntryPointV08__factory } from 'sendop'
import { RPC_URL } from '../src/config'
import { RoyaltyAutoClaim__factory } from '../src/typechain-v2'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}

const racAddress = process.argv[2]
if (!racAddress) {
	console.error('Please provide a RoyaltyAutoClaim address as an argument')
	process.exit(1)
}

const CHAIN_ID = '84532'

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
const dev = new Wallet(VITE_TEST_PRIVATE_KEY, client)

const rac = RoyaltyAutoClaim__factory.connect(racAddress, dev)

const entryPoint = EntryPointV08__factory.connect('0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108', client)
const balance = await entryPoint.balanceOf(rac)
console.log('Account', await rac.getAddress())
console.log('EntryPoint balance', formatEther(balance))
