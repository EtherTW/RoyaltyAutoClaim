// built-in constants: https://vite.dev/guide/env-and-mode#built-in-constants
export const IS_DEV = !import.meta.env.PROD

// Main Contract Address
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_LOCAL = '0xa818cA7A4869c7C7101d0Ea5E4c455Ef00e698d5'
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA as string
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET as string
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA =
	(import.meta.env.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA as string) ||
	'0x4a5D2D82E745b4761Ccf9903993c10F8F9650429'
export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE = import.meta.env
	.VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE as string

export const ALCHEMY_API_KEY = (import.meta.env.VITE_ALCHEMY_API_KEY as string) || 'zksW8JebAVSxyMzBCzhzNyNNx8P4J4Mi'
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
	[CHAIN_ID.BASE_SEPOLIA]: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
	[CHAIN_ID.BASE]: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
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
	[CHAIN_ID.BASE_SEPOLIA]: 'https://api.pimlico.io/v2/84532/rpc?apikey=pim_nDodV8Xhz7bXSEoeL9UbGh',
	[CHAIN_ID.BASE]: 'https://api.pimlico.io/v2/8453/rpc?apikey=pim_nDodV8Xhz7bXSEoeL9UbGh',
}

export const GITHUB_REPO_NAME = 'RoyaltyAutoClaim'

export const SEMAPHORE_IDENTITY_MESSAGE =
	'Sign this message to generate your Semaphore identity for https://ethertw.github.io/RoyaltyAutoClaim\n\nThis signature creates a deterministic private key for anonymous proof generation.\n\nIMPORTANT: Never sign this exact message on other websites, as doing so would allow them to generate the same identity and compromise your privacy across platforms.'

// Semaphore Subgraph Network Names
export const SEMAPHORE_NETWORK: { [key: string]: string } = {
	[CHAIN_ID.BASE_SEPOLIA]: 'base-sepolia',
	[CHAIN_ID.BASE]: 'base',
}
