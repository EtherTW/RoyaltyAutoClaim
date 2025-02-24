import { concat, JsonRpcProvider, JsonRpcSigner, toBeHex, Wallet } from 'ethers'
import {
	getEntryPointContract,
	sendop,
	type Bundler,
	type Execution,
	type OperationGetter,
	type SendOpResult,
} from 'sendop'

export class RoyaltyAutoClaim4337 implements OperationGetter {
	sender: string
	client: JsonRpcProvider
	bundler: Bundler
	signer: JsonRpcSigner | Wallet

	constructor(options: {
		sender: string
		client: JsonRpcProvider
		bundler: Bundler
		signer: JsonRpcSigner | Wallet
	}) {
		this.sender = options.sender
		this.client = options.client
		this.bundler = options.bundler
		this.signer = options.signer
	}

	connect(signer: JsonRpcSigner | Wallet): RoyaltyAutoClaim4337 {
		this.signer = signer
		return this
	}

	async sendCalldata(calldata: string): Promise<SendOpResult> {
		return await sendop({
			bundler: this.bundler,
			executions: [{ to: this.sender, data: calldata, value: '0x0' }],
			opGetter: this,
		})
	}

	getSender() {
		return this.sender
	}

	async getNonce() {
		const nonce: bigint = await getEntryPointContract(this.client).getNonce(this.sender, 0)
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
