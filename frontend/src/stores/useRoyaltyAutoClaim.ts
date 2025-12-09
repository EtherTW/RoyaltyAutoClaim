import { normalizeError } from '@/lib/error'
import { fetchExistingSubmissions } from '@/lib/fetchExistingSubmissions'
import { fetchReviewerGroupMembers } from '@/lib/semaphore-utils'
import { RoyaltyAutoClaim__factory } from '@/typechain-v2'
import { SEMAPHORE_NETWORK } from '@/config'
import { defineStore } from 'pinia'
import { useBlockchainStore } from './useBlockchain'

export type Submission = {
	title: string
	recipient: string
	reviewCount: number | null
	totalRoyaltyLevel: number | null
	status: 'registered' | 'claimed' | null
}

export const useRoyaltyAutoClaimStore = defineStore('useRoyaltyAutoClaimStore', () => {
	const blockchainStore = useBlockchainStore()

	const royaltyAutoClaim = computed(() => {
		return RoyaltyAutoClaim__factory.connect(blockchainStore.royaltyAutoClaimProxyAddress, blockchainStore.client)
	})

	const submissions = ref<Submission[]>([])
	const isLoadingBasicSubmissions = ref(false)
	const isLoadingSubmissionData = ref(false)
	const isLoading = computed(() => isLoadingBasicSubmissions.value || isLoadingSubmissionData.value)

	// Semaphore-related state
	const semaphoreAddress = ref<string | null>(null)
	const reviewerGroupId = ref<bigint | null>(null)
	const reviewerMembers = ref<string[]>([])
	const isLoadingReviewerMembers = ref(false)

	async function fetchSubmissions() {
		submissions.value = []
		await _fetchSubmissions()
	}

	async function updateSubmissions() {
		await _fetchSubmissions()
	}

	async function _fetchSubmissions() {
		try {
			isLoadingBasicSubmissions.value = true

			const blockchainStore = useBlockchainStore()
			const royaltyAutoClaimTenderly = royaltyAutoClaim.value.connect(blockchainStore.tenderlyClient)

			const basicSubmissions = await fetchExistingSubmissions(royaltyAutoClaimTenderly)

			submissions.value = basicSubmissions.map(submission => ({
				title: submission.title,
				recipient: submission.recipient,
				reviewCount: null,
				totalRoyaltyLevel: null,
				status: null,
			}))

			isLoadingBasicSubmissions.value = false

			isLoadingSubmissionData.value = true
			await Promise.all(
				submissions.value.map(async submission => {
					const submissionData = await royaltyAutoClaim.value.submissions(submission.title)
					submission.reviewCount = Number(submissionData.reviewCount)
					submission.totalRoyaltyLevel = Number(submissionData.totalRoyaltyLevel)
					submission.status = Number(submissionData.status) === 1 ? 'registered' : 'claimed'
				}),
			)
			isLoadingSubmissionData.value = false
		} catch (err: unknown) {
			throw new Error('Failed to fetch submissions', { cause: normalizeError(err) })
		} finally {
			isLoadingBasicSubmissions.value = false
			isLoadingSubmissionData.value = false
		}
	}

	async function fetchReviewerMembers() {
		try {
			isLoadingReviewerMembers.value = true

			// Get semaphore address and reviewer group ID from contract
			semaphoreAddress.value = await royaltyAutoClaim.value.semaphore()
			reviewerGroupId.value = await royaltyAutoClaim.value.reviewerGroupId()

			// Get the network name for the subgraph
			const network = SEMAPHORE_NETWORK[blockchainStore.chainId]
			if (!network) {
				throw new Error(`Semaphore subgraph network not configured for chain ID: ${blockchainStore.chainId}`)
			}

			// Fetch reviewer members from Semaphore subgraph
			reviewerMembers.value = await fetchReviewerGroupMembers({
				network,
				groupId: reviewerGroupId.value.toString(),
			})
		} catch (err: unknown) {
			throw new Error('Failed to fetch reviewer members', { cause: normalizeError(err) })
		} finally {
			isLoadingReviewerMembers.value = false
		}
	}

	return {
		royaltyAutoClaim,
		submissions,
		isLoadingBasicSubmissions,
		isLoadingSubmissionData,
		isLoading,
		fetchSubmissions,
		updateSubmissions,
		semaphoreAddress,
		reviewerGroupId,
		reviewerMembers,
		isLoadingReviewerMembers,
		fetchReviewerMembers,
	}
})
