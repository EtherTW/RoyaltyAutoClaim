// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {StringUtils} from "@zk-email/contracts/utils/StringUtils.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Verifier} from "../circuits/verifier.sol";

interface IRegistrationVerifier {
    error ZeroAddress();
    error InvalidEmailSender(bytes32 emailSender);
    error InvalidDKIMPublicKey(bytes32 publicKeyHash);
    error EmailHeaderHashMismatch(bytes32 expected, bytes32 actual);
    error EmailSenderMismatch(bytes32 expected, string actual);
    error InvalidSubjectPrefix(Intention intention, uint256 actual0, uint256 actual1);
    error InvalidIntention(Intention intention);
    error TitleHashMismatch(bytes32 expected, string actual);
    error RecipientAddressMismatch(address expected, string actual);

    enum Intention {
        REGISTRATION,
        RECIPIENT_UPDATE
    }

    struct ZkEmailProof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256[15] signals;
    }

    function verify(
        string memory title,
        address recipient,
        bytes32 headerHash,
        Intention intention,
        ZkEmailProof calldata proof
    ) external view returns (bool);

    function verifyUserOpHash(ZkEmailProof calldata proof, bytes32 userOpHash) external pure returns (bool);
}

contract RegistrationVerifier is IRegistrationVerifier, Verifier, Ownable {
    using StringUtils for *;

    string public constant DOMAIN = "gmail.com";
    bytes32 public immutable EMAIL_SENDER;

    uint256 public constant REGISTRATION_SUBJECT_PREFIX_SIGNAL_0 =
        4992959312512230116538335825132076927052637790830533900315071821365;
    uint256 public constant REGISTRATION_SUBJECT_PREFIX_SIGNAL_1 = 0;
    uint256 public constant RECIPIENT_UPDATE_SUBJECT_PREFIX_SIGNAL_0 =
        185893070597506392968176665448466928770679305951148005942719960109701346869;
    uint256 public constant RECIPIENT_UPDATE_SUBJECT_PREFIX_SIGNAL_1 =
        95285067689723810438499876746722580514607937107503;

    IDKIMRegistry public dkimRegistry;

    /// @dev The reason this contract needs to have an owner is that
    /// UserOverrideableDKIMRegistry.isDKIMPublicKeyHashValid calls owner() on msg.sender.
    /// See https://vscode.blockscan.com/8453/0x0537487ff990df53b29bd3e4b4a4c5c80c17f958
    constructor(IDKIMRegistry _dkimRegistry, bytes32 _emailSender) Ownable(msg.sender) {
        require(address(_dkimRegistry) != address(0), ZeroAddress());
        require(_emailSender != bytes32(0), InvalidEmailSender(_emailSender));

        dkimRegistry = _dkimRegistry;
        EMAIL_SENDER = _emailSender;
    }

    function verify(
        string memory title,
        address recipient,
        bytes32 headerHash,
        Intention intention,
        ZkEmailProof calldata proof
    ) external view virtual returns (bool) {
        // revert if signal mismatch
        _requireSignalMatch(title, recipient, headerHash, intention, proof);

        // verify proof
        if (!verifyProof(proof.a, proof.b, proof.c, proof.signals)) {
            return false;
        }

        return true;
    }

    function verifyUserOpHash(ZkEmailProof calldata proof, bytes32 userOpHash)
        external
        pure
        virtual
        returns (bool)
    {
        string memory userOpHashStr = _parseUserOpHashStr(proof);
        return userOpHash.toString().stringEq(userOpHashStr.lower());
    }

    function _requireSignalMatch(
        string memory title,
        address recipient,
        bytes32 headerHash,
        Intention intention,
        ZkEmailProof calldata proof
    ) internal view {
        (
            bytes32 _pubkeyHash,
            bytes32 _headerHash,
            string memory _emailSender,
            string memory _idStr,
            string memory _recipientStr
        ) = _parseSignals(proof.signals);

        // verify DKIM public key
        if (!dkimRegistry.isDKIMPublicKeyHashValid(DOMAIN, _pubkeyHash)) {
            revert InvalidDKIMPublicKey(_pubkeyHash);
        }

        // verify header hash
        if (headerHash != _headerHash) {
            revert EmailHeaderHashMismatch(headerHash, _headerHash);
        }

        // verify email sender
        if (EMAIL_SENDER != keccak256(bytes(_emailSender))) {
            revert EmailSenderMismatch(EMAIL_SENDER, _emailSender);
        }

        // verify subject prefix
        if (intention == Intention.REGISTRATION) {
            if (
                proof.signals[4] != REGISTRATION_SUBJECT_PREFIX_SIGNAL_0
                    && proof.signals[5] != REGISTRATION_SUBJECT_PREFIX_SIGNAL_1
            ) {
                revert InvalidSubjectPrefix(intention, proof.signals[4], proof.signals[5]);
            }
        } else if (intention == Intention.RECIPIENT_UPDATE) {
            if (
                proof.signals[4] != RECIPIENT_UPDATE_SUBJECT_PREFIX_SIGNAL_0
                    && proof.signals[5] != RECIPIENT_UPDATE_SUBJECT_PREFIX_SIGNAL_1
            ) {
                revert InvalidSubjectPrefix(intention, proof.signals[4], proof.signals[5]);
            }
        } else {
            revert InvalidIntention(intention);
        }

        // verify title hash
        bytes32 titleHash = keccak256(abi.encodePacked(title));
        if (!titleHash.toString().stringEq(_idStr.lower())) {
            revert TitleHashMismatch(titleHash, _idStr);
        }

        // verify recipient
        if (!recipient.toString().stringEq(_recipientStr.lower())) {
            revert RecipientAddressMismatch(recipient, _recipientStr);
        }
    }

    function _parseSignals(uint256[15] calldata signals)
        internal
        pure
        returns (
            bytes32 _pubkeyHash,
            bytes32 _headerHash,
            string memory _emailSender,
            string memory _id,
            string memory _recipient
        )
    {
        _pubkeyHash = bytes32(signals[0]);

        uint256 headerHashHi = signals[1];
        uint256 headerHashLo = signals[2];
        _headerHash = bytes32((headerHashHi << 128) | headerHashLo);

        uint256[] memory _emailSenderList = new uint256[](1);
        _emailSenderList[0] = signals[3];
        _emailSender = _emailSenderList.convertPackedBytesToString();

        // Note that signals[4] and signals[5] is subject prefix

        uint256[] memory idList = new uint256[](3);
        idList[0] = signals[6];
        idList[1] = signals[7];
        idList[2] = signals[8];
        _id = idList.convertPackedBytesToString();

        uint256[] memory recipientList = new uint256[](2);
        recipientList[0] = signals[9];
        recipientList[1] = signals[10];
        _recipient = recipientList.convertPackedBytesToString();

        // Note that signals[11] is zkemail default public output: proverETHAddress; See circuits/circuit.circom
    }

    function _parseUserOpHashStr(ZkEmailProof calldata proof) internal pure returns (string memory _userOpHashStr) {
        uint256[] memory userOpHashList = new uint256[](3);
        userOpHashList[0] = proof.signals[12];
        userOpHashList[1] = proof.signals[13];
        userOpHashList[2] = proof.signals[14];
        _userOpHashStr = userOpHashList.convertPackedBytesToString();
    }
}
