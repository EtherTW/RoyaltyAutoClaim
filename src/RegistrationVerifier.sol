// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {StringUtils} from "@zk-email/contracts/utils/StringUtils.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Verifier} from "../circuits/verifier.sol";

interface IRegistrationVerifier {
    error ZeroAddress();
    error EmptyString();
    error InvalidEmailSender(bytes32 emailSender);
    error InvalidDKIMPublicKey(bytes32 publicKeyHash);
    error InvalidProof();
    error EmailHeaderHashMismatch(bytes32 expected, bytes32 actual);
    error EmailSenderMismatch(bytes32 expected, string actual);
    error SubjectPrefixMismatch(string expected, string actual);
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
    ) external view;

    function verifyUserOpHash(bytes32 userOpHash, ZkEmailProof calldata proof) external view returns (bool);
}

contract RegistrationVerifier is IRegistrationVerifier, Verifier, Ownable {
    using StringUtils for *;

    string public constant DOMAIN = "gmail.com";
    string public constant REGISTRATION_PREFIX = "56K66KqN5bey5pS25Yiw5oqV56i/"; // base64 version of 確認已收到投稿
    string public constant RECIPIENT_UPDATE_PREFIX = "56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2A"; // base64 version of 確認此投稿更改稿費收取地址
    bytes32 public immutable EMAIL_SENDER;

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
    ) external view virtual {
        (
            bytes32 _pubkeyHash,
            bytes32 _headerHash,
            string memory _emailSender,
            string memory _subjectPrefix,
            string memory _idStr,
            string memory _recipientStr,
        ) = parseSignals(proof.signals);

        // verify DKIM public key
        if (!dkimRegistry.isDKIMPublicKeyHashValid(DOMAIN, _pubkeyHash)) {
            revert InvalidDKIMPublicKey(_pubkeyHash);
        }

        // verify proof
        if (!verifyProof(proof.a, proof.b, proof.c, proof.signals)) {
            revert InvalidProof();
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
            if (!_subjectPrefix.stringEq(REGISTRATION_PREFIX)) {
                revert SubjectPrefixMismatch(REGISTRATION_PREFIX, _subjectPrefix);
            }
        } else if (intention == Intention.RECIPIENT_UPDATE) {
            if (!_subjectPrefix.stringEq(RECIPIENT_UPDATE_PREFIX)) {
                revert SubjectPrefixMismatch(RECIPIENT_UPDATE_PREFIX, _subjectPrefix);
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

    function verifyUserOpHash(bytes32 userOpHash, ZkEmailProof calldata proof) external view virtual returns (bool) {
        (,,,,,, string memory _userOpHashStr) = parseSignals(proof.signals);
        if (!userOpHash.toString().stringEq(_userOpHashStr.lower())) {
            return false;
        }
        return true;
    }

    function parseSignals(uint256[15] calldata signals)
        public
        pure
        returns (
            bytes32 _pubkeyHash,
            bytes32 _headerHash,
            string memory _emailSender,
            string memory _subjectPrefix,
            string memory _id,
            string memory _recipient,
            string memory _userOpHash
        )
    {
        _pubkeyHash = bytes32(signals[0]);

        uint256 headerHashHi = signals[1];
        uint256 headerHashLo = signals[2];
        _headerHash = bytes32((headerHashHi << 128) | headerHashLo);

        uint256[] memory _emailSenderList = new uint256[](1);
        _emailSenderList[0] = signals[3];
        _emailSender = _emailSenderList.convertPackedBytesToString();

        uint256[] memory subjectPrefixList = new uint256[](2);
        subjectPrefixList[0] = signals[4];
        subjectPrefixList[1] = signals[5];
        _subjectPrefix = subjectPrefixList.convertPackedBytesToString();

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

        uint256[] memory userOpHashList = new uint256[](3);
        userOpHashList[0] = signals[12];
        userOpHashList[1] = signals[13];
        userOpHashList[2] = signals[14];
        _userOpHash = userOpHashList.convertPackedBytesToString();
    }
}
