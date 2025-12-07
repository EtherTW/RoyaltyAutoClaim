export function padString(str: string, paddedBytesSize: number): number[] {
	// Convert string to UTF-8 bytes
	const encoder = new TextEncoder()
	const bytes = encoder.encode(str)

	// Create padded array
	const paddedBytes = new Array(paddedBytesSize).fill(0)

	// Copy original bytes into padded array
	for (let i = 0; i < bytes.length && i < paddedBytesSize; i++) {
		paddedBytes[i] = bytes[i]
	}

	return paddedBytes
}
