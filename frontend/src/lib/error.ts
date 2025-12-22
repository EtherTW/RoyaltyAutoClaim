import type { ethers } from 'ethers'
import { ErrorCode, Interface, isError } from 'ethers'
import { ERC4337Error, extractHexString } from 'sendop'
import { MockToken__factory, EmailVerifier__factory, RoyaltyAutoClaim__factory } from '../typechain-v2'

/**
 * Checks if an error indicates a user rejection from browser wallet or passkey.
 */
export function isUserRejectedError(error: unknown): boolean {
	if (error instanceof Error) {
		if (isEthersError(error)) {
			if (isError(error, 'ACTION_REJECTED')) {
				return true
			}
		}
		if (
			// desktop chrome error
			error.message.includes('The operation either timed out or was not allowed') ||
			// mobile chrome error
			error.message.includes(
				'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.',
			)
		) {
			return true
		}
	}

	return false
}

export function isEthersError(error: unknown): error is EthersError {
	const validErrorCodes: ErrorCode[] = [
		'UNKNOWN_ERROR',
		'NOT_IMPLEMENTED',
		'UNSUPPORTED_OPERATION',
		'NETWORK_ERROR',
		'SERVER_ERROR',
		'TIMEOUT',
		'BAD_DATA',
		'CANCELLED',
		'BUFFER_OVERRUN',
		'NUMERIC_FAULT',
		'INVALID_ARGUMENT',
		'MISSING_ARGUMENT',
		'UNEXPECTED_ARGUMENT',
		'VALUE_MISMATCH',
		'CALL_EXCEPTION',
		'INSUFFICIENT_FUNDS',
		'NONCE_EXPIRED',
		'REPLACEMENT_UNDERPRICED',
		'TRANSACTION_REPLACED',
		'UNCONFIGURED_NAME',
		'OFFCHAIN_FAULT',
		'ACTION_REJECTED',
	]

	if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
		return validErrorCodes.includes(error.code as ErrorCode)
	}

	return false
}

export function extractAndParseRevert(err: ERC4337Error, interfaces: Record<string, Interface>): string {
	// Alchemy format: structured revertData property
	if (err.data?.revertData) {
		return parseContractRevert(err.data.revertData, interfaces)
	}

	// Pimlico format: hex string embedded in error message
	const revertData = extractHexString(err.message)
	if (revertData) {
		return parseContractRevert(revertData, interfaces)
	}

	return ''
}

export function handleUserOpError(e: unknown) {
	const revert = extractHexString((e as Error).message) || ''
	const customError = parseContractRevert(revert, {
		RoyaltyAutoClaim: RoyaltyAutoClaim__factory.createInterface(),
		EmailVerifier: EmailVerifier__factory.createInterface(),
	})
	if (customError) {
		console.log('\nContract revert:')
		console.log({
			[revert]: customError,
		})
	}
	throw e
}

export function parseContractRevert(
	revert: string,
	interfaces: Record<string, Interface>,
	nameOnly: boolean = true,
): string {
	if (!revert) return ''

	for (const [name, iface] of Object.entries(interfaces)) {
		try {
			const decodedError = iface.parseError(revert)

			if (decodedError) {
				const errorArgs = decodedError.args.length > 0 ? `(${decodedError.args.join(', ')})` : ''

				if (nameOnly) {
					return `${decodedError.name}${errorArgs}`
				}
				return `${name}.${decodedError.name}${errorArgs} (Note: The prefix "${name}" may not correspond to the actual contract that triggered the revert.)`
			}
		} catch {
			// Continue to next interface if parsing fails
			continue
		}
	}

	return ''
}

// Returned error is used for console.error
export function normalizeError(unknownError: unknown): Error {
	if (unknownError instanceof Error) {
		return unknownError
	}
	return new Error(JSON.stringify(unknownError))
}

// Returned string is used for UI notification
export function formatErrMsg(error: Error): string {
	// Special handling for eth_estimateUserOperationGas errors
	if (error.message.includes('eth_estimateUserOperationGas')) {
		// Try to extract JSON data for AlchemyBundler format
		const jsonMatch = error.message.match(/\{.*\}/)
		if (jsonMatch) {
			const errorData: { reason: string; revertData: string } = JSON.parse(jsonMatch[0])
			const revertData = errorData.revertData === '0x' ? '' : errorData.revertData
			const reason = errorData.reason

			const decodedErrMsg = revertData ? decodeContractError(revertData) : ''

			const parts: string[] = []
			if (reason) parts.push(reason)
			if (decodedErrMsg) {
				parts.push(decodedErrMsg)
			} else if (revertData) {
				parts.push(revertData)
			}

			return parts.length > 0 ? `Estimation failed: ${parts.join(' ')}` : 'Estimation failed'
		}

		function decodeContractError(revertData: string): string {
			const ifaceRAC = new Interface(RoyaltyAutoClaim__factory.abi)
			const ifaceERC20 = new Interface(MockToken__factory.abi)

			let decodedError = ifaceRAC.parseError(revertData)
			if (!decodedError) {
				decodedError = ifaceERC20.parseError(revertData)
			}
			if (!decodedError) return ''
			const errorArgs = decodedError.args.length > 0 ? `(${decodedError.args.join(', ')})` : ''
			return `${decodedError.name}${errorArgs}`
		}

		// Fallback to existing logic for PimlicoBundler format
		const reasonMatch = error.message.match(/UserOperation reverted during simulation with reason: (.+)$/)
		const reason = reasonMatch?.[1]

		// extract hex data from the end of the message
		const hexDataMatch = error.message.match(/(0x[a-fA-F0-9]+)(?![0-9a-fA-F])/)
		const hexData = hexDataMatch?.[1]

		if (reason && hexData) {
			const iface = new Interface(RoyaltyAutoClaim__factory.abi)

			const decodedError = iface.parseError(hexData)
			if (decodedError) {
				const reasonWithoutHexData = reason.replace(hexData, '').trim()
				const errorArgs = decodedError.args.length > 0 ? `(${decodedError.args.join(', ')})` : ''
				return `Estimation failed:${reasonWithoutHexData ? ' ' + reasonWithoutHexData : ''} ${
					decodedError.name
				}${errorArgs}`
			}
		} else if (reason) {
			return `Estimation failed: ${reason}`
		} else {
			return `Estimation failed`
		}
	}

	return `${error.name}: ${error.message}`
}

// ================================ Error classes =================================

export class EthersError extends Error {
	code: ErrorCode = 'UNKNOWN_ERROR'

	constructor(message: string, options?: ErrorOptions & { code?: ErrorCode }) {
		super(message, options)
		this.name = 'EthersError'

		if (options?.cause && EthersError.isEthersError(options.cause)) {
			const ethersError = options.cause as ethers.EthersError
			this.code = ethersError.code
			this.message = this.message.replace(/^([^(]+).*/, '$1').trim()
			if (ethersError.name === 'Error') {
				this.name = `EthersError`
			} else {
				this.name = `EthersError(${ethersError.name})`
			}
		}
	}

	static isEthersError(error: unknown): error is ethers.EthersError {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			typeof (error as ethers.EthersError).code === 'string' &&
			'name' in error &&
			typeof (error as ethers.EthersError).name === 'string'
		) {
			return isError(error, (error as ethers.EthersError).code)
		}

		return false
	}
}

// Thrown when the user rejects the transaction in the wallet
export class UserRejectedActionError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'UserRejectedActionError'
	}
}
