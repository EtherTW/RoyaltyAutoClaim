import { CHAIN_ID, RPC_URL } from '@/config'
import { RoyaltyAutoClaim, RoyaltyAutoClaim__factory, RoyaltyAutoClaimProxy__factory } from '@/typechain-types'
import { faker } from '@faker-js/faker'
import { getAddress, JsonRpcProvider, Wallet } from 'ethers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_0_PRIVATE_KEY } from '../../test/test-utils'
import { fetchExistingSubmissions } from './RoyaltyAutoClaim'
import { waitForTransaction } from './ethers'

const client = new JsonRpcProvider(RPC_URL[CHAIN_ID.LOCAL])
const account0 = new Wallet(ACCOUNT_0_PRIVATE_KEY, client)

describe('RoyaltyAutoClaim.ts with mock contract', () => {
	/*
		pnpm vitest run -t "should include re-registered submissions after revocation"
	*/
	it('should include re-registered submissions after revocation', async () => {
		const title = faker.lorem.word()
		const firstRecipient = faker.finance.ethereumAddress()
		const secondRecipient = faker.finance.ethereumAddress()

		// Mock the events in chronological order
		const mockEvents = {
			registered: [
				{ args: { title, royaltyRecipient: firstRecipient }, blockNumber: 1, transactionIndex: 1 },
				// Second registration after revocation
				{ args: { title, royaltyRecipient: secondRecipient }, blockNumber: 3, transactionIndex: 3 },
			],
			revoked: [{ args: { title }, blockNumber: 2, transactionIndex: 2 }],
			updated: [],
		}

		// Setup mock contract
		const mockContract = {
			filters: {
				SubmissionRegistered: () => ({ name: 'SubmissionRegistered' }),
				SubmissionRevoked: () => ({ name: 'SubmissionRevoked' }),
				SubmissionRoyaltyRecipientUpdated: () => ({ name: 'SubmissionRoyaltyRecipientUpdated' }),
			},
			queryFilter: vi.fn().mockImplementation((filter: any) => {
				if (filter.name === 'SubmissionRegistered') {
					return mockEvents.registered
				} else if (filter.name === 'SubmissionRevoked') {
					return mockEvents.revoked
				} else if (filter.name === 'SubmissionRoyaltyRecipientUpdated') {
					return mockEvents.updated
				}
				return []
			}),
		}

		const result = await fetchExistingSubmissions(mockContract as any)

		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({
			title,
			recipient: secondRecipient,
		})
	})
})

describe('RoyaltyAutoClaim.ts on local network', () => {
	let tokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
	let proxyAddress: string
	let royaltyAutoClaim: RoyaltyAutoClaim

	beforeEach(async () => {
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

		const submissions = await fetchExistingSubmissions(royaltyAutoClaim)
		console.log(submissions)

		expect(submissions).toEqual([
			{ title: title1, recipient: getAddress(newRecipient) },
			{ title: title3, recipient: account0.address },
		])
	})

	/*
		pnpm vitest run -t "cannot show revoked submission"
	*/
	it('cannot show revoked submission', async () => {
		const title = faker.lorem.word()
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title, account0.address))
		await waitForTransaction(royaltyAutoClaim.updateRoyaltyRecipient(title, faker.finance.ethereumAddress()))
		await waitForTransaction(royaltyAutoClaim.revokeSubmission(title))

		const submissions = await fetchExistingSubmissions(royaltyAutoClaim)
		expect(submissions).toEqual([])
	})

	/*
		pnpm vitest run -t "should include re-registered submissions after revocation"
	*/
	it('should include re-registered submissions after revocation', async () => {
		const title = faker.lorem.word()
		const newRecipient = faker.finance.ethereumAddress()
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title, account0.address))
		await waitForTransaction(royaltyAutoClaim.revokeSubmission(title))
		await waitForTransaction(royaltyAutoClaim.registerSubmission(title, newRecipient))

		const submissions = await fetchExistingSubmissions(royaltyAutoClaim)
		expect(submissions).toEqual([{ title, recipient: getAddress(newRecipient) }])
	})
})
