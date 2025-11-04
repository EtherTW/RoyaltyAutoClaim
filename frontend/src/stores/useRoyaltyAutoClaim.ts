import { normalizeError } from '@/lib/error'
import { fetchExistingSubmissions } from '@/lib/fetchExistingSubmissions'
import { RoyaltyAutoClaim__factory } from '@/typechain-types'
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

	async function fetchSubmissions() {
		try {
			submissions.value = []
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

	return {
		royaltyAutoClaim,
		submissions,
		isLoadingBasicSubmissions,
		isLoadingSubmissionData,
		isLoading,
		fetchSubmissions,
	}
})
