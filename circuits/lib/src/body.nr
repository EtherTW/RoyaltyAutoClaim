use zkemail::{headers::constrain_header_field, Sequence};

global NUMBER_FIELD_NAME_LENGTH: u32 = 2; // "No"
global MAX_NUMBER_FIELD_LENGTH: u32 = 7; // "No: 255"
global MAX_NUMBER_LENGTH: u32 = 3; // "255"
global DIGIT_CHAR_TABLE: [u8; 128] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

// Recipient field constants
global RECIPIENT_FIELD_NAME_LENGTH: u32 = 9; // "Recipient"
global MAX_RECIPIENT_FIELD_LENGTH: u32 = 54; // "Recipient: 0x" + 40 hex + "\r\n"
global HEX_CHAR_TABLE: [u8; 128] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

pub fn get_number<let MAX_EMAIL_BODY_LENGTH: u32>(
    body: BoundedVec<u8, MAX_EMAIL_BODY_LENGTH>,
    number_field_seq: Sequence,
    number_seq: Sequence,
) -> u16 {
    // Check field exists (field name must be followed by a colon)
    let number_field_name = comptime { "No".as_bytes() };
    constrain_header_field::<MAX_EMAIL_BODY_LENGTH, MAX_NUMBER_FIELD_LENGTH, NUMBER_FIELD_NAME_LENGTH>(
        body,
        number_field_seq,
        number_field_name,
    );

    // Check field value is within the field
    assert(
        number_seq.index >= number_field_seq.index
            & number_seq.end_index() <= number_field_seq.end_index(),
        "number_seq out of bounds",
    );

    // Check the number is digit and assign
    let mut number: u16 = 0;
    for i in 0..MAX_NUMBER_LENGTH {
        let index = number_seq.index + i;
        if index < number_seq.end_index() {
            let byte: u8 = body.get_unchecked(index);
            assert(DIGIT_CHAR_TABLE[byte] == 1, "Number must be digit characters");
            let digit: u8 = byte - 48; // Convert ASCII to digit value ('0' is 48)
            number = number * 10 + (digit as u16);
        }
    }
    number
}

pub fn get_recipient_address<let MAX_EMAIL_BODY_LENGTH: u32>(
    body: BoundedVec<u8, MAX_EMAIL_BODY_LENGTH>,
    recipient_field_seq: Sequence,
    recipient_seq: Sequence,
) -> Field {
    // Step 1: Validate the "Recipient" field exists
    let recipient_field_name = comptime { "Recipient".as_bytes() };
    constrain_header_field::<MAX_EMAIL_BODY_LENGTH, MAX_RECIPIENT_FIELD_LENGTH, RECIPIENT_FIELD_NAME_LENGTH>(
        body,
        recipient_field_seq,
        recipient_field_name,
    );

    // Step 2: Validate recipient_seq is within recipient_field_seq bounds
    assert(
        recipient_seq.index >= recipient_field_seq.index
            & recipient_seq.end_index() <= recipient_field_seq.end_index(),
        "recipient_seq out of bounds",
    );

    // Step 3: Validate "0x" prefix
    let first_char = body.get_unchecked(recipient_seq.index);
    let second_char = body.get_unchecked(recipient_seq.index + 1);
    assert(first_char == 48, "Address must start with '0'"); // '0' = ASCII 48
    assert(second_char == 120, "Address must have 'x' after '0'"); // 'x' = ASCII 120

    // Step 4: Parse 40 hex characters into 20 bytes
    let mut address_bytes: [u8; 20] = [0; 20];

    // Start after "0x" prefix
    let hex_start = recipient_seq.index + 2;

    for i in 0..20 {
        // Each byte is formed from 2 hex characters
        let high_char = body.get_unchecked(hex_start + i * 2);
        let low_char = body.get_unchecked(hex_start + i * 2 + 1);

        // Parse hex chars to nibbles and combine
        let high_nibble = parse_hex_char(high_char);
        let low_nibble = parse_hex_char(low_char);

        // Combine: high nibble is upper 4 bits
        address_bytes[i] = (high_nibble * 16) + low_nibble;
    }

    // Step 5: Convert 20-byte array to Field (big-endian)
    Field::from_be_bytes::<20>(address_bytes)
}

/// Converts a hex ASCII character to its nibble value (0-15)
fn parse_hex_char(c: u8) -> u8 {
    assert(HEX_CHAR_TABLE[c as u32] == 1, "Invalid hex character");

    // Convert ASCII to nibble value
    if (c >= 48) & (c <= 57) {
        // '0'-'9': ASCII 48-57 -> 0-9
        c - 48
    } else if (c >= 65) & (c <= 70) {
        // 'A'-'F': ASCII 65-70 -> 10-15
        c - 65 + 10
    } else {
        // 'a'-'f': ASCII 97-102 -> 10-15
        c - 97 + 10
    }
}
