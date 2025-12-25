import fs from 'fs'
import { parseEmail } from './utils'

const emlPath = process.argv[2]

if (!emlPath) {
	console.error('Usage: bun script/parseEmail.ts <path-to-eml-file>')
	process.exit(1)
}

// Check email file exists
if (!fs.existsSync(emlPath)) {
	console.error(`[ERROR]: Email file not found: ${emlPath}`)
	process.exit(1)
}

const eml = fs.readFileSync(emlPath)

const { title, recipient, nullifier } = await parseEmail(eml)
console.log({ title, recipient, nullifier })
