pragma circom 2.1.6;

include "./body_no_regex.circom";
include "@zk-email/circuits/utils/regex.circom";

template Main(msg_bytes) {
    signal input msg[msg_bytes];

    var body_noMaxLength = 10;
    signal input body_noRegexIdx;

    signal body_noRegexOut, body_noRegexReveal[msg_bytes];
    (body_noRegexOut, body_noRegexReveal) <== BodyNoRegex(msg_bytes)(msg);
    body_noRegexOut === 1;

    signal output body_noPackedOut[computeIntChunkLength(body_noMaxLength)];
    body_noPackedOut <== PackRegexReveal(msg_bytes, body_noMaxLength)(body_noRegexReveal, body_noRegexIdx);
}

component main = Main(128);