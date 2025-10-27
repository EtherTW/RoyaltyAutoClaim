// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {RegistrationVerifier} from "../../src/RegistrationVerifier.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {Verifier} from "../../circuits/verifier.sol";

contract MockRegistrationVerifier is RegistrationVerifier {
    constructor()
        RegistrationVerifier(
            IDKIMRegistry(0xA4896a3F93bf4bf58378e579f3Cf193bB4Af1022),
            Verifier(0xA4896a3F93bf4bf58378e579f3Cf193bB4Af1022),
            "testEmailSender"
        )
    {}

    function verify(string memory title, address recipient, Intention intention, ZKEmailProof calldata proof)
        external
        view
        override
    {}
}
