// Generate a char table where hex chars (0-9, a-f, A-F) have value 1, all others 0

const table: number[] = []

// ASCII codes: 0-127
// Digits '0'-'9': ASCII 48-57
// Upper 'A'-'F': ASCII 65-70
// Lower 'a'-'f': ASCII 97-102

for (let i = 0; i <= 127; i++) {
	if ((i >= 48 && i <= 57) ||  // '0'-'9'
		(i >= 65 && i <= 70) ||  // 'A'-'F'
		(i >= 97 && i <= 102)) { // 'a'-'f'
		table.push(1)
	} else {
		table.push(0)
	}
}

// Format output similar to the Rust example
const ITEMS_PER_ROW = 32
let output = 'global HEX_CHAR_TABLE: [u8; 128] = [\n'

for (let i = 0; i < table.length; i += ITEMS_PER_ROW) {
	const row = table.slice(i, i + ITEMS_PER_ROW)
	output += '    ' + row.join(', ') + ',\n'
}

output += '];'

console.log(output)
