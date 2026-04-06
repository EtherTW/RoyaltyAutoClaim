/*

Set a DKIM public key hash in the user-scoped record on the
UserOverrideableDKIMRegistry. The signer (PRIVATE_KEY) becomes the
authorizer, so this record is only valid for dapps whose
EmailVerifier.owner() matches the signer.

Usage:
  PRIVATE_KEY=0x... bun run scripts/set-dkim-pubkey.ts <emailFile> [--chain base-sepolia|base]

Examples:
  PRIVATE_KEY=0x... bun run scripts/set-dkim-pubkey.ts test_prod
  PRIVATE_KEY=0x... bun run scripts/set-dkim-pubkey.ts test_prod --chain base

*/
import { Noir } from '@noir-lang/noir_js'
import { Contract, JsonRpcProvider, Wallet, zeroPadValue } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import { CHAIN_ID, EXPLORER_URL, RPC_URL } from '../src/config'
import { DKIM_REGISTRY_ADDRESS } from '../src/lib/zkemail-utils'
import { prepareCircuitInputs, type TitleHashCircuitOutput } from '../src/lib/circuit-utils'
import { confirm } from './utils'

const DOMAIN = 'gmail.com'

const REGISTRY_ABI = [
	'function setDKIMPublicKeyHash(string, bytes32, address, bytes)',
	'function dkimPublicKeyHashes(string, bytes32, address) view returns (bool)',
]

/* -------------------------------------------------------------------------- */
/*                              Parse CLI args                                */
/* -------------------------------------------------------------------------- */

function parseArgs() {
	const args = process.argv.slice(2)
	let emailFile: string | undefined
	let chain = 'base-sepolia'

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--chain') {
			chain = args[++i]
		} else if (!emailFile) {
			emailFile = args[i]
		}
	}

	if (!emailFile) {
		console.error('Usage: PRIVATE_KEY=0x... bun run scripts/set-dkim-pubkey.ts <emailFile> [--chain base-sepolia|base]')
		process.exit(1)
	}

	const chainIdMap: Record<string, string> = {
		'base-sepolia': CHAIN_ID.BASE_SEPOLIA,
		'base': CHAIN_ID.BASE,
	}
	const chainId = chainIdMap[chain]
	if (!chainId) {
		console.error(`Unknown chain "${chain}". Use "base-sepolia" or "base".`)
		process.exit(1)
	}

	return { emailFile, chainId, chain }
}

const { emailFile, chainId, chain } = parseArgs()

const PRIVATE_KEY = process.env.PRIVATE_KEY
if (!PRIVATE_KEY) {
	console.error('PRIVATE_KEY environment variable is required.')
	process.exit(1)
}

/* -------------------------------------------------------------------------- */
/*                      Compute pubkey_hash from email                        */
/* -------------------------------------------------------------------------- */

const emlPath = path.join(__dirname, '..', '..', 'emails', `${emailFile}.eml`)
const emlBuf = await fs.readFile(emlPath)

const CIRCUIT_PATH = path.join(__dirname, '../../circuits/title_hash/target', 'title_hash.json')
const circuit = JSON.parse(await fs.readFile(CIRCUIT_PATH, 'utf-8'))
const circuitInputs = await prepareCircuitInputs(emlBuf)
const noir = new Noir(circuit)
const { returnValue } = await noir.execute(circuitInputs)
const pubkeyHash = zeroPadValue((returnValue as TitleHashCircuitOutput)[0], 32)

/* -------------------------------------------------------------------------- */
/*                         Connect wallet & confirm                           */
/* -------------------------------------------------------------------------- */

const provider = new JsonRpcProvider(RPC_URL[chainId])
const wallet = new Wallet(PRIVATE_KEY, provider)

console.log(`\nDomain:        ${DOMAIN}`)
console.log(`Chain:         ${chain} (${chainId})`)
console.log(`Registry:      ${DKIM_REGISTRY_ADDRESS}`)
console.log(`Public Key Hash: ${pubkeyHash}`)
console.log(`Authorizer:    ${wallet.address}`)

const registry = new Contract(DKIM_REGISTRY_ADDRESS, REGISTRY_ABI, wallet)

// Check if already set
const alreadySet = await registry.dkimPublicKeyHashes(DOMAIN, pubkeyHash, wallet.address)
if (alreadySet) {
	console.log('\nThis public key hash is already set for your authorizer. Nothing to do.')
	process.exit(0)
}

await confirm('\nThis will send a transaction to set the DKIM public key hash.')

/* -------------------------------------------------------------------------- */
/*                           Send transaction                                 */
/* -------------------------------------------------------------------------- */

console.log('Sending transaction...')
const tx = await registry.setDKIMPublicKeyHash(DOMAIN, pubkeyHash, wallet.address, '0x')
console.log(`Tx hash: ${tx.hash}`)
console.log(`Explorer: ${EXPLORER_URL[chainId]}/tx/${tx.hash}`)

console.log('Waiting for confirmation...')
const receipt = await tx.wait()
console.log(`Confirmed in block ${receipt.blockNumber}`)

// Verify
const isSet = await registry.dkimPublicKeyHashes(DOMAIN, pubkeyHash, wallet.address)
console.log(`\nVerification: dkimPublicKeyHashes("${DOMAIN}", hash, ${wallet.address}) = ${isSet}`)

process.exit(0)
