import { TitleHashVerifierLib } from '@/typechain-v2/out/RoyaltyAutoClaim.sol/RoyaltyAutoClaim'
import { UltraHonkBackend } from '@aztec/bb.js'
import { Noir } from '@noir-lang/noir_js'
import { abiEncode, zeroBytes } from 'sendop'
import {
	parseEmail,
	prepareCircuitInputs,
	prepareCircuitOutput,
	TitleHashCircuitOutput,
} from '../../../circuits/script/utils'
import { initializeWasm } from './wasmLoader'

export const DKIM_REGISTRY_ADDRESS = '0x3D3935B3C030893f118a84C92C66dF1B9E4169d6'
export const CIRCUIT_PATH = '/RoyaltyAutoClaim/title_hash.json'

export type ParsedEmailData = Awaited<ReturnType<typeof parseEmail>>

// Circuit and backend cache
let cachedCircuit: Record<string, unknown> | null = null
let cachedBackend: UltraHonkBackend | null = null
let cachedNoir: Noir | null = null

export function padArray<T>(arr: T[], targetLength: number, defaultValue: T): T[] {
	return arr.length >= targetLength ? arr : [...arr, ...Array(targetLength - arr.length).fill(defaultValue)]
}

export function encodeEmailProof(proof: TitleHashVerifierLib.EmailProofStruct) {
	return abiEncode(['tuple(bytes proof, bytes32[] publicInputs)'], [proof])
}

/**
 * Load the compiled circuit JSON
 */
export async function loadCircuit(): Promise<Record<string, unknown>> {
	if (cachedCircuit) {
		return cachedCircuit
	}

	const response = await fetch(CIRCUIT_PATH)
	if (!response.ok) {
		throw new Error('Failed to load circuit. Make sure the circuit is compiled.')
	}
	cachedCircuit = await response.json()
	return cachedCircuit as Record<string, unknown>
}

/**
 * Initialize Noir and UltraHonk backend
 */
async function initializeBackend(circuit: Record<string, unknown>): Promise<{ noir: Noir; backend: UltraHonkBackend }> {
	if (cachedNoir && cachedBackend) {
		return { noir: cachedNoir, backend: cachedBackend }
	}

	await initializeWasm()

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const noir = new Noir(circuit as any)
	const backend = new UltraHonkBackend(circuit.bytecode as string)

	cachedNoir = noir
	cachedBackend = backend

	return { noir, backend }
}

export async function makeDummyEmailProof(eml: string) {
	const circuitInputs = await prepareCircuitInputs(Buffer.from(eml))
	const circuit = await loadCircuit()
	const { noir } = await initializeBackend(circuit)
	const { returnValue } = await noir.execute(circuitInputs)
	const circuitOutputs = prepareCircuitOutput(returnValue as TitleHashCircuitOutput)

	return encodeEmailProof({
		proof: zeroBytes(440 * 32),
		publicInputs: circuitOutputs,
	})
}

export async function generateEmailProof(eml: string, userOpHash: string): Promise<string> {
	const circuitInputs = await prepareCircuitInputs(Buffer.from(eml), userOpHash)
	const circuit = await loadCircuit()
	const { noir, backend } = await initializeBackend(circuit)
	const { witness } = await noir.execute(circuitInputs)
	const proof = await backend.generateProof(witness, { keccak: true })

	return encodeEmailProof(proof)
}

/**
 * Check if proof generation is supported
 */
export function isProofGenerationSupported(): { supported: boolean; reason?: string } {
	if (typeof WebAssembly === 'undefined') {
		return { supported: false, reason: 'WebAssembly not supported' }
	}
	if (typeof BigInt === 'undefined') {
		return { supported: false, reason: 'BigInt not supported' }
	}
	return { supported: true }
}

/**
 * Cleanup resources
 */
export async function cleanupProver(): Promise<void> {
	if (cachedBackend) {
		await cachedBackend.destroy()
		cachedBackend = null
		cachedNoir = null
	}
}
