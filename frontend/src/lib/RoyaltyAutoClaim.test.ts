import { faker } from '@faker-js/faker'
import { RoyaltyAutoClaim, RoyaltyAutoClaim__factory, RoyaltyAutoClaimProxy__factory } from '@/typechain-types'
import { beforeAll, describe, expect, it } from 'vitest'
import { account0 } from '../../test/test-utils'
import { fetchExistingSubmissions } from './RoyaltyAutoClaim'
import { waitForTransaction } from './ethers'
import { getAddress } from 'ethers'

describe('RoyaltyAutoClaim.ts', () => {
	let tokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim

	beforeAll(async () => {
		const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(account0)
		const RoyaltyAutoClaimProxyFactory = new RoyaltyAutoClaimProxy__factory(account0)

		const impl = await RoyaltyAutoClaimFactory.deploy()
		await impl.waitForDeployment()
		const implAddress = await impl.getAddress()

		// Prepare initialization parameters
		const initData = impl.interface.encodeFunctionData('initialize', [
			account0.address,
			account0.address,
			tokenAddress,
			[account0.address],
		])

		// Deploy proxy contract
		const proxy = await RoyaltyAutoClaimProxyFactory.deploy(implAddress, initData)
		await proxy.waitForDeployment()
		proxyAddress = await proxy.getAddress()
		royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(proxyAddress, account0)
	})

	it('fetchExistingSubmissions', async () => {
		// register 3 submissions and revoke 1
		const title1 = faker.lorem.word()
		const title2 = faker.lorem.word()
		const title3 = faker.lorem.word()
		const newRecipient = faker.finance.ethereumAddress()
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title1, account0.address))
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title2, account0.address))
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title3, account0.address))
		await waitForTransaction(royaltyAutoClaim.revokeSubmission(title2))
		await waitForTransaction(royaltyAutoClaim.updateRoyaltyRecipient(title1, newRecipient))

		const submissions = await fetchExistingSubmissions(royaltyAutoClaim)
		console.log(submissions)

		expect(submissions).toEqual([
			{ title: title1, recipient: getAddress(newRecipient) },
			{ title: title3, recipient: account0.address },
		])
	})
})
