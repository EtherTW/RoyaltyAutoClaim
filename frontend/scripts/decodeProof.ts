import { abiDecode } from 'sendop'
import { IRegistrationVerifier } from '../src/typechain-v2'

const encodedProof = process.argv[2]
if (!encodedProof) {
	process.exit(1)
}

console.log(decodeZkEmailProof(encodedProof))

function decodeZkEmailProof(encodedProof: string): IRegistrationVerifier.ZkEmailProofStruct {
	const decoded = abiDecode(['tuple(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[15] signals)'], encodedProof)

	const proof = {
		a: decoded[0].a,
		b: decoded[0].b,
		c: decoded[0].c,
		signals: decoded[0].signals,
	}

	// Validation
	if (proof.signals.length !== 15) {
		throw new Error(`Expected 15 signals, got ${proof.signals.length}`)
	}

	return proof
}
