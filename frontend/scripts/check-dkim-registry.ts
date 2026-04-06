/*

Check whether an email's DKIM public key hash is registered in the
UserOverrideableDKIMRegistry and show detailed status (shared pool,
user-scoped, pending delay).

Usage:
  bun run scripts/check-dkim-registry.ts <emailFile> [--chain base-sepolia|base] [--verifier <EmailVerifierAddress>]

Examples:
  bun run scripts/check-dkim-registry.ts test_prod
  bun run scripts/check-dkim-registry.ts test_prod --chain base
  bun run scripts/check-dkim-registry.ts test_prod --chain base --verifier 0x1234...

*/
import { Noir } from '@noir-lang/noir_js'
import { Contract, JsonRpcProvider, zeroPadValue } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import { CHAIN_ID, RPC_URL } from '../src/config'
import { DKIM_REGISTRY_ADDRESS } from '../src/lib/zkemail-utils'
import { prepareCircuitInputs, type TitleHashCircuitOutput } from '../src/lib/circuit-utils'

const DOMAIN = 'gmail.com'

const REGISTRY_ABI = [
	'function mainAuthorizer() view returns (address)',
	'function setTimestampDelay() view returns (uint256)',
	'function dkimPublicKeyHashes(string, bytes32, address) view returns (bool)',
	'function enabledTimeOfDKIMPublicKeyHash(bytes32) view returns (uint256)',
	'function revokedDKIMPublicKeyHashes(bytes32, address) view returns (bool)',
	'function reactivatedDKIMPublicKeyHashes(bytes32, address) view returns (bool)',
]

/* -------------------------------------------------------------------------- */
/*                              Parse CLI args                                */
/* -------------------------------------------------------------------------- */

function parseArgs() {
	const args = process.argv.slice(2)
	let emailFile: string | undefined
	let chain = 'base-sepolia'
	let verifier: string | undefined

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--chain') {
			chain = args[++i]
		} else if (args[i] === '--verifier') {
			verifier = args[++i]
		} else if (!emailFile) {
			emailFile = args[i]
		}
	}

	if (!emailFile) {
		console.error('Usage: bun run scripts/check-dkim-registry.ts <emailFile> [--chain base-sepolia|base] [--verifier <addr>]')
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

	return { emailFile, chainId, chain, verifier }
}

const { emailFile, chainId, chain, verifier } = parseArgs()

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

console.log(`\nDomain:        ${DOMAIN}`)
console.log(`Chain:         ${chain} (${chainId})`)
console.log(`Registry:      ${DKIM_REGISTRY_ADDRESS}`)
console.log(`Public Key Hash: ${pubkeyHash}`)

/* -------------------------------------------------------------------------- */
/*                          Query registry state                              */
/* -------------------------------------------------------------------------- */

const provider = new JsonRpcProvider(RPC_URL[chainId])
const registry = new Contract(DKIM_REGISTRY_ADDRESS, REGISTRY_ABI, provider)

const [mainAuth, delay] = await Promise.all([
	registry.mainAuthorizer() as Promise<string>,
	registry.setTimestampDelay() as Promise<bigint>,
])

const [sharedSet, enabledTime, sharedRevoked] = await Promise.all([
	registry.dkimPublicKeyHashes(DOMAIN, pubkeyHash, mainAuth) as Promise<boolean>,
	registry.enabledTimeOfDKIMPublicKeyHash(pubkeyHash) as Promise<bigint>,
	registry.revokedDKIMPublicKeyHashes(pubkeyHash, mainAuth) as Promise<boolean>,
])

console.log(`\n--- Shared Pool (mainAuthorizer: ${mainAuth}) ---`)
console.log(`Approved:      ${sharedSet}`)
console.log(`Revoked:       ${sharedRevoked}`)
console.log(`Delay:         ${delay} seconds`)

if (sharedSet && enabledTime > 0n) {
	const now = BigInt(Math.floor(Date.now() / 1000))
	if (now < enabledTime) {
		const remaining = enabledTime - now
		console.log(`Enabled At:    ${new Date(Number(enabledTime) * 1000).toISOString()}`)
		console.log(`Remaining:     ${remaining} seconds`)
		console.log(`Status:        PENDING (delay not passed)`)
	} else {
		console.log(`Enabled At:    ${new Date(Number(enabledTime) * 1000).toISOString()}`)
		console.log(`Status:        ACTIVE (delay passed)`)
	}
} else if (sharedSet) {
	console.log(`Status:        ACTIVE`)
} else {
	console.log(`Status:        NOT SET`)
}

/* -------------------------------------------------------------------------- */
/*                     Query user-scoped state (optional)                     */
/* -------------------------------------------------------------------------- */

if (verifier) {
	const verifierContract = new Contract(verifier, ['function owner() view returns (address)'], provider)
	const userAuth: string = await verifierContract.owner()

	const [userSet, userRevoked, userReactivated] = await Promise.all([
		registry.dkimPublicKeyHashes(DOMAIN, pubkeyHash, userAuth) as Promise<boolean>,
		registry.revokedDKIMPublicKeyHashes(pubkeyHash, userAuth) as Promise<boolean>,
		registry.reactivatedDKIMPublicKeyHashes(pubkeyHash, userAuth) as Promise<boolean>,
	])

	console.log(`\n--- User Scope (verifier: ${verifier}, owner: ${userAuth}) ---`)
	console.log(`Approved:      ${userSet}`)
	console.log(`Revoked:       ${userRevoked}`)
	console.log(`Reactivated:   ${userReactivated}`)

	// Compute overall validity using the same threshold logic as the contract
	let setThreshold = 0
	if (sharedSet) {
		const now = BigInt(Math.floor(Date.now() / 1000))
		setThreshold += now < enabledTime ? 1 : 2
	}
	if (userSet) setThreshold += 2

	let revokeThreshold = 0
	if (sharedRevoked) revokeThreshold += 1
	if (userRevoked) revokeThreshold += 2
	if (revokeThreshold === 1 && userReactivated) revokeThreshold -= 1

	const isValid = setThreshold >= 2 && revokeThreshold === 0
	console.log(`\n--- Overall Validity (for this verifier) ---`)
	console.log(`Set Threshold:    ${setThreshold} (need >= 2)`)
	console.log(`Revoke Threshold: ${revokeThreshold} (need == 0)`)
	console.log(`Valid:            ${isValid}`)
}

process.exit(0)
