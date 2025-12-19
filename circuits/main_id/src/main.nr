use lib::{body::{get_id_hash, get_number, get_recipient_address}, subject::extract_subject};
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
    // dkim verification
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    pubkey: RSAPubkey<KEY_LIMBS_2048>,
    signature: [Field; KEY_LIMBS_2048],
    // body hash verification
    dkim_header_seq: Sequence,
    body: BoundedVec<u8, MAX_EMAIL_BODY_LENGTH>,
    body_hash_index: u32,
    // from address extraction
    from_header_seq: Sequence,
    from_address_seq: Sequence,
    // subject extraction
    subject_field_seq: Sequence,
    subject_seq: Sequence,
    encoded_word_seqs: [Sequence; MAX_ENCODED_WORDS],
    decoded_subject: BoundedVec<u8, MAX_DECODED_SUBJECT_LENGTH>,
    title_seq: Sequence,
    // body extraction
    number_field_seq: Sequence,
    number_seq: Sequence,
    recipient_field_seq: Sequence,
    recipient_seq: Sequence,
    id_field_seq: Sequence,
    id_seq: Sequence,
    // external input
    user_op_hash: [Field; 2],
    ) -> pub (Field, Field, BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH>, Field, BoundedVec<u8, MAX_TITLE_LENGTH>, u16, Field, [Field; 2], [Field; 2]) {
    // check the header and body lengths are within bounds
    assert(header.len() <= MAX_EMAIL_HEADER_LENGTH, "Header exceeds maximum length");
    assert(body.len() <= MAX_EMAIL_BODY_LENGTH, "Body exceeds maximum length");

    /* -------------------------------------------------------------------------- */
    /*                              DKIM Verification                             */
    /* -------------------------------------------------------------------------- */
    let header_hash = pubkey.verify_dkim_signature(header, signature);
    let pubkey_hash = pubkey.hash(); // Poseidon hash of public key
    let nullifier = pedersen_hash(signature); // Pedersen hash of signature

    /* -------------------------------------------------------------------------- */
    /*                           Body Hash Verification                           */
    /* -------------------------------------------------------------------------- */
    // extract the body hash from the header
    let signed_body_hash = get_body_hash(header, dkim_header_seq, body_hash_index);
    // compute the sha256 hash of the asserted body
    let computed_body_hash: [u8; 32] = sha256_var(body.storage, body.len() as u64);
    // constrain the computed body hash to match the one found in the header
    assert(
        signed_body_hash == computed_body_hash,
        "SHA256 hash computed over body does not match body hash found in DKIM-signed header",
    );

    /* -------------------------------------------------------------------------- */
    /*                           From Address Extraction                          */
    /* -------------------------------------------------------------------------- */
    let from = comptime { "from".as_bytes() };
    let from_address = get_email_address(header, from_header_seq, from_address_seq, from);

    /* -------------------------------------------------------------------------- */
    /*                           Subject Extraction                               */
    /* -------------------------------------------------------------------------- */
    let (operation_type, title) = extract_subject::<MAX_EMAIL_HEADER_LENGTH, MAX_DECODED_SUBJECT_LENGTH, MAX_TITLE_LENGTH, MAX_ENCODED_WORDS>(
        header,
        subject_field_seq,
        subject_seq,
        encoded_word_seqs,
        decoded_subject,
        title_seq,
    );

    /* -------------------------------------------------------------------------- */
    /*                               Body Extraction                              */
    /* -------------------------------------------------------------------------- */
    let number = get_number::<MAX_EMAIL_BODY_LENGTH>(body, number_field_seq, number_seq);
    let recipient =
        get_recipient_address::<MAX_EMAIL_BODY_LENGTH>(body, recipient_field_seq, recipient_seq);
    let id = get_id_hash::<MAX_EMAIL_BODY_LENGTH>(body, id_field_seq, id_seq);

    (
        pubkey_hash, nullifier, from_address, operation_type, title, number, recipient, id,
        user_op_hash,
    )
}
