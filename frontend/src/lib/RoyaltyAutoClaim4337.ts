import { concat, JsonRpcProvider, JsonRpcSigner, toBeHex } from 'ethers'
import {
	getEntryPointContract,
	sendop,
	type Bundler,
	type Execution,
	type OperationGetter,
	type SendOpResult,
} from 'sendop'

export const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS = '0xD5A67711b92eB0a4FAc29fe59F8f57802BA83e21' // first deployed proxy address on local network

export class RoyaltyAutoClaim4337 implements OperationGetter {
	client: JsonRpcProvider
	bundler: Bundler
	signer: JsonRpcSigner

	constructor(options: { client: JsonRpcProvider; bundler: Bundler; signer: JsonRpcSigner }) {
		this.client = options.client
		this.bundler = options.bundler
		this.signer = options.signer
	}

	async sendCalldata(calldata: string): Promise<SendOpResult> {
		return await sendop({
			bundler: this.bundler,
			executions: [{ to: ROYALTY_AUTO_CLAIM_PROXY_ADDRESS, data: calldata, value: '0x0' }],
			opGetter: this,
		})
	}

	getSender() {
		return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS
	}

	async getNonce() {
		const nonce: bigint = await getEntryPointContract(this.client).getNonce(ROYALTY_AUTO_CLAIM_PROXY_ADDRESS, 0)
		return toBeHex(nonce)
	}

	getCallData(executions: Execution[]) {
		return executions[0].data
	}

	async getDummySignature() {
		return concat([
			'0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c',
			this.signer.address,
		])
	}

	async getSignature(userOpHash: Uint8Array) {
		const sig = await this.signer.signMessage(userOpHash)
		return concat([sig, this.signer.address])
	}
}
