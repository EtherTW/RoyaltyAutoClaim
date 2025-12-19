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

// Constants
global MAX_SUBJECT_FIELD_LENGTH: u32 = 256;
global MAX_ENCODED_WORD_LENGTH: u32 = 128; // Each individual encoded word max length
global MAX_DECODED_LENGTH: u32 = 96; // Each individual decoded word max length (base64 decode: 128 * 3/4 = 96)

// MIME encoding prefix: "=?UTF-8?B?"
global MIME_ENCODING_PREFIX_LENGTH: u32 = 10;

global REGISTRATION_PREFIX_LENGTH: u32 = 23;
global RECIPIENT_UPDATE_PREFIX_LENGTH: u32 = 41;

pub fn extract_subject<let MAX_EMAIL_HEADER_LENGTH: u32, let MAX_DECODED_SUBJECT_LENGTH: u32, let MAX_TITLE_LENGTH: u32, let MAX_ENCODED_WORDS: u32>(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    subject_field_seq: Sequence,
    subject_seq: Sequence,
    encoded_word_seqs: [Sequence; MAX_ENCODED_WORDS],
    decoded_subject: BoundedVec<u8, MAX_DECODED_SUBJECT_LENGTH>,
    title_seq: Sequence,
) -> (Field, BoundedVec<u8, MAX_TITLE_LENGTH>) {
    // Validate Subject header field exists
    let subject_field_name = comptime { "subject".as_bytes() };
    constrain_header_field::<MAX_EMAIL_HEADER_LENGTH, MAX_SUBJECT_FIELD_LENGTH, 7>(
        header,
        subject_field_seq,
        subject_field_name,
    );

    // Validate subject value is within subject header and has proper MIME encoding
    assert(
        subject_seq.index >= subject_field_seq.index
            & subject_seq.end_index() <= subject_field_seq.end_index(),
        "subject_seq out of bounds",
    );

    // Validate MIME encoding prefix exists at the start of subject value
    // This ensures the subject is encoded, even if split across multiple encoded-words
    let mime_prefix: [u8; MIME_ENCODING_PREFIX_LENGTH] = comptime { "=?UTF-8?B?".as_bytes() };
    let computed_mime_prefix = extract_bytes::<MAX_EMAIL_HEADER_LENGTH, MIME_ENCODING_PREFIX_LENGTH>(
        header,
        subject_seq.index,
        MIME_ENCODING_PREFIX_LENGTH,
    );

    assert(computed_mime_prefix.storage == mime_prefix, "Invalid MIME encoding prefix");

    /* -------------------------------------------------------------------------- */
    /*                               Base64 decoding                              */
    /* -------------------------------------------------------------------------- */

    // Safety: Decodes base64 encoded-words from email subject.
    // The decoded result is immediately constrained by asserting it matches
    // the provided decoded_subject input, ensuring correctness.
    let decoded_concatenated = unsafe {
        decode_encoded_words::<MAX_EMAIL_HEADER_LENGTH, MAX_DECODED_SUBJECT_LENGTH, MAX_ENCODED_WORDS>(
            header,
            subject_seq,
            encoded_word_seqs,
        )
    };

    // Constrain the concatenated decoded bytes to match the given decoded_subject
    assert(
        decoded_concatenated == decoded_subject,
        "Decoded subject does not match the given decoded_subject",
    );

    /* -------------------------------------------------------------------------- */
    /*                         identify the operation type                        */
    /* -------------------------------------------------------------------------- */
    // Registration prefix
    let registration_prefix: [u8; REGISTRATION_PREFIX_LENGTH] = comptime { "確認已收到投稿: ".as_bytes() };

    // Recipient update prefix
    let recipient_update_prefix: [u8; RECIPIENT_UPDATE_PREFIX_LENGTH] =
        comptime { "確認此投稿更改稿費收取地址: ".as_bytes() };

    // Check if it matches recipient update prefix (longer one first)
    let computed_recipient_update_prefix = extract_bytes::<MAX_DECODED_SUBJECT_LENGTH, RECIPIENT_UPDATE_PREFIX_LENGTH>(
        decoded_subject,
        0,
        RECIPIENT_UPDATE_PREFIX_LENGTH,
    );

    let mut is_recipient_update = false;

    if computed_recipient_update_prefix.storage == recipient_update_prefix {
        is_recipient_update = true;
    }

    // check registration prefix
    let computed_registration_prefix = extract_bytes::<MAX_DECODED_SUBJECT_LENGTH, REGISTRATION_PREFIX_LENGTH>(
        decoded_subject,
        0,
        REGISTRATION_PREFIX_LENGTH,
    );

    // If not recipient update, check registration prefix
    let mut is_registration = false;
    if computed_registration_prefix.storage == registration_prefix {
        is_registration = true;
    }

    // Return operation type
    assert(is_recipient_update | is_registration, "Invalid subject prefix");
    let operation_type = if is_recipient_update {
        2 // Recipient update
    } else {
        1 // Registration
    };

    /* -------------------------------------------------------------------------- */
    /*                                Extract title                               */
    /* -------------------------------------------------------------------------- */
    let prefix_length = if is_recipient_update {
        RECIPIENT_UPDATE_PREFIX_LENGTH
    } else {
        REGISTRATION_PREFIX_LENGTH
    };

    // Validate that title_seq points to the title within decoded_subject
    assert(
        title_seq.index >= prefix_length
            & title_seq.end_index() <= decoded_subject.len()
            & title_seq.length > 0
            & title_seq.length <= MAX_TITLE_LENGTH,
        "Title sequence invalid",
    );

    // Extract the title bytes from the decoded_subject
    let title: BoundedVec<u8, MAX_TITLE_LENGTH> = extract_bytes::<MAX_DECODED_SUBJECT_LENGTH, MAX_TITLE_LENGTH>(
        decoded_subject,
        title_seq.index,
        title_seq.length,
    );

    (operation_type, title)
}

unconstrained fn decode_encoded_words<let MAX_EMAIL_HEADER_LENGTH: u32, let MAX_DECODED_SUBJECT_LENGTH: u32, let MAX_ENCODED_WORDS: u32>(
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
