// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {StringUtils} from "@zk-email/contracts/utils/StringUtils.sol";
import {Verifier} from "../circuits/verifier.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IRegistrationVerifier {
    error ZeroAddress();
    error EmptyString();
    error InvalidRSAPublicKey(bytes32 publicKeyHash);
    error InvalidProof();
    error EmailSenderMismatch(string expected, string actual);
    error SubjectPrefixMismatch(string expected, string actual);
    error InvalidIntention(Intention intention);
    error TitleIdMismatch(bytes32 expected, string actual);
    error RecipientAddressMismatch(address expected, string actual);

    enum Intention {
        REGISTRATION,
        RECIPIENT_UPDATE
    }

    struct ZKEmailProof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256[12] signals;
    }

    function verify(string memory title, address recipient, Intention intention, ZKEmailProof calldata proof)
        external
        view;

    function parseSignals(uint256[12] calldata signals)
        external
        pure
        returns (
            bytes32 _pubkeyHash,
            bytes32 _headerHash,
            string memory _emailSender,
            string memory _subjectPrefix,
            string memory _id,
            string memory _recipient
        );

    function decodeRegistrationData(bytes calldata data)
        external
        pure
        returns (string memory title, address recipient, ZKEmailProof memory proof);
}

contract RegistrationVerifier is IRegistrationVerifier, Ownable {
    using StringUtils for *;

    string public constant DOMAIN = "gmail.com";
    string public constant REGISTRATION_PREFIX = "56K66KqN5bey5pS25Yiw5oqV56i/"; // base64 version of 確認已收到投稿
    string public constant RECIPIENT_UPDATE_PREFIX = "56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2A"; // base64 version of 確認此投稿更改稿費收取地址

    IDKIMRegistry public dkimRegistry;
    Verifier public verifier;
    string public emailSender = "";

    constructor(IDKIMRegistry _dkimRegistry, Verifier _verifier, string memory _emailSender) Ownable(msg.sender) {
        require(address(_dkimRegistry) != address(0), ZeroAddress());
        require(address(_verifier) != address(0), ZeroAddress());
        require(bytes(_emailSender).length > 0, EmptyString());

        dkimRegistry = _dkimRegistry;
        verifier = _verifier;
        emailSender = _emailSender;
    }

    function verify(string memory title, address recipient, Intention intention, ZKEmailProof calldata proof)
        external
        view
        virtual
    {
        // verify RSA
        bytes32 ph = bytes32(proof.signals[0]);
        if (!dkimRegistry.isDKIMPublicKeyHashValid(DOMAIN, ph)) {
            revert InvalidRSAPublicKey(ph);
        }

        // verify proof
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, proof.signals)) {
            revert InvalidProof();
        }

        (
            ,,
            string memory _emailSender,
            string memory _subjectPrefix,
            string memory _idStr,
            string memory _recipientStr
        ) = this.parseSignals(proof.signals);

        // verify email sender
        if (!emailSender.stringEq(_emailSender)) {
            revert EmailSenderMismatch(emailSender, _emailSender);
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
            revert TitleIdMismatch(titleHash, _idStr);
        }

        // verify recipient
        if (!recipient.toString().stringEq(_recipientStr.lower())) {
            revert RecipientAddressMismatch(recipient, _recipientStr);
        }
    }

    function parseSignals(uint256[12] calldata signals)
        external
        pure
        returns (
            bytes32 _pubkeyHash,
            bytes32 _headerHash,
            string memory _emailSender,
            string memory _subjectPrefix,
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
    }

    function decodeRegistrationData(bytes calldata data)
        external
        pure
        returns (string memory title, address recipient, ZKEmailProof memory proof)
    {
        (title, recipient, proof) = abi.decode(data, (string, address, ZKEmailProof));
        proof = ZKEmailProof(proof.a, proof.b, proof.c, proof.signals);
    }
}
