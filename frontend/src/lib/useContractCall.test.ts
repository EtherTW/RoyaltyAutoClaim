import { parseError } from './useContractCall'
import { describe, expect, it } from 'vitest'

describe('parseError', () => {
	it('should parse JSON-RPC estimation error', () => {
		const errorMessage =
			'Error: JSON-RPC Error: eth_estimateUserOperationGas (-32521): UserOperation reverted during simulation with reason: 0x7a5647a8'
		const error = new Error(errorMessage)
		const result = parseError(error)
		expect(result).toBe('Simulation failed: SubmissionStatusNotRegistered')
	})

	it('should parse JSON-RPC estimation error with reverted message', () => {
		const errorMessage =
			'Error: JSON-RPC Error: eth_estimateUserOperationGas (-32521): UserOperation reverted during simulation with reason: AA23 reverted 0x8e4a23d6000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266'
		const error = new Error(errorMessage)
		const result = parseError(error)
		expect(result).toBe('Simulation failed: AA23 reverted Unauthorized(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)')
	})

	it('should parse JSON-RPC estimation error with reverted message', () => {
		const errorMessage =
			'JSON-RPC Error: eth_estimateUserOperationGas (-32521): UserOperation reverted during simulation with reason: 0x5274afe70000000000000000000000001234567890123456789012345678901234567890'
		const error = new Error(errorMessage)
		const result = parseError(error)
		expect(result).toBe('Simulation failed: SafeERC20FailedOperation(0x1234567890123456789012345678901234567890)')
	})
})
