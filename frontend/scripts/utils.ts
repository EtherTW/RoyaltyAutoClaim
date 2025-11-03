export async function confirm(message: string): Promise<void> {
	console.log(message)
	console.log('Press Enter to confirm...')
	await Bun.stdin.stream().getReader().read()
}
