import { BUNDLER_URL, RPC_URL } from '@/config'
import {
	IRegistrationVerifier,
	IRoyaltyAutoClaim__factory,
	MockToken__factory,
	RegistrationVerifier__factory,
	RoyaltyAutoClaim,
	RoyaltyAutoClaim__factory,
	RoyaltyAutoClaimProxy__factory,
	StringUtils__factory,
} from '@/typechain-v2'
import zkeSdk, { ProofData } from '@zk-email/sdk'
import { BigNumberish } from 'ethers'
import { ethers, JsonRpcProvider, keccak256, toUtf8Bytes, Wallet } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import {
	abiEncode,
	ENTRY_POINT_V08_ADDRESS,
	EntryPointV08__factory,
	ERC4337Bundler,
	fetchGasPriceAlchemy,
	fetchGasPricePimlico,
	UserOpBuilder,
} from 'sendop'
import { init, parseEmail } from '@zk-email/relayer-utils'
import { createHash } from 'crypto'

const VITE_TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY
if (!VITE_TEST_PRIVATE_KEY) {
	throw new Error('VITE_TEST_PRIVATE_KEY is not set')
}

const VITE_TEST_PRIVATE_KEY_2 = import.meta.env.VITE_TEST_PRIVATE_KEY_2
if (!VITE_TEST_PRIVATE_KEY_2) {
	throw new Error('VITE_TEST_PRIVATE_KEY_2 is not set')
}

/*

bun run test test/e2e-base-sepolia.test.ts

*/

const CHAIN_ID = '84532'

describe('e2e-base-sepolia', () => {
	const client = new JsonRpcProvider(RPC_URL[CHAIN_ID])
	const dev = new Wallet(VITE_TEST_PRIVATE_KEY, client) // owner, admin, reviewer
	const dev2 = new Wallet(VITE_TEST_PRIVATE_KEY_2, client) // reviewer
	const bundler = new ERC4337Bundler(BUNDLER_URL[CHAIN_ID], undefined, {
		batchMaxCount: 1,
	})

	let racAddress: string = '0xBD9d214a32e753065DEedD54D7A0926488A4F678'
	let rac: RoyaltyAutoClaim

	it.skip('should deploy contracts', async () => {
		// Deploy MockToken
		console.log('Deploying MockToken...')
		const tokenFactory = new MockToken__factory(dev)
		const token = await tokenFactory.deploy(dev.address, ethers.parseEther('2000'))
		await token.waitForDeployment()
		const tokenAddress = await token.getAddress()
		console.log('token deployed to', tokenAddress)

		// Deploy StringUtils
		console.log('Deploying StringUtils...')
		const stringUtils = await new StringUtils__factory(dev).deploy()
		await stringUtils.waitForDeployment()
		const stringUtilsAddress = await stringUtils.getAddress()

		// Deploy RegistrationVerifier
		console.log('Deploying RegistrationVerifier...')
		const RegistrationVerifier = new RegistrationVerifier__factory(
			{
				'lib/zk-email-verify/packages/contracts/utils/StringUtils.sol:StringUtils': stringUtilsAddress,
			},
			dev,
		)
		const dkimRegistryAddress = '0x3D3935B3C030893f118a84C92C66dF1B9E4169d6'
		const emailSender = ethers.keccak256(ethers.toUtf8Bytes('johnson86tw'))
		const registrationVerifier = await RegistrationVerifier.deploy(dkimRegistryAddress, emailSender)
		await registrationVerifier.waitForDeployment()
		const registrationVerifierAddress = await registrationVerifier.getAddress()
		console.log('RegistrationVerifier deployed to', registrationVerifierAddress)

		// Deploy RoyaltyAutoClaim Implementation
		console.log('Deploying RoyaltyAutoClaim...')
		const RoyaltyAutoClaimFactory = new RoyaltyAutoClaim__factory(dev)
		const impl = await RoyaltyAutoClaimFactory.deploy()
		await impl.waitForDeployment()
		const implAddress = await impl.getAddress()

		// Deploy RoyaltyAutoClaim Proxy
		console.log('Deploying RoyaltyAutoClaim Proxy...')
		const initData = impl.interface.encodeFunctionData('initialize', [
			dev.address,
			dev.address,
			tokenAddress,
			[dev.address, dev2.address],
			registrationVerifierAddress,
		])
		const RoyaltyAutoClaimProxyFactory = new RoyaltyAutoClaimProxy__factory(dev)
		const proxy = await RoyaltyAutoClaimProxyFactory.deploy(implAddress, initData)
		await proxy.waitForDeployment()
		racAddress = await proxy.getAddress()

		// Give proxy address initial balance
		console.log('Giving proxy 0.001 ETH...')
		const tx = await dev.sendTransaction({
			to: racAddress,
			value: ethers.parseEther('0.001'),
		})
		await tx.wait()

		// Send ERC20 tokens to proxy address
		console.log('Sending 1000 tokens to proxy...')
		const tx2 = await token.transfer(racAddress, ethers.parseEther('1000'))
		await tx2.wait()

		console.log('RoyaltyAutoClaim (proxy) deployed to', racAddress)

		rac = RoyaltyAutoClaim__factory.connect(racAddress, dev)
	})

	it('should register a submission', async () => {
		console.log('getting email header hash...')
		const headerHash = await getEmailHeaderHash()
		const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData('registerSubmission', [
			'test_title',
			dev.address,
			headerHash,
		])

		console.log('building user op...')
		const op = await buildUserOp(client, bundler, racAddress, callData)

		console.log('estimating gas...')
		await op.estimateGas()

		console.log('generating proof...')
		const { encodedProof } = await genProof(op.hash())
		op.setSignature(encodedProof)

		console.log('sending user op...')
		await op.send()
		const receipt = await op.wait()
		expect(receipt.success).to.be.true
	})
})

async function buildUserOp(client: JsonRpcProvider, bundler: ERC4337Bundler, racAddress: string, callData: string) {
	const ep8 = EntryPointV08__factory.connect(ENTRY_POINT_V08_ADDRESS, client)
	return new UserOpBuilder({ chainId: CHAIN_ID, bundler, entryPointAddress: ENTRY_POINT_V08_ADDRESS })
		.setSender(racAddress)
		.setNonce(await ep8.getNonce(racAddress, 0))
		.setCallData(callData)
		.setGasPrice(await fetchGasPricePimlico(BUNDLER_URL[CHAIN_ID]))
		.setSignature(makeDummyProof())
}

function makeDummyProof() {
	const signals = [
		'6632353713085157925504008443078919716322386156160602218536961028046468237192',
		'179174940957233788236917956282329359906',
		'176110912359975412458775129071667004373',
		'144410967236643786077007722',
		'4992959312512230116538335825132076927052637790830533900315071821365',
		'0',
		'177045085285232709542537618269527952589681117750617699131261990920761210928',
		'92257159006731089366315165519870804725597858279156282923563106939566373177',
		'1664575074',
		'86956402115569186678976683596652684038744075192332976861274474050868246576',
		'60711670697043939388974385',
		'0',
		'101416967175074719038583385171847465562279603042408990230194853000221063216',
		'99635071615613853787267804745590275529592623559349626435243814902697440102',
		'926495280',
	]
	const proof: IRegistrationVerifier.ZkEmailProofStruct = {
		a: [BigInt(0), BigInt(0)],
		b: [
			[BigInt(0), BigInt(0)],
			[BigInt(0), BigInt(0)],
		],
		c: [BigInt(0), BigInt(0)],
		signals,
	}
	return encodeZkEmailProof(proof)
}

function encodeZkEmailProof(proof: IRegistrationVerifier.ZkEmailProofStruct) {
	return abiEncode(['tuple(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[15] signals)'], [proof])
}

async function genProof(userOpHash: string) {
	const sdk = zkeSdk()
	const blueprint = await sdk.getBlueprint('johnson86tw/RoyaltyAutoClaim@v27')
	const prover = blueprint.createProver({ isLocal: false })
	const eml = await fs.readFile(path.join(__dirname, '..', '..', 'emails', 'registration.eml'), 'utf-8')
	const proof = await prover.generateProof(eml, [
		{
			name: 'userOpHash',
			value: userOpHash,
			maxLength: 66,
		},
	])

	const proofData = proof.props.proofData as unknown as ProofData
	const publicOutputs = proof.props.publicOutputs as unknown as string[]
	const zkEmailProof: IRegistrationVerifier.ZkEmailProofStruct = {
		a: [BigInt(proofData.pi_a[0]), BigInt(proofData.pi_a[1])],
		b: [
			[BigInt(proofData.pi_b[0][1]), BigInt(proofData.pi_b[0][0])],
			[BigInt(proofData.pi_b[1][1]), BigInt(proofData.pi_b[1][0])],
		],
		c: [BigInt(proofData.pi_c[0]), BigInt(proofData.pi_c[1])],
		signals: publicOutputs.map(output => BigInt(output)),
	}
	const encodedProof = encodeZkEmailProof(zkEmailProof)

	return {
		proof: zkEmailProof,
		encodedProof,
	}
}

async function getEmailHeaderHash(eml: string) {
	const parsedEmail = await parseEmail(eml)
	return '0x' + createHash('sha256').update(parsedEmail.canonicalizedHeader).digest('hex')
}
