const str = process.argv[2] as string

const bytes = Array.from(Buffer.from(str, 'utf-8'))
console.log('length:', bytes.length)
console.log(bytes)
