// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {RegistrationVerifier} from "../../src/RegistrationVerifier.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";

contract MockRegistrationVerifier is RegistrationVerifier {
    constructor()
        RegistrationVerifier(IDKIMRegistry(0xA4896a3F93bf4bf58378e579f3Cf193bB4Af1022), keccak256("testEmailSender"))
    {}

    function verify(string memory, address, bytes32, Intention, ZkEmailProof calldata)
        external
        pure
        override
        returns (bool)
    {
        return true;
    }

    function verifyUserOpHash(ZkEmailProof calldata, bytes32) external pure override returns (bool) {
        return true;
    }
}
