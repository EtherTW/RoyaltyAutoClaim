/**
 * TypeScript implementation of extractSubstrIdxes
 * This is a pure TypeScript version of the Rust WASM function
 */

export interface RegexPartConfig {
	/** A flag indicating whether the substring matching with regex_def should be exposed */
	is_public?: boolean
	isPublic?: boolean
	/** A regex string */
	regex_def?: string
	regexDef?: string
}

export interface DecomposedRegexConfig {
	parts: RegexPartConfig[]
}

export class ExtractSubstrError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ExtractSubstrError'
	}
}

/**
 * Parse regex config from either a string or object
 */
function parseRegexConfig(regexConfig: string | DecomposedRegexConfig): DecomposedRegexConfig {
	if (typeof regexConfig === 'string') {
		try {
			return JSON.parse(regexConfig)
		} catch (e) {
			throw new ExtractSubstrError(`Failed to parse JSON string: ${e}`)
		}
	}
	return regexConfig
}

/**
 * Normalize part config to handle both camelCase and snake_case
 */
function normalizePartConfig(part: RegexPartConfig): { isPublic: boolean; regexDef: string } {
	const isPublic = part.is_public ?? part.isPublic ?? false
	const regexDef = part.regex_def ?? part.regexDef ?? ''
	return { isPublic, regexDef }
}

/**
 * Extract substring indices from input string based on decomposed regex configuration
 *
 * @param inputStr - The input string to search in
 * @param regexConfig - The decomposed regex configuration (string or object)
 * @param revealPrivate - If true, also return indices for non-public parts
 * @returns Array of [start, end] index tuples
 * @throws ExtractSubstrError if regex is invalid or match not found
 */
export function extractSubstrIdxes(
	inputStr: string,
	regexConfig: string | DecomposedRegexConfig,
	revealPrivate: boolean = false,
): Array<[number, number]> {
	// Parse the config
	const config = parseRegexConfig(regexConfig)

	// Validate each regex part individually
	for (let i = 0; i < config.parts.length; i++) {
		const partConfig = config.parts[i]
		if (!partConfig) continue
		const part = normalizePartConfig(partConfig)
		try {
			new RegExp(part.regexDef)
		} catch (e) {
			throw new ExtractSubstrError(
				`Invalid regex in parts, index ${i}: '${part.regexDef}' - ${e instanceof Error ? e.message : e}`,
			)
		}
	}

	// Construct the full regex pattern with groups for each part
	// Convert all capturing groups to non-capturing groups, then wrap the whole part in a capturing group
	let entireRegexStr = ''
	for (const part of config.parts) {
		const { regexDef } = normalizePartConfig(part)
		// Replace all "(" with "(?:" to make them non-capturing, except for lookaheads/lookbehinds
		const adjustedRegexDef = regexDef.replace(/\((?!\?)/g, '(?:')
		entireRegexStr += `(${adjustedRegexDef})`
	}

	// Compile the entire regex
	let entireRegex: RegExp
	try {
		entireRegex = new RegExp(entireRegexStr)
	} catch (e) {
		throw new ExtractSubstrError(`Failed to compile entire regex: ${e instanceof Error ? e.message : e}`)
	}

	// Find the match for the entire regex
	const match = inputStr.match(entireRegex)
	if (!match) {
		throw new ExtractSubstrError(`Substring of the entire regex ${entireRegexStr} is not found in given input_str`)
	}

	// Extract indices for public (or all if revealPrivate) parts
	const publicIdxes: Array<[number, number]> = []

	for (let i = 0; i < config.parts.length; i++) {
		const partConfig = config.parts[i]
		if (!partConfig) continue
		const part = normalizePartConfig(partConfig)

		if (part.isPublic || revealPrivate) {
			const capturedGroup = match[i + 1] // Capture groups are 1-indexed
			if (capturedGroup !== undefined) {
				// Find the position of this captured group in the original string
				const lastIdx = publicIdxes[publicIdxes.length - 1]
				const startIdx =
					match.index! +
					match[0].indexOf(
						capturedGroup,
						// Calculate offset by summing lengths of previous groups
						lastIdx ? lastIdx[1] - match.index! : 0,
					)
				publicIdxes.push([startIdx, startIdx + capturedGroup.length])
			}
		}
	}

	return publicIdxes
}

/**
 * Extract substring values (not just indices) from input string
 *
 * @param inputStr - The input string to search in
 * @param regexConfig - The decomposed regex configuration (string or object)
 * @param revealPrivate - If true, also return values for non-public parts
 * @returns Array of extracted substring values
 */
export function extractSubstr(
	inputStr: string,
	regexConfig: string | DecomposedRegexConfig,
	revealPrivate: boolean = false,
): string[] {
	const idxes = extractSubstrIdxes(inputStr, regexConfig, revealPrivate)
	return idxes.map(([start, end]) => inputStr.slice(start, end))
}
