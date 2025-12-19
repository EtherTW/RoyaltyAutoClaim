use lib::extract_subject;
use sha256::sha256_var;
use std::{collections::bounded_vec::BoundedVec, hash::pedersen_hash};
use zkemail::{
    dkim::RSAPubkey,
    headers::{body_hash::get_body_hash, email_address::get_email_address},
    KEY_LIMBS_2048,
    MAX_EMAIL_ADDRESS_LENGTH,
    Sequence,
};

global MAX_EMAIL_HEADER_LENGTH: u32 = 640;
global MAX_EMAIL_BODY_LENGTH: u32 = 1280;
global MAX_DECODED_SUBJECT_LENGTH: u32 = 192;
global MAX_TITLE_LENGTH: u32 = 256;

// Maximum number of encoded-words in a subject (RFC 2047)
global MAX_ENCODED_WORDS: u32 = 2;

fn main(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    pubkey: RSAPubkey<KEY_LIMBS_2048>,
    signature: [Field; KEY_LIMBS_2048],
    dkim_header_sequence: Sequence,
    body: BoundedVec<u8, MAX_EMAIL_BODY_LENGTH>,
    body_hash_index: u32,
    from_header_sequence: Sequence,
    from_address_sequence: Sequence,
    subject_header_sequence: Sequence,
    subject_value_sequence: Sequence,
    encoded_word_sequences: [Sequence; MAX_ENCODED_WORDS],
    decoded_subject: BoundedVec<u8, MAX_DECODED_SUBJECT_LENGTH>,
    title_sequence: Sequence,
    ) -> pub (Field, Field, BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH>, Field, BoundedVec<u8, MAX_TITLE_LENGTH>) {
    // check the header and body lengths are within bounds
    assert(header.len() <= MAX_EMAIL_HEADER_LENGTH, "Header exceeds maximum length");
    assert(body.len() <= MAX_EMAIL_BODY_LENGTH, "Body exceeds maximum length");

    /* -------------------------------------------------------------------------- */
    /*                              DKIM Verification                             */
    /* -------------------------------------------------------------------------- */
    let header_hash = pubkey.verify_dkim_signature(header, signature);
    let pubkey_hash = pubkey.hash(); // Poseidon hash of public key
    let email_nullifier = pedersen_hash(signature); // Pedersen hash of signature

    /* -------------------------------------------------------------------------- */
    /*                           Body Hash Verification                           */
    /* -------------------------------------------------------------------------- */
    // extract the body hash from the header
    let signed_body_hash = get_body_hash(header, dkim_header_sequence, body_hash_index);
    // compute the sha256 hash of the asserted body
    let computed_body_hash: [u8; 32] = sha256_var(body.storage, body.len() as u64);
    // constrain the computed body hash to match the one found in the header
    assert(
        signed_body_hash == computed_body_hash,
        "SHA256 hash computed over body does not match body hash found in DKIM-signed header",
    );

    /* -------------------------------------------------------------------------- */
    /*                        From Email Address Extraction                       */
    /* -------------------------------------------------------------------------- */
    let from = comptime { "from".as_bytes() };
    let from_address = get_email_address(header, from_header_sequence, from_address_sequence, from);

    /* -------------------------------------------------------------------------- */
    /*                           Subject Extraction                               */
    /* -------------------------------------------------------------------------- */
    let (operation_type, title) = extract_subject::extract_subject::<MAX_EMAIL_HEADER_LENGTH, MAX_DECODED_SUBJECT_LENGTH, MAX_TITLE_LENGTH, MAX_ENCODED_WORDS>(
        header,
        subject_header_sequence,
        subject_value_sequence,
        encoded_word_sequences,
        decoded_subject,
        title_sequence,
    );

    (pubkey_hash, email_nullifier, from_address, operation_type, title)
}
