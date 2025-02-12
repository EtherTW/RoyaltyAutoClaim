import { RoyaltyAutoClaim__factory } from '@/typechain-types'
import { Interface } from 'ethers'

export function formatError(error: any): string {
	if (!(error instanceof Error)) {
		return 'formatError: Not an error'
	}

	// Special handling for simulation errors
	if (error.message.includes('eth_estimateUserOperationGas')) {
		const reasonMatch = error.message.match(/UserOperation reverted during simulation with reason: (.+)$/)
		const reason = reasonMatch?.[1]

		// extract hex data from the end of the message
		const hexDataMatch = error.message.match(/(0x[a-fA-F0-9]+)(?![0-9a-fA-F])/)
		const hexData = hexDataMatch?.[1]

		if (reason && hexData) {
			const iface = new Interface(RoyaltyAutoClaim__factory.abi)
			try {
				const decodedError = iface.parseError(hexData)
				if (decodedError) {
					const reasonWithoutHexData = reason.replace(hexData, '').trim()
					const errorArgs = decodedError.args.length > 0 ? `(${decodedError.args.join(', ')})` : ''
					return `Simulation failed:${reasonWithoutHexData ? ' ' + reasonWithoutHexData : ''} ${
						decodedError.name
					}${errorArgs}`
				}
			} catch (err) {
				console.error('formatError: Failed to parse contract error', err)
			}
		} else if (reason) {
			return `Simulation failed: ${reason}`
		} else {
			return `Simulation failed`
		}
	}

	// Don't extract if it's a different JSON-RPC Error
	if (error.message.startsWith('JSON-RPC Error:')) {
		return error.message
	}

	// ethers error
	if (error.message.includes('version=6.13.5')) {
		// Extract everything before the first parenthesis
		const match = error.message.match(/^([^(]+)/)
		if (match) {
			return `ethers.js: ${match[1].trim()}`
		}
	}

	return error.message || 'Unknown error occurred'
}
