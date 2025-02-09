import { RoyaltyAutoClaim__factory } from '@/../typechain-types'
import { concat, JsonRpcProvider, JsonRpcSigner, toBeHex } from 'ethers'
import { defineStore } from 'pinia'
import {
	getEntryPointContract,
	sendop,
	type Bundler,
	type Execution,
	type OperationGetter,
	type SendOpResult,
} from 'sendop'
import { useBlockchainStore } from './useBlockchain'
import { useEOAStore } from './useEOA'

const ROYALTY_AUTO_CLAIM_PROXY_ADDRESS = '0x0000000000000000000000000000000000000000'

class RoyaltyAutoClaim4337 implements OperationGetter {
	client: JsonRpcProvider
	bundler: Bundler
	signer: JsonRpcSigner

	constructor(options: { client: JsonRpcProvider; bundler: Bundler; signer: JsonRpcSigner }) {
		this.client = options.client
		this.bundler = options.bundler
		this.signer = options.signer
	}

	async sendCalls(executions: Execution[]): Promise<SendOpResult> {
		return await sendop({
			bundler: this.bundler,
			executions,
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

export const useRoyaltyAutoClaimStore = defineStore('useRoyaltyAutoClaimStore', () => {
	const blockchainStore = useBlockchainStore()

	const royaltyAutoClaim = RoyaltyAutoClaim__factory.connect(ROYALTY_AUTO_CLAIM_PROXY_ADDRESS, blockchainStore.client)

	const royaltyAutoClaim4337 = computed(() => {
		const blockchainStore = useBlockchainStore()
		const eoaStore = useEOAStore()

		if (eoaStore.signer) {
			return new RoyaltyAutoClaim4337({
				client: blockchainStore.client,
				bundler: blockchainStore.bundler,
				signer: eoaStore.signer as JsonRpcSigner,
			})
		}

		return null
	})

	async function registerSubmission(title: string, recipient: string) {
		if (!royaltyAutoClaim4337.value) {
			throw new Error('No royaltyAutoClaim')
		}

		const op = await royaltyAutoClaim4337.value.sendCalls([
			{
				to: ROYALTY_AUTO_CLAIM_PROXY_ADDRESS,
				data: royaltyAutoClaim.interface.encodeFunctionData('registerSubmission', [title, recipient]),
				value: '0x0',
			},
		])
		await op.wait()
	}

	return {
		royaltyAutoClaim,
		royaltyAutoClaim4337,
		registerSubmission,
	}
})
