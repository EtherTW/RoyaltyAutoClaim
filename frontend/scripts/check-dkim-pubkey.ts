/*

Extract the DKIM pubkey_hash from an email and check whether it's registered
in the UserOverrideableDKIMRegistry on Base Sepolia.

bun run scripts/check-dkim-pubkey.ts registration

*/
import { Noir } from '@noir-lang/noir_js'
import { Contract, JsonRpcProvider, zeroPadValue } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import { CHAIN_ID, RPC_URL } from '../src/config'
import { prepareCircuitInputs, type TitleHashCircuitOutput } from '../src/lib/circuit-utils'

const DKIM_REGISTRY_ADDRESS = '0x3D3935B3C030893f118a84C92C66dF1B9E4169d6'
const DOMAIN = 'gmail.com'

// UserOverrideableDKIMRegistry calls owner() on msg.sender, so `from` must be
// any contract that exposes owner(). Using an existing Ownable contract here.
const FROM_ADDRESS = '0x1472623EDbDD627521691d9E87F9515f65452DA0'

const emailFile = process.argv[2]
if (!emailFile) {
	console.error('Please provide an email file name in emails folder as an argument (e.g. registration).')
	process.exit(1)
}

const emlPath = path.join(__dirname, '..', '..', 'emails', `${emailFile}.eml`)
const emlBuf = await fs.readFile(emlPath)

/* -------------------------------------------------------------------------- */
/*                      Extract DKIM selector from email                      */
/* -------------------------------------------------------------------------- */

const emailStr = emlBuf.toString()
const headerPart = emailStr.split(/\r?\n\r?\n/)[0] || ''
const dkimMatch = headerPart.match(/^dkim-signature:\s*(.+?)(?=\r?\n[^\s])/ims)
if (!dkimMatch) {
	console.error('DKIM-Signature header not found in email')
	process.exit(1)
}
const dkimHeader = dkimMatch[1]!.replace(/\r?\n\s+/g, '').replace(/\s+/g, '')
const selectorMatch = dkimHeader.match(/s=([^;]+)/i)
if (!selectorMatch) {
	console.error('DKIM selector (s=) not found in DKIM-Signature header')
	process.exit(1)
}
const selector = selectorMatch[1]!
console.log(`selector: ${selector}`)

/* -------------------------------------------------------------------------- */
/*                      Compute pubkey_hash from email                        */
/* -------------------------------------------------------------------------- */

const CIRCUIT_PATH = path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json')
const circuit = JSON.parse(await fs.readFile(CIRCUIT_PATH, 'utf-8'))
const circuitInputs = await prepareCircuitInputs(emlBuf)
const noir = new Noir(circuit)
const { returnValue } = await noir.execute(circuitInputs)
const pubkeyHash = zeroPadValue((returnValue as TitleHashCircuitOutput)[0], 32)
console.log(`pubkey_hash: ${pubkeyHash}`)

/* -------------------------------------------------------------------------- */
/*                         Call isDKIMPublicKeyHashValid                      */
/* -------------------------------------------------------------------------- */

const provider = new JsonRpcProvider(RPC_URL[CHAIN_ID.BASE_SEPOLIA])

const registry = new Contract(
	DKIM_REGISTRY_ADDRESS,
	['function isDKIMPublicKeyHashValid(string domain, bytes32 publicKeyHash) view returns (bool)'],
	provider,
)

const result = await provider.call({
	to: DKIM_REGISTRY_ADDRESS,
	from: FROM_ADDRESS,
	data: registry.interface.encodeFunctionData('isDKIMPublicKeyHashValid', [DOMAIN, pubkeyHash]),
})
const [isValid] = registry.interface.decodeFunctionResult('isDKIMPublicKeyHashValid', result)

console.log(`domain: ${DOMAIN}`)
console.log(`isDKIMPublicKeyHashValid: ${isValid}`)
process.exit(0)
