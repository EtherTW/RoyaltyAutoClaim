import { CHAIN_ID } from '../src/config'
import { RoyaltyAutoClaim4337 } from '../src/lib/RoyaltyAutoClaim4337'
import { MockToken, RoyaltyAutoClaim } from '../src/typechain-types'
import { ethers } from 'ethers'
import { describe, it } from 'vitest'
import { ACCOUNT_0_PRIVATE_KEY, ACCOUNT_1_PRIVATE_KEY, deployContracts } from './test-utils'

describe('deploy-local', () => {
	let account0: ethers.Wallet
	let account1: ethers.Wallet
	let token: MockToken
	let tokenAddress: string
	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim
	let royaltyAutoClaim4337: RoyaltyAutoClaim4337

	it('should deploy contracts', async () => {
		const data = await deployContracts(CHAIN_ID.LOCAL, ACCOUNT_0_PRIVATE_KEY, ACCOUNT_1_PRIVATE_KEY)
		account0 = data.account0
		account1 = data.account1
		token = data.token
		tokenAddress = data.tokenAddress
		proxyAddress = data.proxyAddress
		royaltyAutoClaim = data.royaltyAutoClaim
		royaltyAutoClaim4337 = data.royaltyAutoClaim4337
	}, 100_000)
})
