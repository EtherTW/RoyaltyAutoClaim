// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRegistrationVerifier} from "../../src/RegistrationVerifier.sol";

contract MockRegistrationVerifier is IRegistrationVerifier, Ownable {
    constructor() Ownable(msg.sender) {}

    function verify(
        string memory title,
        address recipient,
        Intention intention,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[12] calldata signals
    ) external view {}
}
