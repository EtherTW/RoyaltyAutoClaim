// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import "@zk-email/contracts/utils/StringUtils.sol";
import "../circuits/verifier.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IRegistrationVerifier {
    enum Intention {
        REGISTRATION,
        RECIPIENT_UPDATE
    }

    function verify(
        string memory title,
        address recipient,
        Intention intention,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[12] calldata signals
    ) external view;
}

contract RegistrationVerifier is IRegistrationVerifier, Ownable {
    using StringUtils for *;

    string public constant domain = "gmail.com";
    string public constant registrationPrefix = "56K66KqN5bey5pS25Yiw5oqV56i/"; // 確認已收到投稿
    string public constant recipientUpdatePrefix = "56K66KqN5q2k5oqV56i/5pu05pS556i/6LK75pS25Y+W5Zyw5Z2A"; // 確認此投稿更改稿費收取地址

    IDKIMRegistry public dkimRegistry;
    Verifier public verifier;
    string public sender = "";

    constructor(IDKIMRegistry _dkimRegistry, Verifier _verifier, string memory _sender) Ownable(msg.sender) {
        dkimRegistry = _dkimRegistry;
        verifier = _verifier;
        sender = _sender;
    }

    function verify(
        string memory title,
        address recipient,
        Intention intention,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[12] calldata signals
    ) external view {
        // verify RSA
        bytes32 ph = bytes32(signals[0]);
        require(dkimRegistry.isDKIMPublicKeyHashValid(domain, ph), "RSA public key incorrect");

        // verify proof
        require(verifier.verifyProof(a, b, c, signals), "Invalid proof");

        (,, string memory emailSender, string memory subjectPrefix, string memory idStr, string memory recipientStr) =
            parseSignals(signals);

        // verify email sender
        require(emailSender.stringEq(sender), "Email sender mismatch");

        // verify subject prefix
        if (intention == Intention.REGISTRATION) {
            require(subjectPrefix.stringEq(registrationPrefix), "Subject prefix mismatch for registration");
        } else if (intention == Intention.RECIPIENT_UPDATE) {
            require(subjectPrefix.stringEq(recipientUpdatePrefix), "Subject prefix mismatch for recipient update");
        } else {
            revert("Invalid intention");
        }

        // verify title as id
        bytes32 titleHash = keccak256(abi.encodePacked(title));
        require(titleHash.toString().stringEq(idStr.lower()), "Title and ID mismatch");

        // verify recipient
        require(recipient.toString().stringEq(recipientStr.lower()), "Recipient address mismatch");
    }

    function parseSignals(uint256[12] calldata signals)
        public
        pure
        returns (
            bytes32 pubkeyHash,
            bytes32 headerHash,
            string memory emailSender,
            string memory subjectPrefix,
            string memory id,
            string memory recipient
        )
    {
        pubkeyHash = bytes32(signals[0]);

        uint256 headerHashHi = signals[1];
        uint256 headerHashLo = signals[2];
        headerHash = bytes32((headerHashHi << 128) | headerHashLo);

        uint256[] memory _emailSender = new uint256[](1);
        _emailSender[0] = signals[3];
        emailSender = _emailSender.convertPackedBytesToString();

        uint256[] memory _subjectPrefix = new uint256[](2);
        _subjectPrefix[0] = signals[4];
        _subjectPrefix[1] = signals[5];
        subjectPrefix = _subjectPrefix.convertPackedBytesToString();

        uint256[] memory _id = new uint256[](3);
        _id[0] = signals[6];
        _id[1] = signals[7];
        _id[2] = signals[8];
        id = _id.convertPackedBytesToString();

        uint256[] memory _recipient = new uint256[](2);
        _recipient[0] = signals[9];
        _recipient[1] = signals[10];
        recipient = _recipient.convertPackedBytesToString();
    }
}
