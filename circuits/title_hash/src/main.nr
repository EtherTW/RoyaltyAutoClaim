use lib::{
    body::{get_number, get_recipient_address, get_title_hash},
    subject_prefix::get_operation_type,
};
use sha256::sha256_var;
use std::{collections::bounded_vec::BoundedVec, hash::pedersen_hash};
use zkemail::{
    dkim::RSAPubkey,
    headers::{body_hash::get_body_hash, email_address::get_email_address},
    KEY_LIMBS_2048,
    MAX_EMAIL_ADDRESS_LENGTH,
    Sequence,
};

global MAX_EMAIL_HEADER_LENGTH: u32 = 960;
global MAX_EMAIL_BODY_LENGTH: u32 = 1280;

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
    subject_prefix_seq: Sequence,
    // body extraction
    number_field_seq: Sequence,
    number_seq: Sequence,
    recipient_field_seq: Sequence,
    recipient_seq: Sequence,
    id_field_seq: Sequence,
    id_seq: Sequence,
    // external input
    user_op_hash: [Field; 2],
) -> pub ( //
Field, // pubkey_hash
Field, // nullifier
BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH>, // from_address
Field, // operation_type
Field, // number
Field, // recipient
[Field; 2], // title_hash
[Field; 2] // user_op_hash
) {
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
    let operation_type = get_operation_type::<MAX_EMAIL_HEADER_LENGTH>(
        header,
        subject_field_seq,
        subject_prefix_seq,
    );

    /* -------------------------------------------------------------------------- */
    /*                               Body Extraction                              */
    /* -------------------------------------------------------------------------- */
    let number = get_number::<MAX_EMAIL_BODY_LENGTH>(body, number_field_seq, number_seq);
    let recipient =
        get_recipient_address::<MAX_EMAIL_BODY_LENGTH>(body, recipient_field_seq, recipient_seq);
    let title_hash = get_title_hash::<MAX_EMAIL_BODY_LENGTH>(body, id_field_seq, id_seq);

    (
        pubkey_hash, nullifier, from_address, operation_type, number as Field, recipient,
        title_hash, user_op_hash,
    )
}
