import { ENTRY_POINT_V08_ADDRESS, EntryPointV08__factory, fetchGasPricePimlico, UserOpBuilder } from 'sendop'
import { BUNDLER_URL } from '../config'

const FIXED_VERIFICATION_GAS_LIMIT = 1_089_906

export async function buildUserOp({ royaltyAutoClaimAddress, chainId, client, bundler, callData }) {
	const ep8 = EntryPointV08__factory.connect(ENTRY_POINT_V08_ADDRESS, client)
	return new UserOpBuilder({ chainId: chainId, bundler, entryPointAddress: ENTRY_POINT_V08_ADDRESS })
		.setSender(royaltyAutoClaimAddress)
		.setNonce(await ep8.getNonce(royaltyAutoClaimAddress, 0))
		.setCallData(callData)
		.setGasPrice(await fetchGasPricePimlico(BUNDLER_URL[chainId]))
}

export function setFixedVerificationGasLimitForZkProof(op: UserOpBuilder) {
	op.setGasValue({
		verificationGasLimit: FIXED_VERIFICATION_GAS_LIMIT,
	})
}
