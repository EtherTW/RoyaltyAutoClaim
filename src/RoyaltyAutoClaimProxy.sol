// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract RoyaltyAutoClaimProxy is ERC1967Proxy {
    constructor(address _implementation, bytes memory _data) payable ERC1967Proxy(_implementation, _data) {
        (bool success,) = _implementation.delegatecall(_data);
        require(success, "Initialization failed");
    }
}
