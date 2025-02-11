import { ROYALTY_AUTO_CLAIM_PROXY_ADDRESS } from '@/config'
import { waitForTransaction } from '@/lib/ethers'
import { RoyaltyAutoClaim, RoyaltyAutoClaim__factory } from '@/typechain-types'
import { faker } from '@faker-js/faker'
import { beforeAll, describe, it } from 'vitest'
import { account0 } from './test-utils'

describe('RoyaltyAutoClaim.ts', () => {
	let royaltyAutoClaim: RoyaltyAutoClaim

	beforeAll(async () => {
		royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(ROYALTY_AUTO_CLAIM_PROXY_ADDRESS, account0)
	})

	it('fetchExistingSubmissions', async () => {
		// register 3 submissions, revoke 1 and update 1
		const title1 = faker.lorem.word()
		const title2 = faker.lorem.word()
		const title3 = faker.lorem.word()
		const newRecipient = faker.finance.ethereumAddress()
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title1, account0.address))
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title2, account0.address))
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title3, account0.address))
		await waitForTransaction(royaltyAutoClaim.revokeSubmission(title2))
		await waitForTransaction(royaltyAutoClaim.updateRoyaltyRecipient(title1, newRecipient))
	})
})
