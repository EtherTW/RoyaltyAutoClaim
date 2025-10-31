// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {StringUtils} from "@zk-email/contracts/utils/StringUtils.sol";
import {IRegistrationVerifier, RegistrationVerifier} from "../src/RegistrationVerifier.sol";
import {MockDKIMRegistry} from "./utils/MockDKIMRegistry.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {ZKTest} from "./utils/ZKTest.sol";

/*

forge test test/RegistrationVerifier.t.sol -vvvv --skip test/RoyaltyAutoClaim/*

*/

contract RegistrationVerifierTest is ZKTest {
    using StringUtils for *;

    IDKIMRegistry public mockDKIMRegistry;
    RegistrationVerifier public registrationVerifier;

    function setUp() public {
        mockDKIMRegistry = new MockDKIMRegistry();
        registrationVerifier = new RegistrationVerifier(mockDKIMRegistry, keccak256("johnson86tw"));
    }

    /// @dev verifyProof is from zk-email generated verifier.sol
    function test_verifyProof() public view {
        assert(
            registrationVerifier.verifyProof(
                validRegistrationProof().a,
                validRegistrationProof().b,
                validRegistrationProof().c,
                validRegistrationProof().signals
            )
        );
        assert(
            !registrationVerifier.verifyProof(
                invalidRecipientUpdateProof().a,
                invalidRecipientUpdateProof().b,
                invalidRecipientUpdateProof().c,
                invalidRecipientUpdateProof().signals
            )
        );
        assert(
            registrationVerifier.verifyProof(
                validRecipientUpdateProof().a,
                validRecipientUpdateProof().b,
                validRecipientUpdateProof().c,
                validRecipientUpdateProof().signals
            )
        );
        assert(
            !registrationVerifier.verifyProof(
                invalidRecipientUpdateProof().a,
                invalidRecipientUpdateProof().b,
                invalidRecipientUpdateProof().c,
                invalidRecipientUpdateProof().signals
            )
        );
    }

    function test_verify() public view {
        // valid proof
        assert(
            registrationVerifier.verify(
                TITLE,
                RECIPIENT,
                REGISTRATION_HEADER_HASH,
                IRegistrationVerifier.Intention.REGISTRATION,
                validRegistrationProof()
            )
        );

        // invalid proof
        assertFalse(
            registrationVerifier.verify(
                TITLE,
                RECIPIENT,
                REGISTRATION_HEADER_HASH,
                IRegistrationVerifier.Intention.REGISTRATION,
                invalidRegistrationProof()
            )
        );
    }

    function test_verifyUserOpHash() public view {
        // valid userOpHash
        assert(registrationVerifier.verifyUserOpHash(validRegistrationProof(), USER_OP_HASH));

        // invalid userOpHash
        assertFalse(
            registrationVerifier.verifyUserOpHash(validRegistrationProof(), keccak256(bytes(unicode"fake-userOpHash")))
        );
    }
}
