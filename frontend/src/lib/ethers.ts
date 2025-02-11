import type { ContractTransactionResponse } from 'ethers'
import { Interface } from 'ethers'
import { RoyaltyAutoClaim__factory } from '../typechain-types'

export async function waitForTransaction(promise: Promise<ContractTransactionResponse>) {
	try {
		const tx = await promise
		return await tx.wait()
	} catch (error: any) {
		if (error.transaction?.data) {
			const functionName = findSelector(error.transaction.data)
			const errorMessage = `${functionName || 'unknown function'}`

			if (error.data) {
				const errorName = findSelector(error.data, 'error')
				throw new Error(`${errorMessage} ${errorName || 'Unknown'} (${error.data})`)
			}
			throw new Error(errorMessage + ' ' + error.message)
		} else {
			throw error
		}
	}
}

export function decodeError() {}

export function findSelector(data: string, type?: 'function' | 'error'): string | undefined {
	// Get the selector (first 4 bytes after '0x')
	const selector = data.startsWith('0x') ? data.slice(0, 10) : '0x' + data.slice(0, 8)

	const iface = new Interface(RoyaltyAutoClaim__factory.abi)

	// Get all fragments from the interface
	const fragments = iface.fragments.filter(f => !type || f.type === type)

	// Find matching fragment
	const matchingFragment = fragments.find(fragment => {
		let fragmentSelector: string | undefined
		try {
			if (fragment.type === 'function') {
				fragmentSelector = iface.getFunction(fragment.format('sighash'))?.selector
			} else if (fragment.type === 'error') {
				fragmentSelector = iface.getError(fragment.format('sighash'))?.selector
			}
		} catch {
			return false
		}
		return fragmentSelector === selector
	})

	return matchingFragment?.format('sighash') + ` (${selector})`
}
