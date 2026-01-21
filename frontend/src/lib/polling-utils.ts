import { ref } from 'vue'
import { Submission, useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'

/**
 * Composable for polling contract state updates after operations
 */
export function useContractStatePolling() {
	const isPollingForStateUpdate = ref(false)

	/**
	 * Poll for contract state updates after operations
	 * @param fetchFn - Function to fetch the current state from the contract
	 * @param verifyFn - Function to verify if the expected state is reflected
	 * @returns The updated value if found, null otherwise
	 */
	async function pollForStateUpdate<T>(
		fetchFn: () => Promise<T>,
		verifyFn: (value: T) => boolean,
	): Promise<T | null> {
		const maxAttempts = 10
		const delayMs = 500

		isPollingForStateUpdate.value = true

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const value = await fetchFn()

			if (verifyFn(value)) {
				isPollingForStateUpdate.value = false
				return value
			}

			if (attempt < maxAttempts - 1) {
				await new Promise(resolve => setTimeout(resolve, delayMs))
			}
		}

		console.warn('Contract state update not reflected after polling, but transaction succeeded')
		isPollingForStateUpdate.value = false
		return null
	}

	return {
		isPollingForStateUpdate,
		pollForStateUpdate,
	}
}

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
