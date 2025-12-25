import { RoyaltyAutoClaim } from '../typechain-v2'

export async function fetchExistingSubmissions(royaltyAutoClaim: RoyaltyAutoClaim) {
	const submissions = new Map<string, { title: string; recipient: string }>()

	// Fetch all events
	const [registeredEvents, revokedEvents, updatedEvents] = await Promise.all([
		royaltyAutoClaim.queryFilter(royaltyAutoClaim.filters.SubmissionRegistered()),
		royaltyAutoClaim.queryFilter(royaltyAutoClaim.filters.SubmissionRevoked()),
		royaltyAutoClaim.queryFilter(royaltyAutoClaim.filters.SubmissionRoyaltyRecipientUpdated()),
	])

	// Combine all events and sort by block number and transaction index
	const allEvents = [
		...registeredEvents.map(e => ({ type: 'register', event: e })),
		...revokedEvents.map(e => ({ type: 'revoke', event: e })),
		...updatedEvents.map(e => ({ type: 'update', event: e })),
	].sort((a, b) => {
		if (a.event.blockNumber !== b.event.blockNumber) {
			return a.event.blockNumber - b.event.blockNumber
		}
		return a.event.transactionIndex - b.event.transactionIndex
	})

	// Process events in chronological order
	for (const { type, event } of allEvents) {
		switch (type) {
			case 'register': {
				const args = event.args as {
					titleHash: string
					royaltyRecipient: string
					title: string
				}
				submissions.set(args.title, {
					title: args.title,
					recipient: args.royaltyRecipient,
				})
				break
			}
			case 'revoke':
				submissions.delete(event.args.title)
				break
			case 'update':
				const args = event.args as {
					title: string
					newRecipient: string
				}
				if (submissions.has(args.title)) {
					submissions.set(args.title, {
						title: args.title,
						recipient: args.newRecipient,
					})
				}
				break
		}
	}

	return Array.from(submissions.values())
}
