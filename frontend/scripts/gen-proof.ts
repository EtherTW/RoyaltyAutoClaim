import zkeSdk, { ProofData } from '@zk-email/sdk'
import fs from 'fs/promises'
import path from 'path'

const SLUG = 'johnson86tw/RoyaltyAutoClaim@v26'
const emailFile = process.argv[2];
if (!emailFile) {
  console.error('Please provide an email file name in emails folder as an argument (e.g. registration).');
  process.exit(1);
}
const EML = path.join(__dirname, '..', '..', 'emails', `${emailFile}.eml`);

console.log('Generating proof for:', SLUG)
console.log('Email file:', EML)

const sdk = zkeSdk()

// Get blueprint from the registry
const blueprint = await sdk.getBlueprint(SLUG)

const prover = blueprint.createProver({ isLocal: false })

// Read email file
const eml = await fs.readFile(EML, 'utf-8')

const proof = await prover.generateProof(eml)

console.log('Proof data: ', proof.props.proofData)
console.log('Public data: ', proof.props.publicData)
console.log('Public outputs: ', proof.props.publicOutputs)

const validation = await blueprint.validateEmail(eml)
if (validation !== undefined) {
	throw new Error('Email validation failed')
}

const verified = await blueprint.verifyProofOnChain(proof)
console.log('Verified:', verified)

if (verified) {
	const proofData = proof.props.proofData as unknown as ProofData
	const publicOutputs = proof.props.publicOutputs as unknown as string[]

	const args = [
		[BigInt(proofData.pi_a[0]), BigInt(proofData.pi_a[1])],
		[
			[BigInt(proofData.pi_b[0][1]), BigInt(proofData.pi_b[0][0])],
			[BigInt(proofData.pi_b[1][1]), BigInt(proofData.pi_b[1][0])],
		],
		[BigInt(proofData.pi_c[0]), BigInt(proofData.pi_c[1])],
		publicOutputs.map(output => BigInt(output)),
	] as const

	const bigIntReplacer = (_key: string, value: any) => {
		return typeof value === 'bigint' ? value.toString() : value
	}

	await fs.writeFile(path.join(__dirname, '..', '..', 'proof.json'), JSON.stringify(args, bigIntReplacer, 2))
}
