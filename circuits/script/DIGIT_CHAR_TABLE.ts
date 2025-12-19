// Generate a char table where digits 0-9 have value 1, all others have value 0

const table: number[] = []

// ASCII codes: 0-127
// Digits '0'-'9' are ASCII 48-57

for (let i = 0; i <= 127; i++) {
	if (i >= 48 && i <= 57) {
		table.push(1) // digit
	} else {
		table.push(0)
	}
}

// Format output similar to the Rust example
const ITEMS_PER_ROW = 32
let output = 'global DIGIT_CHAR_TABLE: [u8; 128] = [\n'

for (let i = 0; i < table.length; i += ITEMS_PER_ROW) {
	const row = table.slice(i, i + ITEMS_PER_ROW)
	output += '    ' + row.join(', ') + ',\n'
}

output += '];'

console.log(output)
