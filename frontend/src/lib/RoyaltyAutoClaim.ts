import { RoyaltyAutoClaim } from '@/typechain-types'

export async function fetchExistingSubmissions(royaltyAutoClaim: RoyaltyAutoClaim) {
	const submissions = new Map<string, { title: string; recipient: string }>()

	// Fetch all SubmissionRegistered events
	const registeredEvents = await royaltyAutoClaim.queryFilter(royaltyAutoClaim.filters.SubmissionRegistered())

	for (const event of registeredEvents) {
		submissions.set(event.args.title, {
			title: event.args.title,
			recipient: event.args.royaltyRecipient,
		})
	}

	// Fetch all SubmissionRevoked events and remove them from the map
	const revokedEvents = await royaltyAutoClaim.queryFilter(royaltyAutoClaim.filters.SubmissionRevoked())

	for (const event of revokedEvents) {
		console.log(event.args.title)
		submissions.delete(event.args.title)
	}

	// Fetch all SubmissionRoyaltyRecipientUpdated events and update the map
	const updatedEvents = await royaltyAutoClaim.queryFilter(
		royaltyAutoClaim.filters.SubmissionRoyaltyRecipientUpdated(),
	)

	for (const event of updatedEvents) {
		// Only update if the submission exists
		if (submissions.has(event.args.title)) {
			submissions.set(event.args.title, {
				title: event.args.title,
				recipient: event.args.newRecipient,
			})
		}
	}

	return Array.from(submissions.values())
}
