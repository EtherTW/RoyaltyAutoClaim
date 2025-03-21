export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS = import.meta.env.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS
if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS) {
	throw new Error('ROYALTY_AUTO_CLAIM_PROXY_ADDRESS is not set in .env')
}

export const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY
if (!ALCHEMY_API_KEY) {
	throw new Error('ALCHEMY_API_KEY is not set in .env')
}

export const CHAIN_ID_ENV = import.meta.env.VITE_CHAIN_ID
if (!CHAIN_ID_ENV) {
	throw new Error('CHAIN_ID is not set in .env')
}

export enum CHAIN_ID {
	LOCAL = '1337',
	SEPOLIA = '11155111',
	MAINNET = '1',
}

if (!Object.values(CHAIN_ID).includes(CHAIN_ID_ENV)) {
	throw new Error(`CHAIN_ID_ENV is unsupported: ${CHAIN_ID_ENV}`)
}

export const DEFAULT_CHAIN_ID = CHAIN_ID_ENV

export const RPC_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: `http://localhost:8545`,
	[CHAIN_ID.SEPOLIA]: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
	[CHAIN_ID.MAINNET]: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
}

export const EXPLORER_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: '',
	[CHAIN_ID.SEPOLIA]: 'https://sepolia.etherscan.io',
	[CHAIN_ID.MAINNET]: 'https://etherscan.io',
}

export const BUNDLER_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: 'http://localhost:4337',
	[CHAIN_ID.SEPOLIA]: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
	[CHAIN_ID.MAINNET]: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
}

// Duration of error notification in ms, -1 means it will not disappear automatically
export const ERROR_NOTIFICATION_DURATION = -1
export const GITHUB_REPO_NAME = 'RoyaltyAutoClaim'
