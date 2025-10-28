// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import {StringUtils} from "@zk-email/contracts/utils/StringUtils.sol";
import {IRegistrationVerifier, RegistrationVerifier} from "../src/RegistrationVerifier.sol";
import {MockDKIMRegistry} from "./utils/MockDKIMRegistry.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {ZKUtils} from "./utils/ZKUtils.sol";

/*

forge test test/RegistrationVerifier.t.sol -vvvv --skip test/RoyaltyAutoClaim/*

*/

contract RegistrationVerifierTest is Test {
    using StringUtils for *;
    using ZKUtils for *;

    IDKIMRegistry public mockDKIMRegistry;
    RegistrationVerifier public registrationVerifier;

    function setUp() public {
        mockDKIMRegistry = new MockDKIMRegistry();
        registrationVerifier = new RegistrationVerifier(mockDKIMRegistry, keccak256("johnson86tw"));
    }

    /**
     * forge test --mc RegistrationVerifierTest --mt test_verify -vvvv --skip test/RoyaltyAutoClaim/*
     */
    function test_verify() public view {
        IRegistrationVerifier.ZkEmailProof memory proof = ZKUtils.parseJsonProof();
        string memory title = unicode"隱私池的設計 by cc liang";
        address recipient = 0xd78B5013757Ea4A7841811eF770711e6248dC282;
        bytes32 headerHash = 0x86cbd6a1dcf53636ccfe282575446622847dba5be5bd08cc1d00b5e5f53243d5;

        registrationVerifier.verify(title, recipient, headerHash, IRegistrationVerifier.Intention.REGISTRATION, proof);
    }

    /**
     * forge test --mc RegistrationVerifierTest --mt test_verifyProof -vvvv --skip test/RoyaltyAutoClaim/*
     */
    function test_verifyProof() public view {
        IRegistrationVerifier.ZkEmailProof memory proof = ZKUtils.parseJsonProof();
        registrationVerifier.verifyProof(proof.a, proof.b, proof.c, proof.signals);
    }

    /**
     * forge test --mc RegistrationVerifierTest --mt test_parseSignals -vvvv --skip test/RoyaltyAutoClaim/*
     */
    function test_parseSignals() public view {
        IRegistrationVerifier.ZkEmailProof memory proof = ZKUtils.parseJsonProof();

        (
            bytes32 pubkeyHash,
            bytes32 headerHash,
            string memory emailSender,
            string memory subjectPrefix,
            string memory id,
            string memory recipient,
        ) = registrationVerifier.parseSignals(proof.signals);

        console.logBytes32(pubkeyHash);
        console.logBytes32(headerHash);
        console.log("emailSender:", emailSender);
        console.log("subjectPrefix:", subjectPrefix);
        console.log("id:", id);
        console.log("recipient:", recipient);
    }
}
