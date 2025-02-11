import { ethers } from 'ethers'

export const ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
export const RPC_URL = 'http://localhost:8545'

export const client = new ethers.JsonRpcProvider(RPC_URL)
export const account0 = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)
