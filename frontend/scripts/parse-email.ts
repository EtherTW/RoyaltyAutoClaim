/*

bun run scripts/parse-email.ts registration

*/
import { Noir } from '@noir-lang/noir_js'
import fs from 'fs/promises'
import { zeroPadValue } from 'ethers'
import path from 'path'
import { parseEmail, prepareCircuitInputs, type TitleHashCircuitOutput } from '../src/lib/circuit-utils'

const emailFile = process.argv[2]
if (!emailFile) {
	console.error('Please provide an email file name in emails folder as an argument (e.g. registration).')
	process.exit(1)
}
const emlPath = path.join(__dirname, '..', '..', 'emails', `${emailFile}.eml`)
const emlBuf = await fs.readFile(emlPath)

const emailData = await parseEmail(emlBuf)
console.log(emailData)

// Compute pubkey_hash by executing the circuit (no proof generation needed)
const CIRCUIT_PATH = path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json')
const circuit = JSON.parse(await fs.readFile(CIRCUIT_PATH, 'utf-8'))
const circuitInputs = await prepareCircuitInputs(emlBuf)
const noir = new Noir(circuit)
const { returnValue } = await noir.execute(circuitInputs)
const pubkeyHash = (returnValue as TitleHashCircuitOutput)[0]
console.log(`pubkey_hash: ${zeroPadValue(pubkeyHash, 32)}`)
