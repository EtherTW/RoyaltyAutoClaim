import { buildBn128, F1Field } from 'ffjavascript'

async function main() {
	let bn128 = await buildBn128(true) // true = single-threaded mode for Bun compatibility
	const F = new F1Field(bn128.r)

	const a = F.e('9')
	const b = F.sqrt(a)
	console.log(b)

	bn128.terminate()
}

main()
