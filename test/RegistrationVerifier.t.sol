// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {StringUtils} from "@zk-email/contracts/utils/StringUtils.sol";
import {IRegistrationVerifier, RegistrationVerifier} from "../src/RegistrationVerifier.sol";
import {MockDKIMRegistry} from "./utils/MockDKIMRegistry.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {Verifier} from "../circuits/verifier.sol";
import {ZKUtils} from "./utils/ZKUtils.sol";

/*

forge test test/RegistrationVerifier.t.sol -vvvv --skip test/RoyaltyAutoClaim/*

*/

contract RegistrationVerifierTest is Test {
    using StringUtils for *;
    using ZKUtils for *;

    IDKIMRegistry public dkimRegistry;
    IDKIMRegistry public mockDKIMRegistry;
    Verifier public verifier;
    RegistrationVerifier public rVerifier;

    function setUp() public {
        dkimRegistry = IDKIMRegistry(0x3D3935B3C030893f118a84C92C66dF1B9E4169d6);
        mockDKIMRegistry = new MockDKIMRegistry();
        verifier = new Verifier();
        rVerifier = new RegistrationVerifier(mockDKIMRegistry, verifier, "johnson86tw");
    }

    /**
     * forge test --mc RegistrationVerifierTest --mt test_verify -vvvv --skip test/RoyaltyAutoClaim/*
     */
    function test_verify() public view {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[12] memory signals) =
            ZKUtils.parseJsonProof();

        string memory title = unicode"隱私池的設計 by cc liang";
        address recipient = 0xd78B5013757Ea4A7841811eF770711e6248dC282;

        rVerifier.verify(title, recipient, IRegistrationVerifier.Intention.REGISTRATION, a, b, c, signals);
    }

    /**
     * forge test --mc RegistrationVerifierTest --mt test_verifyProof -vvvv --skip test/RoyaltyAutoClaim/*
     */
    function test_verifyProof() public view {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[12] memory signals) =
            ZKUtils.parseJsonProof();
        verifier.verifyProof(a, b, c, signals);
    }

    /**
     * forge test --mc RegistrationVerifierTest --mt test_parseSignals -vvvv --skip test/RoyaltyAutoClaim/*
     */
    function test_parseSignals() public view {
        (,,, uint256[12] memory signals) = ZKUtils.parseJsonProof();

        (
            bytes32 pubkeyHash,
            bytes32 headerHash,
            string memory emailSender,
            string memory subjectPrefix,
            string memory id,
            string memory recipient
        ) = rVerifier.parseSignals(signals);

        console.logBytes32(pubkeyHash);
        console.logBytes32(headerHash);
        console.log("emailSender:", emailSender);
        console.log("subjectPrefix:", subjectPrefix);
        console.log("id:", id);
        console.log("recipient:", recipient);
    }
}
