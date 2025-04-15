// built-in constants: https://vite.dev/guide/env-and-mode#built-in-constants
export const IS_DEV = !import.meta.env.PROD

export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_LOCAL = '0xa818cA7A4869c7C7101d0Ea5E4c455Ef00e698d5'
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA as string | undefined
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET as string | undefined

if (!IS_DEV) {
	if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA && !ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET) {
		throw new Error(
			'ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA or ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET is not set in .env',
		)
	}
}

export const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY
if (!ALCHEMY_API_KEY) {
	throw new Error('ALCHEMY_API_KEY is not set in .env')
}

export enum CHAIN_ID {
	LOCAL = '1337',
	SEPOLIA = '11155111',
	MAINNET = '1',
}

export const RPC_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: `http://localhost:8545`,
	[CHAIN_ID.SEPOLIA]: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
	[CHAIN_ID.MAINNET]: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
}

export const EXPLORER_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: 'http://localhost:3000',
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
