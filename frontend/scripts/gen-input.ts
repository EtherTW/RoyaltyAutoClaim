import zkeSdk from '@zk-email/sdk'
import fs from 'fs/promises'
import path from 'path'

const SLUG = 'johnson86tw/RoyaltyAutoClaim@v20'
const EML = path.join(__dirname, '..', '..', 'emails', 'success.eml')

console.log('Generating proof for:', SLUG)
console.log('Email file:', EML)

const sdk = zkeSdk()

// Get blueprint from the registry
const blueprint = await sdk.getBlueprint(SLUG)

const prover = blueprint.createProver({ isLocal: false })

// Read email file
const eml = await fs.readFile(EML, 'utf-8')

const inputs = await prover.generateProofInputs(eml)

console.log(inputs)

if (inputs) {
	await fs.writeFile(path.join(__dirname, '..', '..', 'circuits', 'input.json'), inputs)
	console.log('')
	console.log('Wrote inputs to', path.join(__dirname, '..', '..', 'circuits', 'circuit_js', 'input.json'))
}
