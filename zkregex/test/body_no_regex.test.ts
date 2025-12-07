import circom_tester from 'circom_tester'
import * as path from 'path'
import bodyNoRegexJson from '../circom/body_no_regex.json'
import { extractSubstrIdxes, padString } from '../utils'

const wasm_tester = circom_tester.wasm

describe('body_no_regex', () => {
	let circuit: any
	beforeAll(async () => {
		circuit = await wasm_tester(path.join(__dirname, '../circom/body_no_regex_test.circom'), {
			include: path.join(__dirname, '../node_modules'),
		})
	})

	it('test a regex of body no', async () => {
		const bodyNo = 'No: 1\r\n'
		const paddedStr = padString(bodyNo, 256)
		const circuitInputs = {
			msg: paddedStr,
		}
		const witness = await circuit.calculateWitness(circuitInputs)
		await circuit.checkConstraints(witness)
		expect(1n).toEqual(witness[1])

		const allIdxes = extractSubstrIdxes(bodyNo, bodyNoRegexJson, false)
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
