import { UltraHonkBackend } from '@aztec/bb.js'
import fs from 'fs'
import path from 'path'

const circuitName = process.argv[2]

if (!circuitName) {
	console.error('Usage: bun script/genVerifier.ts <circuitName>')
	process.exit(1)
}

const CIRCUIT_TARGET_PATH = path.join(__dirname, `../${circuitName}/target`)
const CIRCUIT_PATH = path.join(CIRCUIT_TARGET_PATH, `${circuitName}.json`)
const VERIFIER_PATH = path.join(CIRCUIT_TARGET_PATH, `${snakeToPascal(circuitName)}Verifier.sol`)

function snakeToPascal(str: string): string {
	const camel = str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
	return camel.charAt(0).toUpperCase() + camel.slice(1)
}

async function generateVerifier() {
	// Check circuit exists
	if (!fs.existsSync(CIRCUIT_PATH)) {
		console.error('[ERROR]: Circuit not found!')
		console.error(`Expected: ${CIRCUIT_PATH}`)
		console.error('\nRun: pnpm run compile')
		process.exit(1)
	}

	const circuit = JSON.parse(fs.readFileSync(CIRCUIT_PATH, 'utf-8'))
	const circuitSize = (fs.statSync(CIRCUIT_PATH).size / 1024 / 1024).toFixed(2)
	console.log(`Circuit loaded: ${CIRCUIT_PATH}`)
	console.log(`Circuit size: ${circuitSize} MB`)
	console.log(`Noir version: ${circuit.noir_version}\n`)

	console.log('Initializing UltraHonk backend...')
	const backend = new UltraHonkBackend(circuit.bytecode)

	try {
		console.log('Generating Solidity verifier contract...\n')
		const startTime = Date.now()
		const contract = await backend.getSolidityVerifier()
		const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

		const contractStr = typeof contract === 'string' ? contract : new TextDecoder().decode(contract)

		fs.writeFileSync(VERIFIER_PATH, contractStr)

		const contractSize = (contractStr.length / 1024).toFixed(2)
		console.log(`Verifier contract generated in ${elapsed}s`)
		console.log(`Output: ${VERIFIER_PATH}`)
		console.log(`Contract size: ${contractSize} KB\n`)

		// Parse public inputs count (if available)
		const publicInputsMatch = contractStr.match(/uint256 constant NUMBER_OF_PUBLIC_INPUTS = (\d+)/)
		if (publicInputsMatch) {
			console.log(`Public inputs: ${publicInputsMatch[1]}`)
		}

		console.log('\n[SUCCESS]: Solidity verifier generated.')
	} catch (error) {
		console.error('\n[ERROR]: Failed to generate verifier')
		if (error instanceof Error) {
			console.error(error.message)
			if (error.stack) {
				console.error('\nStack trace:')
				console.error(error.stack)
			}
		} else {
			console.error(String(error))
		}
		process.exit(1)
	} finally {
		await backend.destroy()
	}
}

generateVerifier().catch(err => {
	console.error('[ERROR]: Unhandled error:', err)
	process.exit(1)
})
