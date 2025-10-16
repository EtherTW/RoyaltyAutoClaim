pragma circom 2.1.6;
include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "./regex/email_senderRegex.circom";
include "./regex/subject_prefixRegex.circom";
include "./regex/body_idRegex.circom";
include "./regex/body_recipientRegex.circom";
template RoyaltyAutoClaim(maxHeaderLength, maxBodyLength, n, k, packSize) {
    assert(n * k > 1024); // constraints for 1024 bit RSA
    signal input emailHeader[maxHeaderLength]; // prehashed email data, includes up to 512 + 64 bytes of padding pre SHA256, and padded with lots of 0s at end after the length
    signal input emailHeaderLength;
    signal input pubkey[k]; // RSA pubkey, verified with smart contract + DNSSEC proof. Split up into k parts of n bits each.
    signal input signature[k]; // RSA signature. Split up into k parts of n bits each.
    signal input proverETHAddress;
    
    // DKIM Verification
    component EV = EmailVerifier(maxHeaderLength, maxBodyLength, n, k, 0, 0, 0, 1);
    EV.emailHeader <== emailHeader;
    EV.emailHeaderLength <== emailHeaderLength;
    EV.pubkey <== pubkey;
    EV.signature <== signature;
    
    signal input bodyHashIndex;
    signal input precomputedSHA[32];
    signal input emailBody[maxBodyLength];
    signal input emailBodyLength;
    EV.bodyHashIndex <== bodyHashIndex;
    EV.precomputedSHA <== precomputedSHA;
    EV.emailBody <== emailBody;
    EV.emailBodyLength <== emailBodyLength;
    
    signal input decodedEmailBodyIn[maxBodyLength];
    EV.decodedEmailBodyIn <== decodedEmailBodyIn;
    
    
    
    
    signal output pubkeyHash;
    pubkeyHash <== EV.pubkeyHash;
    
    
    // Used for nullifier later
    signal output headerHashHi <== EV.shaHi;
    signal output headerHashLo <== EV.shaLo;
    
    // EMAIL_SENDER Extraction
    
    var email_senderMaxLength = 20;
    signal input email_senderRegexIdx;
    
    signal email_senderRegexOut, email_senderRegexReveal[1088];
    (email_senderRegexOut, email_senderRegexReveal) <== email_senderRegex(maxHeaderLength)(emailHeader);
    email_senderRegexOut === 1;
    
    
    
    
    signal output email_senderPackedOut[computeIntChunkLength(email_senderMaxLength)];
    email_senderPackedOut <== PackRegexReveal(maxHeaderLength, email_senderMaxLength)(email_senderRegexReveal, email_senderRegexIdx);
    
    
    
    
    
    
    // SUBJECT_PREFIX Extraction
    
    var subject_prefixMaxLength = 52;
    signal input subject_prefixRegexIdx;
    
    signal subject_prefixRegexOut, subject_prefixRegexReveal[1088];
    (subject_prefixRegexOut, subject_prefixRegexReveal) <== subject_prefixRegex(maxHeaderLength)(emailHeader);
    subject_prefixRegexOut === 1;
    
    
    
    
    signal output subject_prefixPackedOut[computeIntChunkLength(subject_prefixMaxLength)];
    subject_prefixPackedOut <== PackRegexReveal(maxHeaderLength, subject_prefixMaxLength)(subject_prefixRegexReveal, subject_prefixRegexIdx);
    
    
    
    
    
    
    // BODY_ID Extraction
    
    var body_idMaxLength = 66;
    signal input body_idRegexIdx;
    
    signal body_idRegexOut, body_idRegexReveal[1024];
    (body_idRegexOut, body_idRegexReveal) <== body_idRegex(maxBodyLength)(decodedEmailBodyIn);
    body_idRegexOut === 1;
    
    
    
    
    signal output body_idPackedOut[computeIntChunkLength(body_idMaxLength)];
    body_idPackedOut <== PackRegexReveal(maxBodyLength, body_idMaxLength)(body_idRegexReveal, body_idRegexIdx);
    
    
    
    
    
    
    // BODY_RECIPIENT Extraction
    
    var body_recipientMaxLength = 42;
    signal input body_recipientRegexIdx;
    
    signal body_recipientRegexOut, body_recipientRegexReveal[1024];
    (body_recipientRegexOut, body_recipientRegexReveal) <== body_recipientRegex(maxBodyLength)(decodedEmailBodyIn);
    body_recipientRegexOut === 1;
    
    
    
    
    signal output body_recipientPackedOut[computeIntChunkLength(body_recipientMaxLength)];
    body_recipientPackedOut <== PackRegexReveal(maxBodyLength, body_recipientMaxLength)(body_recipientRegexReveal, body_recipientRegexIdx);
    
    
    
    
    
    
}
component main { public [proverETHAddress] } = RoyaltyAutoClaim(1088, 1024, 121, 17, 7);
