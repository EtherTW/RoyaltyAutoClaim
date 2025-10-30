import { parseEmailData } from '../src/lib/zkemail-utils'
import fs from 'fs/promises'
import path from 'path'

/*
bun run scripts/parse-email.ts registration
*/

const emailFile = process.argv[2]
if (!emailFile) {
	console.error('Please provide an email file name in emails folder as an argument (e.g. registration).')
	process.exit(1)
}
const eml = await fs.readFile(path.join(__dirname, '..', '..', 'emails', `${emailFile}.eml`), 'utf-8')

const emailData = await parseEmailData(eml)
console.log(emailData)
