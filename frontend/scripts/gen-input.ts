import zkeSdk from '@zk-email/sdk'
import fs from 'fs/promises'
import path from 'path'

const SLUG = 'johnson86tw/RoyaltyAutoClaim@v27'
const EML = path.join(__dirname, '..', '..', 'emails', 'registration.eml')

const sdk = zkeSdk()
const blueprint = await sdk.getBlueprint(SLUG)
const prover = blueprint.createProver({ isLocal: false })
const eml = await fs.readFile(EML, 'utf-8')

const inputs = JSON.parse(
	await prover.generateProofInputs(eml, [
		{
			name: 'userOpHash',
			value: '0x00b917632b69261f21d20e0cabdf9f3fa1255c6e500021997a16cf3a46d80297', // keccak("userOpHash")
			maxLength: 66,
		},
	]),
)

console.log(inputs)
