import { BUNDLER_URL, CHAIN_ID, RPC_URL } from '@/config'
import { formatErrMsg, normalizeError } from '@/lib/error'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import { RoyaltyAutoClaim, RoyaltyAutoClaim__factory } from '@/typechain-types'
import { ethers } from 'ethers'
import { AlchemyBundler } from 'sendop'
import { beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_0_PRIVATE_KEY } from './test-utils'

const chainId = CHAIN_ID.SEPOLIA

const proxyAddress = '0x66ECf28b049f8b917C58B6e81a999CDF309283eA'
const newOwner = '0x0F0356aE7f7e1c0e812f5fB672B9D5557aB0Bf86'
const client = new ethers.JsonRpcProvider(RPC_URL[chainId])
const bundler = new AlchemyBundler(chainId, BUNDLER_URL[chainId])
const account0 = new ethers.Wallet(ACCOUNT_0_PRIVATE_KEY, client)

describe('transferOwnership', () => {
	let royaltyAutoClaim: RoyaltyAutoClaim
	let royaltyAutoClaim4337: RoyaltyAutoClaim4337

	beforeAll(async () => {
		royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(proxyAddress, account0)
		royaltyAutoClaim4337 = new RoyaltyAutoClaim4337({
			sender: proxyAddress,
			client,
			bundler,
			signer: account0,
		})
	}, 100_000)

	it('should transfer ownership', async () => {
		try {
			const op = await royaltyAutoClaim4337.sendCalldata(
				royaltyAutoClaim.interface.encodeFunctionData('transferOwnership', [newOwner]),
			)
			const receipt = await op.wait()
			expect(receipt.success).to.be.true
		} catch (e: unknown) {
			const err = normalizeError(e)
			throw new Error(formatErrMsg(err))
		}
	})
})
