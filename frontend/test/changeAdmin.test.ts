import { CHAIN_ID } from '@/config'
import { formatErrMsg, normalizeError } from '@/lib/error'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import { MockToken, RoyaltyAutoClaim } from '@/typechain-types'
import { ethers } from 'ethers'
import { beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_0_PRIVATE_KEY, ACCOUNT_1_PRIVATE_KEY, deployContracts } from './test-utils'

const chainId = CHAIN_ID.LOCAL

describe('changeAdmin', () => {
	let account0: ethers.Wallet
	let account1: ethers.Wallet
	let token: MockToken
	let tokenAddress: string
	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim
	let royaltyAutoClaim4337: RoyaltyAutoClaim4337

	beforeAll(async () => {
		const data = await deployContracts(chainId, ACCOUNT_0_PRIVATE_KEY, ACCOUNT_1_PRIVATE_KEY)
		account0 = data.account0
		account1 = data.account1
		token = data.token
		tokenAddress = data.tokenAddress
		proxyAddress = data.proxyAddress
		royaltyAutoClaim = data.royaltyAutoClaim
		royaltyAutoClaim4337 = data.royaltyAutoClaim4337
	}, 100_000)

	it('should change admin', async () => {
		try {
			const op = await royaltyAutoClaim4337.sendCalldata(
				royaltyAutoClaim.interface.encodeFunctionData('changeAdmin', [account1.address]),
			)
			const receipt = await op.wait()
			expect(receipt.success).to.be.true
		} catch (e: unknown) {
			const err = normalizeError(e)
			throw new Error(formatErrMsg(err))
		}
	})

	it('cannot change admin if not owner', async () => {
		try {
			const op = await royaltyAutoClaim4337
				.connect(account1)
				.sendCalldata(royaltyAutoClaim.interface.encodeFunctionData('changeAdmin', [account0.address]))
			const receipt = await op.wait()
			expect(receipt.success).to.be.false
		} catch (e: unknown) {
			const err = normalizeError(e)
			throw new Error(formatErrMsg(err))
		}
	})
})
