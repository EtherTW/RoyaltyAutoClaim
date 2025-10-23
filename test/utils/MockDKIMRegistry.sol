// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";

contract MockDKIMRegistry is IDKIMRegistry {
    function isDKIMPublicKeyHashValid(string memory, bytes32) external pure returns (bool) {
        return true;
    }
}
