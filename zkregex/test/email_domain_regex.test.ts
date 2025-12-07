import circom_tester from 'circom_tester'
import * as path from 'path'
import emailDomainRegexJson from '../circom/email_domain_regex.json'
import { extractSubstrIdxes, padString } from '../utils'

const wasm_tester = circom_tester.wasm

describe('email_domain_regex', () => {
	let circuit: any
	beforeAll(async () => {
		circuit = await wasm_tester(path.join(__dirname, '../circom/email_domain_regex_test.circom'), {
			include: path.join(__dirname, '../node_modules'),
		})
	})

	it('test a regex of an email domain', async () => {
		const emailAddr = 'suegamisora@gmail.com'
		const paddedStr = padString(emailAddr, 256)
		const circuitInputs = {
			msg: paddedStr,
		}
		const witness = await circuit.calculateWitness(circuitInputs)
		await circuit.checkConstraints(witness)
		expect(1n).toEqual(witness[1])

		const allIdxes = extractSubstrIdxes(emailAddr, emailDomainRegexJson, false)
		const prefixIdxes = allIdxes[0]
		if (!prefixIdxes) {
			throw new Error('Expected to extract at least one substring')
		}
		for (let idx = 0; idx < 256; ++idx) {
			if (idx >= prefixIdxes[0] && idx < prefixIdxes[1]) {
				expect(BigInt(paddedStr[idx] as number)).toEqual(witness[2 + idx])
			} else {
				expect(0n).toEqual(witness[2 + idx])
			}
		}
	})
})
