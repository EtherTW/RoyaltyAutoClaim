use std::collections::bounded_vec::BoundedVec;
use zkemail::{headers::constrain_header_field, Sequence};

global MAX_SUBJECT_FIELD_LENGTH: u32 = 256;
// global MIME_PREFIX_LENGTH: u32 = 10; // "=?UTF-8?B?"
global REGISTRATION_PREFIX_LENGTH: u32 = 29;
global RECIPIENT_UPDATE_PREFIX_LENGTH: u32 = 53;

pub fn get_operation_type<let MAX_EMAIL_HEADER_LENGTH: u32>(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    subject_field_seq: Sequence,
    subject_prefix_seq: Sequence,
) -> Field {
    // Check subject field exists
    let subject_field_name = comptime { "subject".as_bytes() };
    constrain_header_field::<MAX_EMAIL_HEADER_LENGTH, MAX_SUBJECT_FIELD_LENGTH, 7>(
        header,
        subject_field_seq,
        subject_field_name,
    );

    // Check subject_prefix is within subject field
    assert(
        subject_prefix_seq.index >= subject_field_seq.index
            & subject_prefix_seq.end_index() <= subject_field_seq.end_index(),
        "subject_prefix_seq out of bounds",
    );

    // Check length upfront
    assert(
        (subject_prefix_seq.length == REGISTRATION_PREFIX_LENGTH)
            | (subject_prefix_seq.length == RECIPIENT_UPDATE_PREFIX_LENGTH),
        "Invalid subject prefix length",
    );

    // todo: Check MIME prefix procede the start of subject prefix

    // Registration prefix
    let registration_prefix: [u8; REGISTRATION_PREFIX_LENGTH] =
        comptime { "56K66KqN5bey5pS25Yiw5oqV56i/O".as_bytes() };

    // Recipient update prefix
    let recipient_update_prefix: [u8; RECIPIENT_UPDATE_PREFIX_LENGTH] =
        comptime { "56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2AO".as_bytes() };

    let mut operation_type: Field = 0;
    if subject_prefix_seq.length == REGISTRATION_PREFIX_LENGTH {
        let extracted = extract_bytes::<MAX_EMAIL_HEADER_LENGTH, REGISTRATION_PREFIX_LENGTH>(
            header,
            subject_prefix_seq.index,
            subject_prefix_seq.length,
        );
        assert(extracted.storage == registration_prefix, "Invalid registration prefix");
        operation_type = 1;
    } else if subject_prefix_seq.length == RECIPIENT_UPDATE_PREFIX_LENGTH {
        let extracted = extract_bytes::<MAX_EMAIL_HEADER_LENGTH, RECIPIENT_UPDATE_PREFIX_LENGTH>(
            header,
            subject_prefix_seq.index,
            subject_prefix_seq.length,
        );
        assert(extracted.storage == recipient_update_prefix, "Invalid recipient update prefix");
        operation_type = 2;
    }

    operation_type
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
