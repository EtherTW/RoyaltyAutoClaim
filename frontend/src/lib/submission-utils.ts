import { ref } from 'vue'
import { Submission, useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'

/**
 * Composable for polling submission updates after operations
 */
export function useSubmissionPolling() {
	const isPollingForSubmissionUpdate = ref(false)

	/**
	 * Poll for submission updates after operations
	 * @param submissionTitle - The title of the submission to poll for
	 * @param verifyFn - Optional verification function to check if the update is reflected
	 */
	async function pollForSubmissionUpdate(
		submissionTitle: string,
		verifyFn?: (submission: Submission) => boolean,
	): Promise<void> {
		const maxAttempts = 10
		const delayMs = 500

		const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()

		isPollingForSubmissionUpdate.value = true

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			await royaltyAutoClaimStore.updateSubmissions()

			const found = royaltyAutoClaimStore.submissions.find(s => s.title === submissionTitle)

			if (found) {
				// If verification function provided, check if update is reflected
				if (verifyFn && !verifyFn(found)) {
					// Continue polling if verification fails
					if (attempt < maxAttempts - 1) {
						await new Promise(resolve => setTimeout(resolve, delayMs))
						continue
					}
				} else {
					isPollingForSubmissionUpdate.value = false
					return // Successfully found and verified
				}
			}

			if (attempt < maxAttempts - 1) {
				await new Promise(resolve => setTimeout(resolve, delayMs))
			}
		}

		console.warn('Submission update not reflected after polling, but transaction succeeded')
		isPollingForSubmissionUpdate.value = false
	}

	return {
		isPollingForSubmissionUpdate,
		pollForSubmissionUpdate,
	}
}
