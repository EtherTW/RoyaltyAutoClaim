import { TitleHashVerifierLib } from '@/typechain-v2/out/RoyaltyAutoClaim.sol/RoyaltyAutoClaim'
import { abiEncode } from 'sendop'
import { parseEmail } from '../../../circuits/script/utils'

export type ParsedEmailData = Awaited<ReturnType<typeof parseEmail>>

export const DKIM_REGISTRY_ADDRESS = '0x3D3935B3C030893f118a84C92C66dF1B9E4169d6'

export function padArray<T>(arr: T[], targetLength: number, defaultValue: T): T[] {
	return arr.length >= targetLength ? arr : [...arr, ...Array(targetLength - arr.length).fill(defaultValue)]
}

export function encodeEmailProof(proof: TitleHashVerifierLib.EmailProofStruct) {
	return abiEncode(['tuple(bytes proof, bytes32[] publicInputs)'], [proof])
}
