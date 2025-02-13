import { makeError, Wallet } from 'ethers'
import { formatErrMsg, normalizeError } from './error'
import { describe, expect, it } from 'vitest'

describe('formatErrMsg', () => {
	it('should format ethers.js error', () => {
		const invalidPrivateKey = '0x1234'
		try {
			new Wallet(invalidPrivateKey)
		} catch (error: unknown) {
			const err = normalizeError(error)
			expect(formatErrMsg(err)).toBe('EthersError(TypeError): invalid private key')
		}
	})

	it('should format generic ethers.js error', () => {
		const ethersError = makeError('test error', 'UNKNOWN_ERROR')
		const err = normalizeError(ethersError)
		expect(formatErrMsg(err)).toBe('EthersError: test error')
	})

	describe('PimlicoBundler with sendop@0.1.0', () => {
		it('should format JSON-RPC estimation error', () => {
			const errorMessage =
				'Error: JSON-RPC Error: eth_estimateUserOperationGas (-32521): UserOperation reverted during simulation with reason: 0x7a5647a8'
			const error = new Error(errorMessage)
			const result = formatErrMsg(error)
			expect(result).toBe('Estimation failed: SubmissionStatusNotRegistered')
		})

		it('should format JSON-RPC estimation error with reverted message', () => {
			const errorMessage =
				'Error: JSON-RPC Error: eth_estimateUserOperationGas (-32521): UserOperation reverted during simulation with reason: AA23 reverted 0x8e4a23d6000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266'
			const error = new Error(errorMessage)
			const result = formatErrMsg(error)
			expect(result).toBe(
				'Estimation failed: AA23 reverted Unauthorized(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)',
			)
		})

		it('should format JSON-RPC estimation error with reverted message', () => {
			const errorMessage =
				'JSON-RPC Error: eth_estimateUserOperationGas (-32521): UserOperation reverted during simulation with reason: 0x5274afe70000000000000000000000001234567890123456789012345678901234567890'
			const error = new Error(errorMessage)
			const result = formatErrMsg(error)
			expect(result).toBe(
				'Estimation failed: SafeERC20FailedOperation(0x1234567890123456789012345678901234567890)',
			)
		})

		it('should format JSON-RPC estimation error with 0x', () => {
			const errorMessage =
				'JSON-RPC Error: eth_estimateUserOperationGas (-32521): UserOperation reverted during simulation with reason: 0x'
			const error = new Error(errorMessage)
			const result = formatErrMsg(error)
			expect(result).toBe('Estimation failed: 0x')
		})
	})

	describe('AlchemyBundler', () => {
		it('should format AA23 reverted error', () => {
			const errorMessage =
				'JsonRpcError: eth_estimateUserOperationGas (-32500): validation reverted: [reason]: AA23 reverted - {"reason":"AA23 reverted","revertData":"0x8e4a23d6000000000000000000000000f39Fd6e51aad88F6F4ce6aB8827279cffFb92266"}'
			const error = new Error(errorMessage)
			const result = formatErrMsg(error)
			expect(result).toBe(
				'Estimation failed: AA23 reverted Unauthorized(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)',
			)
		})

		it('should format if only revertData is provided', () => {
			const errMsg =
				'JsonRpcError: eth_estimateUserOperationGas (-32521): execution reverted - {"revertData":"0x96c3b411"} (sendop@0.2.0-beta.0)'
			const error = new Error(errMsg)
			const result = formatErrMsg(error)
			expect(result).toBe('Estimation failed: AlreadyReviewed')
		})

		it('should format if revertData cannot be decoded', () => {
			const errMsg =
				'JsonRpcError: eth_estimateUserOperationGas (-32521): execution reverted - {"revertData":"0xe350d38c0000000000000000000000003d44146ec2fe06910026cbb047b0ee492cd000f20000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001158e460913d00000"} (sendop@0.2.0-beta.0)'
			const error = new Error(errMsg)
			const result = formatErrMsg(error)
			expect(result).toBe(
				'Estimation failed: 0xe350d38c0000000000000000000000003d44146ec2fe06910026cbb047b0ee492cd000f20000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001158e460913d00000',
			)
		})

		it('should format if error is from ERC20 contract', () => {
			const errMsg =
				'JsonRpcError: eth_estimateUserOperationGas (-32521): execution reverted - {"revertData":"0xe450d38c0000000000000000000000003d44146ec2fe06910026cbb047b0ee492cd000f20000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001158e460913d00000"} (sendop@0.2.0-beta.0)'
			const error = new Error(errMsg)
			const result = formatErrMsg(error)
			expect(result).toBe(
				'Estimation failed: ERC20InsufficientBalance(0x3d44146ec2Fe06910026cBB047b0EE492cD000F2, 0, 20000000000000000000)',
			)
		})
	})
})
