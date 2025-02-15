import { ERROR_NOTIFICATION_DURATION, ROYALTY_AUTO_CLAIM_PROXY_ADDRESS } from '@/config'
import { fetchExistingSubmissions } from '@/lib/RoyaltyAutoClaim'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import { formatErrMsg, normalizeError } from '@/lib/error'
import { RoyaltyAutoClaim__factory } from '@/typechain-types'
import { notify } from '@kyvg/vue3-notification'
import { JsonRpcSigner } from 'ethers'
import { defineStore } from 'pinia'
import { useBlockchainStore } from './useBlockchain'
import { useEOAStore } from './useEOA'

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
		return RoyaltyAutoClaim__factory.connect(ROYALTY_AUTO_CLAIM_PROXY_ADDRESS, blockchainStore.client)
	})

	const royaltyAutoClaim4337 = computed(() => {
		const eoaStore = useEOAStore()

		if (eoaStore.signer) {
			return new RoyaltyAutoClaim4337({
				client: blockchainStore.client,
				bundler: blockchainStore.bundler,
				signer: eoaStore.signer as JsonRpcSigner,
			})
		}

		return null
	})

	const submissions = ref<Submission[]>([])
	const isLoadingBasicSubmissions = ref(false)
	const isLoadingSubmissionData = ref(false)
	const isLoading = computed(() => isLoadingBasicSubmissions.value || isLoadingSubmissionData.value)

	async function fetchSubmissions() {
		try {
			isLoadingBasicSubmissions.value = true

			const basicSubmissions = await fetchExistingSubmissions(royaltyAutoClaim.value)

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
		} catch (error: unknown) {
			const err = normalizeError(error)
			notify({
				title: 'Error fetching submissions',
				text: formatErrMsg(err),
				type: 'error',
				duration: ERROR_NOTIFICATION_DURATION,
			})
		} finally {
			isLoadingBasicSubmissions.value = false
			isLoadingSubmissionData.value = false
		}
	}

	return {
		royaltyAutoClaim,
		royaltyAutoClaim4337,
		submissions,
		isLoadingBasicSubmissions,
		isLoadingSubmissionData,
		isLoading,
		fetchSubmissions,
	}
})
