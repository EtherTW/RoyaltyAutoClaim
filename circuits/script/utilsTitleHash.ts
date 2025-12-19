import type { BoundedVec, RSAPubkey, Sequence } from './utils'

export type CircuitInputsTitleHash = {
	header: BoundedVec
	pubkey: RSAPubkey
	signature: string[]
	dkim_header_seq: Sequence
	body: BoundedVec
	body_hash_index: string
	from_header_seq: Sequence
	from_address_seq: Sequence
	subject_field_seq: Sequence
	subject_prefix_seq: Sequence
	number_field_seq: Sequence
	number_seq: Sequence
	recipient_field_seq: Sequence
	recipient_seq: Sequence
	id_field_seq: Sequence
	id_seq: Sequence
	user_op_hash: string[]
}

/**
 * Write circuit inputs to Prover.toml for title_hash circuit
 * @param circuitTargetPath - path to circuits/target directory
 * @param inputs - circuit inputs object for title_hash
 */
export function writeProverTomlTitleHash(circuitTargetPath: string, inputs: CircuitInputsTitleHash) {
	const fs = require('fs')
	const path = require('path')
	const tomlLines: string[] = []

	// Helper to format array of values
	const formatArray = (arr: (string | number)[]): string => {
		return '[' + arr.map(v => `"${v}"`).join(', ') + ']'
	}

	// Helper to format sequence
	const formatSequence = (seq: Sequence): string => {
		return `index = "${seq.index}"\nlength = "${seq.length}"`
	}

	// Helper to format BoundedVec
	const formatBoundedVec = (vec: BoundedVec): string => {
		return `len = "${vec.len}"\nstorage = ${formatArray(vec.storage)}`
	}

	// Write top-level fields
	tomlLines.push(`body_hash_index = "${inputs.body_hash_index}"`)
	tomlLines.push(`signature = ${formatArray(inputs.signature)}`)

	// Validate user_op_hash array (should be 2 hex strings)
	if (inputs.user_op_hash.length !== 2) {
		throw new Error(`user_op_hash must be an array of 2 hex strings, got ${inputs.user_op_hash.length}`)
	}
	tomlLines.push(`user_op_hash = ${formatArray(inputs.user_op_hash)}`)
	tomlLines.push('')

	// Write body section
	tomlLines.push('[body]')
	tomlLines.push(formatBoundedVec(inputs.body))
	tomlLines.push('')

	// Write dkim_header_seq section
	tomlLines.push('[dkim_header_seq]')
	tomlLines.push(formatSequence(inputs.dkim_header_seq))
	tomlLines.push('')

	// Write from_address_seq section
	tomlLines.push('[from_address_seq]')
	tomlLines.push(formatSequence(inputs.from_address_seq))
	tomlLines.push('')

	// Write from_header_seq section
	tomlLines.push('[from_header_seq]')
	tomlLines.push(formatSequence(inputs.from_header_seq))
	tomlLines.push('')

	// Write header section
	tomlLines.push('[header]')
	tomlLines.push(formatBoundedVec(inputs.header))
	tomlLines.push('')

	// Write pubkey section
	tomlLines.push('[pubkey]')
	tomlLines.push(`modulus = ${formatArray(inputs.pubkey.modulus)}`)
	tomlLines.push(`redc = ${formatArray(inputs.pubkey.redc)}`)
	tomlLines.push('')

	// Write subject_field_seq section
	tomlLines.push('[subject_field_seq]')
	tomlLines.push(formatSequence(inputs.subject_field_seq))
	tomlLines.push('')

	// Write subject_prefix_seq section
	tomlLines.push('[subject_prefix_seq]')
	tomlLines.push(formatSequence(inputs.subject_prefix_seq))
	tomlLines.push('')

	// Write number_field_seq section
	tomlLines.push('[number_field_seq]')
	tomlLines.push(formatSequence(inputs.number_field_seq))
	tomlLines.push('')

	// Write number_seq section
	tomlLines.push('[number_seq]')
	tomlLines.push(formatSequence(inputs.number_seq))
	tomlLines.push('')

	// Write recipient_field_seq section
	tomlLines.push('[recipient_field_seq]')
	tomlLines.push(formatSequence(inputs.recipient_field_seq))
	tomlLines.push('')

	// Write recipient_seq section
	tomlLines.push('[recipient_seq]')
	tomlLines.push(formatSequence(inputs.recipient_seq))
	tomlLines.push('')

	// Write id_field_seq section
	tomlLines.push('[id_field_seq]')
	tomlLines.push(formatSequence(inputs.id_field_seq))
	tomlLines.push('')

	// Write id_seq section
	tomlLines.push('[id_seq]')
	tomlLines.push(formatSequence(inputs.id_seq))

	const proverTomlPath = path.join(circuitTargetPath, '../Prover.toml')
	fs.writeFileSync(proverTomlPath, tomlLines.join('\n') + '\n')
}
