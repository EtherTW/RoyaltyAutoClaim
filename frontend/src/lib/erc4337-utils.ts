import { randomBytes } from 'crypto'
import { hexlify, JsonRpcProvider } from 'ethers'
import { ENTRY_POINT_V08_ADDRESS, EntryPointV08__factory, fetchGasPricePimlico, UserOpBuilder } from 'sendop'
import { BUNDLER_URL, CHAIN_ID, PREDEFINED_VGL_BASE, PREDEFINED_VGL_BASE_SEPOLIA } from '../config'

export async function buildUserOp({ royaltyAutoClaimAddress, chainId, client, bundler, callData }) {
	const ep8 = EntryPointV08__factory.connect(ENTRY_POINT_V08_ADDRESS, client)
	return new UserOpBuilder({ chainId: chainId, bundler, entryPointAddress: ENTRY_POINT_V08_ADDRESS })
		.setSender(royaltyAutoClaimAddress)
		.setNonce(await ep8.getNonce(royaltyAutoClaimAddress, 0))
		.setCallData(callData)
		.setGasPrice(await fetchGasPricePimlico(BUNDLER_URL[chainId]))
}

export function getPredefinedVglForZkProof(chainId: string): number {
	if (chainId === CHAIN_ID.BASE_SEPOLIA) return PREDEFINED_VGL_BASE_SEPOLIA
	if (chainId === CHAIN_ID.BASE) return PREDEFINED_VGL_BASE
	throw new Error(`No PREDEFINED_VGL for chainId ${chainId}`)
}

export function setPredefinedVglForZkProof(op: UserOpBuilder, chainId: string) {
	op.setGasValue({ verificationGasLimit: getPredefinedVglForZkProof(chainId) })
}

export async function getNonceV08(senderAddress: string, client: JsonRpcProvider) {
	const ep8 = EntryPointV08__factory.connect(ENTRY_POINT_V08_ADDRESS, client)
	return await ep8.getNonce(senderAddress, hexlify(randomBytes(8)))
}
