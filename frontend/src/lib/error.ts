import { RoyaltyAutoClaim__factory } from '@/typechain-types'
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
				console.error('formatErrMsg: Failed to parse contract error', err)
			}
		} else if (reason) {
			return `Simulation failed: ${reason}`
		} else {
			return `Simulation failed`
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
