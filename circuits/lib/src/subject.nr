use noir_base64::BASE64_NO_PAD_DECODER;
use std::collections::bounded_vec::BoundedVec;
use zkemail::{headers::constrain_header_field, Sequence};

// RFC 2047 MIME-encoded subject extraction with support for multiple encoded-words
//
// Example 1 (single encoded-word):
//   subject:=?UTF-8?B?56K66KqN5bey5pS25Yiw5oqV56i/OiBUZXN0IGJ5IEFsaWNl?=
//   encoded_word_seqs[0]: points to "56K66KqN5bey5pS25Yiw5oqV56i/OiBUZXN0IGJ5IEFsaWNl"
//
// Example 2 (multiple encoded-words per RFC 2047):
//   subject:=?UTF-8?B?56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2AOiBUZXN0IGJ5IEFsaQ==?= =?UTF-8?B?Y2U=?=
//   encoded_word_seqs[0]: points to "56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2AOiBUZXN0IGJ5IEFsaQ"
//   encoded_word_seqs[1]: points to "Y2U"
//
// The circuit validates that concatenating base64 from encoded_word_seqs matches subject_base64_value

global MAX_SUBJECT_FIELD_LENGTH: u32 = 256;
global MAX_ENCODED_WORD_LENGTH: u32 = 128; // Each individual encoded word max length
global MAX_DECODED_LENGTH: u32 = 96; // Each individual decoded word max length (base64 decode: 128 * 3/4 = 96)

// MIME encoding prefix: "=?UTF-8?B?"
global MIME_ENCODING_PREFIX_LENGTH: u32 = 10;

global REGISTRATION_PREFIX_LENGTH: u32 = 21;
global RECIPIENT_UPDATE_PREFIX_LENGTH: u32 = 39;

pub fn extract_subject<let MAX_EMAIL_HEADER_LENGTH: u32, let MAX_DECODED_SUBJECT_LENGTH: u32, let MAX_TITLE_LENGTH: u32, let MAX_ENCODED_WORDS: u32>(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    subject_field_seq: Sequence,
    subject_seq: Sequence,
    encoded_word_seqs: [Sequence; MAX_ENCODED_WORDS],
    title_seq: Sequence,
) -> (Field, BoundedVec<u8, MAX_TITLE_LENGTH>) {
    // Check the subject field exists
    let subject_field_name = comptime { "subject".as_bytes() };
    constrain_header_field::<MAX_EMAIL_HEADER_LENGTH, MAX_SUBJECT_FIELD_LENGTH, 7>(
        header,
        subject_field_seq,
        subject_field_name,
    );

    // Check the subject is within the subject field
    assert(
        subject_seq.index >= subject_field_seq.index
            & subject_seq.end_index() <= subject_field_seq.end_index(),
        "subject_seq out of bounds",
    );

    // Check MIME encoding prefix exists at the start of the subject
    let mime_prefix: [u8; MIME_ENCODING_PREFIX_LENGTH] = comptime { "=?UTF-8?B?".as_bytes() };
    let computed_mime_prefix = extract_bytes::<MAX_EMAIL_HEADER_LENGTH, MIME_ENCODING_PREFIX_LENGTH>(
        header,
        subject_seq.index,
        MIME_ENCODING_PREFIX_LENGTH,
    );

    assert(computed_mime_prefix.storage == mime_prefix, "Invalid MIME encoding prefix");

    // Base64 decoding
    let decoded_subject = decode_encoded_words::<MAX_EMAIL_HEADER_LENGTH, MAX_DECODED_SUBJECT_LENGTH, MAX_ENCODED_WORDS>(
        header,
        subject_seq,
        encoded_word_seqs,
    );

    /* -------------------------------------------------------------------------- */
    /*                           Identify operation type                          */
    /* -------------------------------------------------------------------------- */
    let registration_prefix: [u8; REGISTRATION_PREFIX_LENGTH] = comptime { "確認已收到投稿".as_bytes() };
    let recipient_update_prefix: [u8; RECIPIENT_UPDATE_PREFIX_LENGTH] =
        comptime { "確認此投稿更改稿費收取地址".as_bytes() };

    let mut operation_type: Field = 0;

    // Check if it matches registration prefix
    let extracted_registration_prefix = extract_bytes::<MAX_DECODED_SUBJECT_LENGTH, REGISTRATION_PREFIX_LENGTH>(
        decoded_subject,
        0,
        REGISTRATION_PREFIX_LENGTH,
    );

    if extracted_registration_prefix.storage == registration_prefix {
        operation_type = 1;
    } else {
        // Check if it matches recipient update prefix
        let extracted_recipient_update_prefix = extract_bytes::<MAX_DECODED_SUBJECT_LENGTH, RECIPIENT_UPDATE_PREFIX_LENGTH>(
            decoded_subject,
            0,
            RECIPIENT_UPDATE_PREFIX_LENGTH,
        );

        if extracted_recipient_update_prefix.storage == recipient_update_prefix {
            operation_type = 2;
        }
    }

    assert(operation_type != 0, "Invalid subject prefix");

    /* -------------------------------------------------------------------------- */
    /*                                Extract title                               */
    /* -------------------------------------------------------------------------- */
    let prefix_length = if operation_type == 1 {
        REGISTRATION_PREFIX_LENGTH
    } else {
        RECIPIENT_UPDATE_PREFIX_LENGTH
    };

    // Check the title appears in the latter half of the decoded subject
    assert(
        (title_seq.index >= prefix_length) & (title_seq.end_index() == decoded_subject.len()),
        "Invalid title sequence",
    );

    // todo: Check the title contains no spaces or breaks
    // todo: Check the character before the title is a space or a (full-width) colon.

    // Extract the title from the decoded_subject
    let title: BoundedVec<u8, MAX_TITLE_LENGTH> = extract_bytes::<MAX_DECODED_SUBJECT_LENGTH, MAX_TITLE_LENGTH>(
        decoded_subject,
        title_seq.index,
        title_seq.length,
    );

    (operation_type, title)
}

fn decode_encoded_words<let MAX_EMAIL_HEADER_LENGTH: u32, let MAX_DECODED_SUBJECT_LENGTH: u32, let MAX_ENCODED_WORDS: u32>(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    subject_seq: Sequence,
    encoded_word_seqs: [Sequence; MAX_ENCODED_WORDS],
) -> BoundedVec<u8, MAX_DECODED_SUBJECT_LENGTH> {
    let mut decoded_concatenated: BoundedVec<u8, MAX_DECODED_SUBJECT_LENGTH> = BoundedVec::new();

    for i in 0..MAX_ENCODED_WORDS {
        let seq = encoded_word_seqs[i];

        // If sequence has zero length, it's unused (we've reached the end)
        if seq.length > 0 {
            // Validate sequence is within subject_value bounds
            assert(
                seq.index >= subject_seq.index
                    & seq.end_index() <= subject_seq.end_index()
                    & seq.length <= MAX_ENCODED_WORD_LENGTH,
                "Encoded word sequence out of bounds",
            );

            // Extract base64 bytes from this encoded-word (without padding)
            let base64_part = extract_bytes::<MAX_EMAIL_HEADER_LENGTH, MAX_ENCODED_WORD_LENGTH>(
                header,
                seq.index,
                seq.length,
            );

            // Decode this encoded-word using no-pad decoder
            let decoded_part = BASE64_NO_PAD_DECODER::decode_var::<MAX_ENCODED_WORD_LENGTH, MAX_DECODED_LENGTH>(
                base64_part,
            );

            // Append decoded bytes to concatenated result
            for j in 0..MAX_DECODED_LENGTH {
                if j < decoded_part.len() {
                    decoded_concatenated.push(decoded_part.get_unchecked(j));
                }
            }
        }
    }

    decoded_concatenated
}

fn extract_bytes<let MAX_CONTENT_LENGTH: u32, let MAX_EXTRACTION_LENGTH: u32>(
    content: BoundedVec<u8, MAX_CONTENT_LENGTH>,
    start_index: u32,
    length: u32,
) -> BoundedVec<u8, MAX_EXTRACTION_LENGTH> {
    let mut result: BoundedVec<u8, MAX_EXTRACTION_LENGTH> = BoundedVec::new();
    let end_index = start_index + length;

    for i in 0..MAX_EXTRACTION_LENGTH {
        let index = start_index + i;
        if index < end_index {
            result.set_unchecked(i, content.get_unchecked(index));
        }
    }

    result.len = length;
    result
}
