import { MockERC20__factory, RoyaltyAutoClaim__factory } from '@/typechain-types'
import { Interface } from 'ethers'
import { isError, ErrorCode } from 'ethers'
import type { ethers } from 'ethers'

// Returned error is used for console.error
export function normalizeError(unknownError: unknown): Error {
	let err: Error
	if (unknownError instanceof Error) {
		if (EthersError.isEthersError(unknownError)) {
			err = new EthersError(unknownError.message, { cause: unknownError })

			if (err.message.includes('user rejected action')) {
				err = new UserRejectedActionError(err.message, { cause: err })
			}
		} else {
			err = unknownError
		}
	} else {
		err = new Error(String(unknownError))
	}
	return err
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
			const ifaceERC20 = new Interface(MockERC20__factory.abi)

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

	if (error instanceof AppError) {
		return getDetailedErrorMessage(error)
	}

	return `${error.name}: ${error.message}`
}

function getDetailedErrorMessage(err: Error): string {
	let messages: string[] = []

	while (err instanceof Error) {
		messages.push(`${err.name}: ${err.message}`)
		err = err.cause as Error
	}

	return messages.join(' → ')
}

// ================================ Error classes =================================

export class AppError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'AppError'
	}
}

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
