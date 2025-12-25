// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library TitleHashVerifierLib {
    struct EmailProof {
        bytes proof;
        bytes32[] publicInputs;
    }

    /// @dev Public inputs structure from Noir circuit:
    ///      [0]: pubkey_hash - Poseidon hash of DKIM public key
    ///      [1]: nullifier - Pedersen hash of signature
    ///      [2-321]: from_address.storage (320 bytes)
    ///      [322]: from_address.len
    ///      [323]: operation_type
    ///      [324]: number
    ///      [325]: recipient
    ///      [326]: title_hash.upper
    ///      [327]: title_hash.lower
    ///      [328]: user_op_hash.upper
    ///      [329]: user_op_hash.lower
    uint256 private constant PUBKEY_HASH_INDEX = 0;
    uint256 private constant NULLIFIER_INDEX = 1;
    uint256 private constant FROM_ADDRESS_START_INDEX = 2;
    uint256 private constant FROM_ADDRESS_LEN_INDEX = 322;
    uint256 private constant OPERATION_TYPE_INDEX = 323;
    uint256 private constant NUMBER_INDEX = 324;
    uint256 private constant RECIPIENT_INDEX = 325;
    uint256 private constant TITLE_HASH_UPPER_INDEX = 326;
    uint256 private constant TITLE_HASH_LOWER_INDEX = 327;
    uint256 private constant USER_OP_HASH_UPPER_INDEX = 328;
    uint256 private constant USER_OP_HASH_LOWER_INDEX = 329;

    uint256 private constant MAX_FROM_ADDRESS_LEN = 320;

    enum OperationType {
        ERROR, // = 0
        REGISTRATION, // = 1
        RECIPIENT_UPDATE // = 2
    }

    error FromAddressTooLong();
    error InvalidOperationType();

    function pubkeyHash(EmailProof memory _proof) internal pure returns (bytes32) {
        return _proof.publicInputs[PUBKEY_HASH_INDEX];
    }

    function nullifier(EmailProof memory _proof) internal pure returns (bytes32) {
        return _proof.publicInputs[NULLIFIER_INDEX];
    }

    function fromAddress(EmailProof memory _proof) internal pure returns (string memory) {
        uint256 len = uint256(_proof.publicInputs[FROM_ADDRESS_LEN_INDEX]);
        if (len > MAX_FROM_ADDRESS_LEN) {
            revert FromAddressTooLong();
        }

        bytes memory _fromAddress = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            _fromAddress[i] = bytes1(uint8(uint256(_proof.publicInputs[FROM_ADDRESS_START_INDEX + i])));
        }

        return string(_fromAddress);
    }

    function operationType(EmailProof memory _proof) internal pure returns (OperationType) {
        uint256 _operationType = uint256(_proof.publicInputs[OPERATION_TYPE_INDEX]);
        if (
            _operationType != uint256(OperationType.REGISTRATION)
                && _operationType != uint256(OperationType.RECIPIENT_UPDATE)
        ) {
            revert InvalidOperationType();
        }
        return OperationType(_operationType);
    }

    function number(EmailProof memory _proof) internal pure returns (uint256) {
        return uint256(_proof.publicInputs[NUMBER_INDEX]);
    }

    function recipient(EmailProof memory _proof) internal pure returns (address) {
        return address(uint160(uint256(_proof.publicInputs[RECIPIENT_INDEX])));
    }

    function titleHash(EmailProof memory _proof) internal pure returns (bytes32) {
        return bytes32(
            uint256(_proof.publicInputs[TITLE_HASH_UPPER_INDEX]) << 128
                | uint256(_proof.publicInputs[TITLE_HASH_LOWER_INDEX])
        );
    }

    function userOpHash(EmailProof memory _proof) internal pure returns (bytes32) {
        return bytes32(
            uint256(_proof.publicInputs[USER_OP_HASH_UPPER_INDEX]) << 128
                | uint256(_proof.publicInputs[USER_OP_HASH_LOWER_INDEX])
        );
    }
}
