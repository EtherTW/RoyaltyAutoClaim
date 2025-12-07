import circom_tester from 'circom_tester'
import * as path from 'path'
import regexJson from '../circom/subject_prefix_regex.json'
import { extractSubstrIdxes, padString } from '../utils'

const wasm_tester = circom_tester.wasm

describe('subject_prefix_regex', () => {
	let circuit: any
	beforeAll(async () => {
		circuit = await wasm_tester(path.join(__dirname, '../circom/subject_prefix_regex_test.circom'), {
			include: path.join(__dirname, '../node_modules'),
		})
	})

	it('test registration', async () => {
		const subjectPrefix =
			'subject: =?UTF-8?B?56K66KqN5bey5pS25Yiw5oqV56i/OiDpmrHnp4HmsaDnmoToqK3oqIggYnkgY2MgbGlhbg==?==?UTF-8?B?Zw==?=\r\n'
		const paddedStr = padString(subjectPrefix, 256)
		const circuitInputs = {
			msg: paddedStr,
		}
		const witness = await circuit.calculateWitness(circuitInputs)
		await circuit.checkConstraints(witness)
		expect(1n).toEqual(witness[1])

		const allIdxes = extractSubstrIdxes(subjectPrefix, regexJson, false)
		const prefixIdxes = allIdxes[0]
		if (!prefixIdxes) {
			throw new Error('Expected to extract at least one substring')
		}

		console.log('allIdxes', allIdxes)
		console.log('paddedStr', paddedStr)
		console.log('witness', witness)

		for (let idx = 0; idx < 256; ++idx) {
			if (idx >= prefixIdxes[0] && idx < prefixIdxes[1]) {
				const byte = paddedStr[idx]
				if (!byte) {
					throw new Error('paddedStr[idx] is undefined')
				}
				expect(BigInt(byte)).toEqual(witness[2 + idx])
			} else {
				expect(0n).toEqual(witness[2 + idx])
			}
		}
	})

	it('test recipient update', async () => {
		const subjectPrefix =
			'subject: =?UTF-8?B?56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2AOiDpmrHnp4HmsaA=?==?UTF-8?B?55qE6Kit6KiIIGJ5IGNjIGxpYW5n?=\r\n'
		const paddedStr = padString(subjectPrefix, 256)
		const circuitInputs = {
			msg: paddedStr,
		}
		const witness = await circuit.calculateWitness(circuitInputs)
		await circuit.checkConstraints(witness)
		expect(1n).toEqual(witness[1])

		const allIdxes = extractSubstrIdxes(subjectPrefix, regexJson, false)
		const prefixIdxes = allIdxes[0]
		if (!prefixIdxes) {
			throw new Error('Expected to extract at least one substring')
		}

		console.log('allIdxes', allIdxes)
		console.log('paddedStr', paddedStr)
		console.log('witness', witness)

		for (let idx = 0; idx < 256; ++idx) {
			if (idx >= prefixIdxes[0] && idx < prefixIdxes[1]) {
				const byte = paddedStr[idx]
				if (!byte) {
					throw new Error('paddedStr[idx] is undefined')
				}
				expect(BigInt(byte)).toEqual(witness[2 + idx])
			} else {
				expect(0n).toEqual(witness[2 + idx])
			}
		}
	})
})
