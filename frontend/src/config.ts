// built-in constants: https://vite.dev/guide/env-and-mode#built-in-constants
export const IS_DEV = !import.meta.env.PROD

// Main Contract Address
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_LOCAL = '0xa818cA7A4869c7C7101d0Ea5E4c455Ef00e698d5'
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA as string
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET as string
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA as string
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE as string

export const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY
if (!ALCHEMY_API_KEY) {
	throw new Error('ALCHEMY_API_KEY is not set in .env')
}

export enum CHAIN_ID {
	LOCAL = '1337',
	SEPOLIA = '11155111',
	MAINNET = '1',
	BASE_SEPOLIA = '84532',
	BASE = '8453',
}
export const DEFAULT_CHAIN_ID = IS_DEV ? CHAIN_ID.BASE_SEPOLIA : CHAIN_ID.MAINNET

export const RPC_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: `http://localhost:8545`,
	[CHAIN_ID.SEPOLIA]: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
	[CHAIN_ID.MAINNET]: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
	[CHAIN_ID.BASE_SEPOLIA]: 'https://sepolia.base.org',
	[CHAIN_ID.BASE]: 'https://mainnet.base.org',
}

export const TENDERLY_RPC_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: `http://localhost:8545`,
	[CHAIN_ID.SEPOLIA]: `https://sepolia.gateway.tenderly.co/5j2Bli4kdZh94hJp4Mg7x1`,
	[CHAIN_ID.MAINNET]: `https://mainnet.gateway.tenderly.co/7SOJjmp7ir0NXhDU1IL29v`,
	[CHAIN_ID.BASE_SEPOLIA]: 'https://base-sepolia.gateway.tenderly.co/7VvN7z5fn1xVirOQsSzKD',
	[CHAIN_ID.BASE]: 'https://base.gateway.tenderly.co/7ku6af38xSIhnCo7IAEBQ6',
}

export const EXPLORER_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: 'http://localhost:3000',
	[CHAIN_ID.SEPOLIA]: 'https://sepolia.etherscan.io',
	[CHAIN_ID.MAINNET]: 'https://etherscan.io',
	[CHAIN_ID.BASE_SEPOLIA]: 'https://sepolia.basescan.org',
	[CHAIN_ID.BASE]: 'https://basescan.org',
}

export const BUNDLER_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: 'http://localhost:4337',
	[CHAIN_ID.SEPOLIA]: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
	[CHAIN_ID.MAINNET]: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
	[CHAIN_ID.BASE_SEPOLIA]: 'https://api.candide.dev/bundler/v3/base-sepolia/569f6f756834509e752305edd333cef7',
	[CHAIN_ID.BASE]: 'https://api.candide.dev/bundler/v3/base/569f6f756834509e752305edd333cef7',
}

// Duration of error notification in ms, -1 means it will not disappear automatically
export const ERROR_NOTIFICATION_DURATION = -1
export const GITHUB_REPO_NAME = 'RoyaltyAutoClaim'
